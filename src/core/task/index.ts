import { ApiHandler, ApiProviderInfo } from "@core/api"
import { ApiStream } from "@core/api/transform/stream"
import { ToolUse } from "@core/assistant-message"
import { ContextManager } from "@core/context/context-management/ContextManager"

import { EnvironmentContextTracker } from "@core/context/context-tracking/EnvironmentContextTracker"
import { FileContextTracker } from "@core/context/context-tracking/FileContextTracker"
import { ModelContextTracker } from "@core/context/context-tracking/ModelContextTracker"

import { DiracIgnoreController } from "@core/ignore/DiracIgnoreController"
import { initializeMcpForTask } from "@core/mcp/bootstrap"
import { mcpClientManager } from "@core/mcp/McpClientManager"
import { CommandPermissionController } from "@core/permissions"
import { formatResponse } from "@core/prompts/responses"
import { WorkspaceRootManager } from "@core/workspace/WorkspaceRootManager"
import { HostProvider } from "@hosts/host-provider"
import { ICheckpointManager } from "@integrations/checkpoints/types"
import { DiffViewProvider } from "@integrations/editor/DiffViewProvider"
import { FileEditProvider } from "@integrations/editor/FileEditProvider"
import { processFilesIntoText } from "@integrations/misc/extract-text"
import { showSystemNotification } from "@integrations/notifications"
import { type CommandExecutionOptions, CommandExecutor, StandaloneTerminalManager } from "@integrations/terminal"
import { ITerminalManager } from "@integrations/terminal/types"
import { BrowserSession } from "@services/browser/BrowserSession"
import { UrlContentFetcher } from "@services/browser/UrlContentFetcher"
import { DiracAsk, DiracSay, MultiCommandState } from "@shared/ExtensionMessage"
import { HistoryItem } from "@shared/HistoryItem"
import { DiracContent, DiracToolResponseContent, DiracUserContent } from "@shared/messages/content"
import { DiracMessageModelInfo } from "@shared/messages/metrics"
import { Logger } from "@shared/services/Logger"
import { DiracDefaultTool } from "@shared/tools"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { AnchorStateManager } from "@utils/AnchorStateManager"
import { isParallelToolCallingEnabled } from "@utils/model-utils"
import fs from "fs/promises"
import Mutex from "p-mutex"
import * as path from "path"
import { ulid } from "ulid"
import { SkillMetadata } from "@/shared/skills"
import { Controller } from "../controller"
import { StateManager } from "../storage/StateManager"
import { AgentLoopRunner } from "./AgentLoopRunner"
import { ApiConversationManager } from "./ApiConversationManager"
import { ApiRequestHandler } from "./ApiRequestHandler"
import { ContextLoader } from "./ContextLoader"
import { EnvironmentManager } from "./EnvironmentManager"
import { HookManager } from "./HookManager"
import { LifecycleManager } from "./LifecycleManager"
import { MessageStateHandler } from "./message-state"
import { ResponseProcessor } from "./ResponseProcessor"
import { StreamResponseHandler } from "./StreamResponseHandler"
import type { TaskDependencies } from "./TaskDependencies"
import { buildTaskManagers, buildTaskServices } from "./TaskFactory"
import { TaskMessenger } from "./TaskMessenger"
import { TaskState } from "./TaskState"
import { ToolExecutor } from "./ToolExecutor"

export type ToolResponse = DiracToolResponseContent

type TaskParams = {
	controller: Controller
	updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
	postStateToWebview: () => Promise<void>
	reinitExistingTaskFromId: (taskId: string) => Promise<void>
	cancelTask: () => Promise<void>
	shellIntegrationTimeout: number
	terminalReuseEnabled: boolean
	terminalOutputLineLimit: number
	defaultTerminalProfile: string
	vscodeTerminalExecutionMode: "vscodeTerminal" | "backgroundExec"
	cwd: string
	stateManager: StateManager
	workspaceManager?: WorkspaceRootManager
	task?: string
	images?: string[]
	files?: string[]
	historyItem?: HistoryItem
	taskId: string
	taskLockAcquired: boolean
}

