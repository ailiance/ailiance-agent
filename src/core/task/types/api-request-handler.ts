import { DiracAsk, DiracSay } from "@shared/ExtensionMessage"
import { DiracAskResponse } from "@shared/WebviewMessage"
import { ApiHandler, ApiProviderInfo } from "../../../core/api"
import { ContextManager } from "../../context/context-management/ContextManager"
import { Controller } from "../../controller"
import { DiracIgnoreController } from "../../ignore/DiracIgnoreController"
import { StateManager } from "../../storage/StateManager"
import { WorkspaceRootManager } from "../../workspace/WorkspaceRootManager"
import { MessageStateHandler } from "../message-state"
import { TaskState } from "../TaskState"

export interface ApiRequestHandlerContext {
	// identifiers
	taskId: string
	// state
	taskState: TaskState
	// services
	api: ApiHandler
	contextManager: ContextManager
	diracIgnoreController: DiracIgnoreController
	stateManager: StateManager
	messageStateHandler: MessageStateHandler
	workspaceManager?: WorkspaceRootManager
	controller: Controller
	// config
	cwd: string
	terminalExecutionMode: "vscodeTerminal" | "backgroundExec"
	// messaging
	say: (type: DiracSay, text?: string, images?: string[], files?: string[], partial?: boolean) => Promise<number | undefined>
	ask: (
		type: DiracAsk,
		text?: string,
		partial?: boolean,
	) => Promise<{
		response: DiracAskResponse
		text?: string
		images?: string[]
		files?: string[]
		askTs?: number
		userEdits?: Record<string, string>
	}>
	// callbacks
	postStateToWebview: () => Promise<void>
	handleContextWindowExceededError: () => Promise<void>
	getCurrentProviderInfo: () => ApiProviderInfo
	isParallelToolCallingEnabled: () => boolean
}