export class Task {
	// Core task variables
	readonly taskId: string
	readonly ulid: string
	private taskIsFavorited?: boolean
	public cwd: string
	private taskInitializationStartTime: number

	taskState: TaskState

	// ONE mutex for ALL state modifications to prevent race conditions
	private stateMutex = new Mutex()

	/**
	 * Execute function with exclusive lock on all task state
	 * Use this for ANY state modification to prevent races
	 */
	private async withStateLock<T>(fn: () => T | Promise<T>): Promise<T> {
		return await this.stateMutex.withLock(fn)
	}

	public async setActiveHookExecution(hookExecution: NonNullable<typeof this.taskState.activeHookExecution>): Promise<void> {
		return this.hookManager.setActiveHookExecution(hookExecution)
	}

	public async clearActiveHookExecution(): Promise<void> {
		return this.hookManager.clearActiveHookExecution()
	}

	public async getActiveHookExecution(): Promise<typeof this.taskState.activeHookExecution> {
		return this.hookManager.getActiveHookExecution()
	}

	// Core dependencies
	controller: Controller

	// Service handlers
	api: ApiHandler
	terminalManager: ITerminalManager
	private urlContentFetcher: UrlContentFetcher
	browserSession: BrowserSession
	contextManager: ContextManager
	diffViewProvider: DiffViewProvider
	public checkpointManager?: ICheckpointManager
	diracIgnoreController: DiracIgnoreController
	private commandPermissionController: CommandPermissionController
	toolExecutor: ToolExecutor
	/**
	 * Whether the task is using native tool calls.
	 * This is used to determine how we would format response.
	 * Example: We don't add noToolsUsed response when native tool call is used
	 * because of the expected format from the tool calls is different.
	 */

	streamHandler: StreamResponseHandler

	terminalExecutionMode: "vscodeTerminal" | "backgroundExec"

	// Metadata tracking
	private fileContextTracker: FileContextTracker
	modelContextTracker: ModelContextTracker
	private environmentContextTracker: EnvironmentContextTracker
	private environmentManager: EnvironmentManager
	private contextLoader: ContextLoader
	private taskMessenger: TaskMessenger
	private hookManager: HookManager
	private lifecycleManager: LifecycleManager
	private apiConversationManager: ApiConversationManager
	private responseProcessor: ResponseProcessor

	// Callbacks
	private updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
	postStateToWebview: () => Promise<void>
	reinitExistingTaskFromId: (taskId: string) => Promise<void>
	private cancelTask: () => Promise<void>

	// Cache service
	stateManager: StateManager

	// Message and conversation state
	messageStateHandler: MessageStateHandler

	// Workspace manager
	workspaceManager?: WorkspaceRootManager

	// Command executor for running shell commands (extracted from executeCommandTool)
	private commandExecutor!: CommandExecutor

	// Task Locking (Sqlite)
	private taskLockAcquired: boolean

	/**
	 * Aggregated view of all service dependencies.
	 * Mirrors the individual fields above; populated at the end of the constructor
	 * once every service is fully initialised.
	 * Preparatory for Sprint 1 PR2 (TaskFactory).
	 */
	private deps!: TaskDependencies

	/** Sprint 2 PR3: drives the outer ReAct loop (extracted from initiateTaskLoop). */
	private agentLoopRunner!: AgentLoopRunner

	/** Sprint 2 PR4: handles attemptApiRequest (extracted from Task). */
	private apiRequestHandler!: ApiRequestHandler

	constructor(params: TaskParams) {
		const {
			controller,
			updateTaskHistory,
			postStateToWebview,
			reinitExistingTaskFromId,
			cancelTask,
			shellIntegrationTimeout,
			terminalReuseEnabled,
			terminalOutputLineLimit,
			defaultTerminalProfile,
			vscodeTerminalExecutionMode,
			cwd,
			stateManager,
			workspaceManager,
			task,
			images,
			files,
			historyItem,
			taskId,
			taskLockAcquired,
		} = params

		this.taskInitializationStartTime = performance.now()
		this.taskState = new TaskState()
		if (stateManager.getGlobalSettingsKey("mode") === "act") {
			this.taskState.didSwitchToActMode = true
		}
		this.controller = controller
		this.updateTaskHistory = updateTaskHistory
		this.postStateToWebview = postStateToWebview
		this.reinitExistingTaskFromId = reinitExistingTaskFromId
		this.cancelTask = cancelTask
		this.diracIgnoreController = new DiracIgnoreController(cwd)
		this.diracIgnoreController.yoloMode = !!stateManager.getGlobalSettingsKey("yoloModeToggled")

		this.commandPermissionController = new CommandPermissionController()
		this.taskLockAcquired = taskLockAcquired
		// Determine terminal execution mode and create appropriate terminal manager
		this.terminalExecutionMode = vscodeTerminalExecutionMode || "vscodeTerminal"

		// When backgroundExec mode is selected, use StandaloneTerminalManager for hidden execution
		// Otherwise, use the HostProvider's terminal manager (VSCode terminal in VSCode, standalone in CLI)
		if (this.terminalExecutionMode === "backgroundExec") {
			// Import StandaloneTerminalManager for background execution
			this.terminalManager = new StandaloneTerminalManager()
			Logger.info(`[Task ${taskId}] Using StandaloneTerminalManager for backgroundExec mode`)
		} else {
			// Use the host-provided terminal manager (VSCode terminal in VSCode environment)
			this.terminalManager = HostProvider.get().createTerminalManager()
			Logger.info(`[Task ${taskId}] Using HostProvider terminal manager for vscodeTerminal mode`)
		}
		this.terminalManager.setShellIntegrationTimeout(shellIntegrationTimeout)
		this.terminalManager.setTerminalReuseEnabled(terminalReuseEnabled ?? true)
		this.terminalManager.setTerminalOutputLineLimit(terminalOutputLineLimit)
		this.terminalManager.setDefaultTerminalProfile(defaultTerminalProfile)

		this.urlContentFetcher = new UrlContentFetcher()
		this.browserSession = new BrowserSession(stateManager)
		this.contextManager = new ContextManager()
		this.streamHandler = new StreamResponseHandler()
		this.cwd = cwd
		this.stateManager = stateManager
		this.workspaceManager = workspaceManager

		// Prefer the host's DiffViewProvider if available, as it handles both background
		// and interactive edits. Fall back to FileEditProvider for headless environments.
		const hostDiffViewProvider = HostProvider.get().createDiffViewProvider()
		this.diffViewProvider = hostDiffViewProvider || new FileEditProvider()

		this.taskId = taskId
		AnchorStateManager.reset(this.taskId)

		// Initialize taskId first
		if (historyItem) {
			this.ulid = historyItem.ulid ?? ulid()
			this.taskIsFavorited = historyItem.isFavorited
			this.taskState.conversationHistoryDeletedRange = historyItem.conversationHistoryDeletedRange
			if (historyItem.checkpointManagerErrorMessage) {
				this.taskState.checkpointManagerErrorMessage = historyItem.checkpointManagerErrorMessage
			}
		} else if (task || images || files) {
			this.ulid = ulid()
		} else {
			throw new Error("Either historyItem or task/images must be provided")
		}

		this.messageStateHandler = new MessageStateHandler({
			taskId: this.taskId,
			ulid: this.ulid,
			taskState: this.taskState,
			taskIsFavorited: this.taskIsFavorited,
			updateTaskHistory: this.updateTaskHistory,
			workspaceRootPath: this.workspaceManager?.getPrimaryRoot()?.path,
		})

		// Initialize context trackers
		this.fileContextTracker = new FileContextTracker(controller, this.taskId)
		this.modelContextTracker = new ModelContextTracker(this.taskId)
		this.environmentContextTracker = new EnvironmentContextTracker(this.taskId)

		// Phase B: build checkpoint manager, API handler, and command executor.
		// Note: buildTaskServices may mutate this.taskState.checkpointManagerErrorMessage.
		const services = buildTaskServices({
			taskId: this.taskId,
			ulid: this.ulid,
			taskState: this.taskState,
			messageStateHandler: this.messageStateHandler,
			terminalManager: this.terminalManager,
			terminalExecutionMode: this.terminalExecutionMode,
			diffViewProvider: this.diffViewProvider,
			fileContextTracker: this.fileContextTracker,
			browserSession: this.browserSession,
			urlContentFetcher: this.urlContentFetcher,
			stateManager: this.stateManager,
			workspaceManager: this.workspaceManager,
			cwd: this.cwd,
			historyItem,
			cancelTask: this.cancelTask,
			postStateToWebview: this.postStateToWebview,
			updateTaskHistory: this.updateTaskHistory,
			controller: this.controller,
			say: this.say.bind(this),
			ask: this.ask.bind(this),
		})
		this.checkpointManager = services.checkpointManager
		this.api = services.api
		this.commandExecutor = services.commandExecutor

		// Phase C: wire all internal managers.
		// Note: say/ask binds must point to the live Task instance.
		const managers = buildTaskManagers({
			taskId: this.taskId,
			ulid: this.ulid,
			taskState: this.taskState,
			messageStateHandler: this.messageStateHandler,
			api: this.api,
			terminalManager: this.terminalManager,
			terminalExecutionMode: this.terminalExecutionMode,
			urlContentFetcher: this.urlContentFetcher,
			browserSession: this.browserSession,
			diffViewProvider: this.diffViewProvider,
			fileContextTracker: this.fileContextTracker,
			diracIgnoreController: this.diracIgnoreController,
			commandPermissionController: this.commandPermissionController,
			contextManager: this.contextManager,
			streamHandler: this.streamHandler,
			stateManager: this.stateManager,
			workspaceManager: this.workspaceManager,
			cwd: this.cwd,
			checkpointManager: this.checkpointManager,
			commandExecutor: this.commandExecutor,
			controller: this.controller,
			cancelTask: this.cancelTask,
			postStateToWebview: this.postStateToWebview,
			say: this.say.bind(this),
			ask: this.ask.bind(this),
			saveCheckpointCallback: this.saveCheckpointCallback.bind(this),
			sayAndCreateMissingParamError: this.sayAndCreateMissingParamError.bind(this),
			removeLastPartialMessageIfExistsWithType: this.removeLastPartialMessageIfExistsWithType.bind(this),
			executeCommandTool: this.executeCommandTool.bind(this),
			cancelBackgroundCommand: this.cancelBackgroundCommand.bind(this),
			switchToActModeCallback: this.switchToActModeCallback.bind(this),
			setActiveHookExecution: this.setActiveHookExecution.bind(this),
			clearActiveHookExecution: this.clearActiveHookExecution.bind(this),
			getActiveHookExecution: this.getActiveHookExecution.bind(this),
			runUserPromptSubmitHook: this.runUserPromptSubmitHook.bind(this),
			initiateTaskLoop: this.initiateTaskLoop.bind(this),
			getCurrentProviderInfo: this.getCurrentProviderInfo.bind(this),
			getEnvironmentDetails: this.getEnvironmentDetails.bind(this),
			getApiRequestIdSafe: this.getApiRequestIdSafe.bind(this),
			writePromptMetadataArtifacts: this.writePromptMetadataArtifacts.bind(this),
			loadContext: this.loadContext.bind(this),
			taskInitializationStartTime: this.taskInitializationStartTime,
			withStateLock: this.withStateLock.bind(this),
			recordEnvironment: () => this.environmentContextTracker.recordEnvironment(),
		})
		this.toolExecutor = managers.toolExecutor
		this.environmentManager = managers.environmentManager
		this.contextLoader = managers.contextLoader
		this.taskMessenger = managers.taskMessenger
		this.hookManager = managers.hookManager
		this.lifecycleManager = managers.lifecycleManager
		this.apiConversationManager = managers.apiConversationManager
		this.responseProcessor = managers.responseProcessor

		// Populate the TaskDependencies value object after all fields are initialised.
		// Individual fields (this.controller, this.api, …) are kept untouched so that
		// existing call sites within the class do not need to change.
		this.deps = {
			controller: this.controller,
			api: this.api,
			terminalManager: this.terminalManager,
			browserSession: this.browserSession,
			diffViewProvider: this.diffViewProvider,
			checkpointManager: this.checkpointManager,
			urlContentFetcher: this.urlContentFetcher,
			diracIgnoreController: this.diracIgnoreController,
			commandPermissionController: this.commandPermissionController,
			stateManager: this.stateManager,
			commandExecutor: this.commandExecutor,
			postStateToWebview: this.postStateToWebview,
			reinitExistingTaskFromId: this.reinitExistingTaskFromId,
			cancelTask: this.cancelTask,
		}

		// Sprint 2 PR3: instantiate after all fields are ready (needs this as Task facade).
		this.agentLoopRunner = new AgentLoopRunner(this, this.taskState)

		// Sprint 2 PR4: instantiate after all fields are ready (needs this as Task facade).
		this.apiRequestHandler = new ApiRequestHandler(this, this.taskState)
	}

	async processNativeToolCalls(assistantTextOnly: string, toolBlocks: ToolUse[], isStreamComplete = false) {
		return this.responseProcessor.processNativeToolCalls(assistantTextOnly, toolBlocks, isStreamComplete)
	}

	async getEnvironmentDetails(includeFileDetails = false): Promise<string> {
		return this.environmentManager.getEnvironmentDetails(includeFileDetails)
	}

	async handleMistakeLimitReached(userContent: DiracContent[]): Promise<{ didEndLoop: boolean; userContent: DiracContent[] }> {
		if (this.taskState.consecutiveMistakeCount < this.stateManager.getGlobalSettingsKey("maxConsecutiveMistakes")) {
			return { didEndLoop: false, userContent }
		}

		// In yolo mode, don't wait for user input - fail the task
		if (this.stateManager.getGlobalSettingsKey("yoloModeToggled")) {
			const errorMessage =
				`[YOLO MODE] Task failed: Too many consecutive mistakes (${this.taskState.consecutiveMistakeCount}). ` +
				`The model may not be capable enough for this task. Consider using a more capable model.`
			await this.say("error", errorMessage)
			// End the task loop with failure
			return { didEndLoop: true, userContent } // didEndLoop = true, signals task completion/failure
		}

		const autoApprovalSettings = this.stateManager.getGlobalSettingsKey("autoApprovalSettings")
		if (autoApprovalSettings.enableNotifications) {
			showSystemNotification({
				subtitle: "Error",
				message: "Dirac is having trouble. Would you like to continue the task?",
			})
		}

		const { response, text, images, files } = await this.ask(
			"mistake_limit_reached",
			`Tool use failure. Can potentially be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`,
		)

		if (response === "messageResponse") {
			// Display the user's message in the chat UI
			await this.say("user_feedback", text, images, files)

			// This userContent is for the *next* API call.
			const feedbackUserContent: DiracUserContent[] = []
			feedbackUserContent.push({
				type: "text",
				text: formatResponse.tooManyMistakes(text),
			})

			if (images && images.length > 0) {
				feedbackUserContent.push(...formatResponse.imageBlocks(images))
			}

			let fileContentString = ""
			if (files && files.length > 0) {
				fileContentString = await processFilesIntoText(files)
			}

			if (fileContentString) {
				feedbackUserContent.push({
					type: "text",
					text: fileContentString,
				})
			}

			userContent = feedbackUserContent
		}

		this.taskState.consecutiveMistakeCount = 0
		this.taskState.autoRetryAttempts = 0 // need to reset this if the user chooses to manually retry after the mistake limit is reached
		return { didEndLoop: false, userContent }
	}

	async loadContext(
		userContent: DiracContent[],
		includeFileDetails = false,
		useCompactPrompt = false,
	): Promise<[DiracContent[], string, boolean, SkillMetadata[], boolean, string?]> {
		return this.contextLoader.loadContext(userContent, includeFileDetails, useCompactPrompt)
	}

	// Communicate with webview

	async ask(type: DiracAsk, text?: string, partial?: boolean, multiCommandState?: MultiCommandState) {
		return this.taskMessenger.ask(type, text, partial, multiCommandState)
	}

	async handleWebviewAskResponse(
		askResponse: DiracAskResponse,
		text?: string,
		images?: string[],
		files?: string[],
		userEdits?: Record<string, string>,
	) {
		return this.taskMessenger.handleWebviewAskResponse(askResponse, text, images, files, userEdits)
	}

	async say(
		type: DiracSay,
		text?: string,
		images?: string[],
		files?: string[],
		partial?: boolean,
	): Promise<number | undefined> {
		return this.taskMessenger.say(type, text, images, files, partial)
	}

	async sayAndCreateMissingParamError(toolName: DiracDefaultTool, paramName: string, relPath?: string) {
		return this.taskMessenger.sayAndCreateMissingParamError(toolName, paramName, relPath)
	}

	async removeLastPartialMessageIfExistsWithType(type: "ask" | "say", askOrSay: DiracAsk | DiracSay, onlyPartial = true) {
		return this.taskMessenger.removeLastPartialMessageIfExistsWithType(type, askOrSay, onlyPartial)
	}

	private async saveCheckpointCallback(isAttemptCompletionMessage?: boolean, completionMessageTs?: number): Promise<void> {
		return this.checkpointManager?.saveCheckpoint(isAttemptCompletionMessage, completionMessageTs) ?? Promise.resolve()
	}

	/**
	 * Check if parallel tool calling is enabled.
	 * Parallel tool calling is enabled if:
	 * 1. User has enabled it in settings, OR
	 * 2. The current model/provider supports native tool calling and handles parallel tools well
	 */
	isParallelToolCallingEnabled(): boolean {
		const enableParallelSetting = this.stateManager.getGlobalSettingsKey("enableParallelToolCalling")
		const providerInfo = this.getCurrentProviderInfo()
		return isParallelToolCallingEnabled(enableParallelSetting, providerInfo)
	}

	private async switchToActModeCallback(): Promise<boolean> {
		return await this.controller.toggleActModeForYoloMode()
	}

	private async runUserPromptSubmitHook(
		userContent: DiracContent[],
		context: "initial_task" | "resume" | "feedback",
	): Promise<{ cancel?: boolean; wasCancelled?: boolean; contextModification?: string; errorMessage?: string }> {
		return this.hookManager.runUserPromptSubmitHook(userContent, context)
	}

	public async startTask(task?: string, images?: string[], files?: string[]): Promise<void> {
		// Initialize MCP tools before starting the task so the LLM sees them
		// on its first request. Failures are swallowed — agent-kiki must work
		// without plugins.
		await initializeMcpForTask(this.toolExecutor)
		return this.lifecycleManager.startTask(task, images, files)
	}

	public async resumeTaskFromHistory() {
		return this.lifecycleManager.resumeTaskFromHistory()
	}

	private async initiateTaskLoop(userContent: DiracContent[]): Promise<void> {
		return this.agentLoopRunner.initiateLoop(userContent)
	}

	async abortTask(reason = "aborted", exitCode = 130) {
		// agent-kiki fork: tracing close hook — finalise the JSONL trace meta
		// even when the task ends via abort/cancel/error rather than via a
		// successful attempt_completion. Run before the lifecycle abort so
		// that disposed dependencies cannot interfere; closeTrace itself is
		// idempotent and best-effort, so failures here cannot block abort.
		try {
			this.toolExecutor.closeTrace(reason, exitCode)
		} catch (_err) {
			// non-fatal — tracing must never break abort
		}
		// Disconnect MCP servers; no-op if none were connected.
		mcpClientManager.disconnectAll().catch((_err) => {
			// non-fatal — MCP cleanup must never block abort
		})
		return this.lifecycleManager.abortTask()
	}

	// Tools
	async executeCommandTool(
		command: string,
		timeoutSeconds: number | undefined,
		options?: CommandExecutionOptions,
	): Promise<[boolean, DiracToolResponseContent]> {
		return this.commandExecutor.execute(command, timeoutSeconds, options)
	}

	/**
	 * Cancel a background command that is running in the background
	 * @returns true if a command was cancelled, false if no command was running
	 */
	public async cancelBackgroundCommand(): Promise<boolean> {
		return this.commandExecutor.cancelBackgroundCommand()
	}

	getCurrentProviderInfo(): ApiProviderInfo {
		const model = this.api.getModel()
		const apiConfig = this.stateManager.getApiConfiguration()
		const mode = this.stateManager.getGlobalSettingsKey("mode")
		const providerId = (mode === "plan" ? apiConfig.planModeApiProvider : apiConfig.actModeApiProvider) as string
		const customPrompt = this.stateManager.getGlobalSettingsKey("customPrompt")
		return { model, providerId, customPrompt, mode }
	}

	async writePromptMetadataArtifacts(params: {
		systemPrompt: string
		providerInfo: ApiProviderInfo
		tools?: any[]
		fullHistory?: any[]
		deletedRange?: [number, number]
	}): Promise<void> {
		const enabledSetting = this.stateManager.getGlobalSettingsKey("writePromptMetadataEnabled")
		const enabledFlag = process.env.DIRAC_WRITE_PROMPT_ARTIFACTS?.toLowerCase()
		const enabled =
			enabledSetting ||
			enabledFlag === "1" ||
			enabledFlag === "true" ||
			enabledFlag === "yes" ||
			process.env.IS_DEV === "true"
		if (!enabled) {
			return
		}

		try {
			const configuredDir =
				process.env.DIRAC_PROMPT_ARTIFACT_DIR?.trim() ||
				this.stateManager.getGlobalSettingsKey("writePromptMetadataDirectory")?.trim()
			const artifactDir = configuredDir
				? path.isAbsolute(configuredDir)
					? configuredDir
					: path.resolve(this.cwd, configuredDir)
				: path.resolve(this.cwd, ".dirac-prompt-artifacts")

			await fs.mkdir(artifactDir, { recursive: true })

			const _ts = new Date().toISOString()
			const debugPath = path.join(artifactDir, `task-${this.taskId}-debug.md`)

			let markdown = `## System Prompt\n\n${params.systemPrompt}\n\n`

			if (params.tools) {
				markdown += `## Tools\n\n\`\`\`json\n${JSON.stringify(params.tools, null, 2)}\n\`\`\`\n\n`
			}

			if (params.fullHistory) {
				markdown += `## Conversation History\n\n`
				const [deletedStart, deletedEnd] = params.deletedRange || [-1, -1]

				for (let i = 0; i < params.fullHistory.length; i++) {
					const message = params.fullHistory[i]
					const isTruncated = i >= deletedStart && i <= deletedEnd

					markdown += `### [${message.role.toUpperCase()}]${isTruncated ? " [TRUNCATED]" : ""}\n`

					if (typeof message.content === "string") {
						markdown += `${message.content}\n\n`
					} else if (Array.isArray(message.content)) {
						for (const block of message.content) {
							if (block.type === "text") {
								markdown += `**Text:** ${block.call_id ? `(\`call_id: ${block.call_id}\`)` : ""}\n${block.text}\n\n`
							} else if (block.type === "thinking") {
								markdown += `**Thinking:** ${block.call_id ? `(\`call_id: ${block.call_id}\`)` : ""}\n${block.thinking}\n\n`
							} else if (block.type === "redacted_thinking") {
								markdown += `**Thinking:** [Redacted] ${block.call_id ? `(\`call_id: ${block.call_id}\`)` : ""}\n\n`
							} else if (block.type === "tool_use") {
								markdown += `**Tool Use:** \`${block.name}\` (\`id: ${block.id}\`, \`call_id: ${block.call_id}\`)\n`
								markdown += `\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\`\n\n`
							} else if (block.type === "tool_result") {
								markdown += `**Tool Result:** (\`${block.tool_use_id}\`)\n`
								if (typeof block.content === "string") {
									markdown += `${block.content}\n\n`
								} else if (Array.isArray(block.content)) {
									for (const contentBlock of block.content) {
										if (contentBlock.type === "text") {
											markdown += `${contentBlock.text}\n\n`
										} else if (contentBlock.type === "image") {
											markdown += `[Image: ${contentBlock.source?.type}]\n\n`
										}
									}
								}
							} else if (block.type === "image") {
								markdown += `[Image: ${block.source?.type}]\n\n`
							}
						}
					}
					markdown += "---\n\n"
				}
			}

			await fs.writeFile(debugPath, markdown, "utf8")
		} catch (error) {
			Logger.error("Failed to write prompt metadata artifacts:", error)
		}
	}

	getApiRequestIdSafe(): string | undefined {
		const apiLike = this.api as Partial<{
			getLastRequestId: () => string | undefined
			lastGenerationId?: string
		}>
		return apiLike.getLastRequestId?.() ?? apiLike.lastGenerationId
	}

	async handleContextWindowExceededError(): Promise<void> {
		return this.apiConversationManager.handleContextWindowExceededError()
	}

	async *attemptApiRequest(previousApiReqIndex: number, shouldCompact?: boolean): ApiStream {
		yield* this.apiRequestHandler.attempt(previousApiReqIndex, shouldCompact)
	}

	async presentAssistantMessage() {
		return this.responseProcessor.presentAssistantMessage()
	}

	async recursivelyMakeDiracRequests(userContent: DiracContent[], includeFileDetails = false): Promise<boolean> {
		return this.agentLoopRunner.makeRequest(userContent, includeFileDetails)
	}
	async initializeCheckpoints(isFirstRequest: boolean): Promise<void> {
		return this.lifecycleManager.initializeCheckpoints(isFirstRequest)
	}

	async determineContextCompaction(previousApiReqIndex: number): Promise<boolean> {
		return this.apiConversationManager.determineContextCompaction(previousApiReqIndex)
	}

	async prepareApiRequest(params: {
		userContent: DiracContent[]
		shouldCompact: boolean
		includeFileDetails: boolean
		useCompactPrompt: boolean
		previousApiReqIndex: number
		isFirstRequest: boolean
		providerId: string
		modelId: string
		mode: string
	}): Promise<{
		userContent: DiracContent[]
		lastApiReqIndex: number
		isDirectResponse?: boolean
		directResponseText?: string
	}> {
		return this.apiConversationManager.prepareApiRequest(params)
	}

	async processAssistantResponse(params: {
		assistantMessage: string
		assistantTextOnly: string
		assistantTextSignature?: string
		assistantMessageId: string
		providerId: string
		modelId: string
		mode: string
		taskMetrics: {
			inputTokens: number
			outputTokens: number
			cacheWriteTokens: number
			cacheReadTokens: number
			totalCost?: number
		}
		modelInfo: DiracMessageModelInfo
		toolUseHandler: ReturnType<StreamResponseHandler["getHandlers"]>["toolUseHandler"]
	}): Promise<boolean> {
		return this.responseProcessor.processAssistantResponse(params)
	}

	async handleEmptyAssistantResponse(params: {
		modelInfo: DiracMessageModelInfo
		taskMetrics: {
			inputTokens: number
			outputTokens: number
			cacheWriteTokens: number
			cacheReadTokens: number
			totalCost?: number
		}
		providerId: string
		model: any
	}): Promise<boolean> {
		return this.responseProcessor.handleEmptyAssistantResponse(params)
	}
}
