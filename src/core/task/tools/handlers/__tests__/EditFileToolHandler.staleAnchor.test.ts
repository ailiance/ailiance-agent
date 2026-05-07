import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DiracDefaultTool } from "@shared/tools"
import { AnchorStateManager } from "@utils/AnchorStateManager"
import { contentHash, ANCHOR_DELIMITER } from "@utils/line-hashing"
import { afterEach, beforeEach, describe, it } from "mocha"
import sinon from "sinon"
import { HostProvider } from "@/hosts/host-provider"
import * as getDiagnosticsProvidersModule from "@/integrations/diagnostics/getDiagnosticsProviders"
import { setVscodeHostProviderMock } from "@/test/host-provider-test-utils"
import { TaskState } from "../../../TaskState"
import { ToolValidator } from "../../ToolValidator"
import type { TaskConfig } from "../../types/TaskConfig"
import { EditFileToolHandler } from "../EditFileToolHandler"

let tmpDir: string

/**
 * Build a fake API conversation history that records a previous read_file
 * for `relPath` resulting in `[File Hash: <hash>]`. This mimics what
 * ReadFileToolHandler emits and is what extractLastKnownHashFromHistory
 * looks for.
 */
function buildHistoryWithReadHash(relPath: string, hash: string) {
	return [
		{
			role: "assistant",
			content: [
				{
					type: "tool_use",
					id: "read-1",
					name: DiracDefaultTool.FILE_READ,
					input: { paths: [relPath] },
				},
			],
		},
		{
			role: "user",
			content: [
				{
					type: "tool_result",
					tool_use_id: "read-1",
					content: `[File Hash: ${hash}]\n0001:line 1\n0002:line 2\n0003:line 3`,
				},
			],
		},
	]
}

function createConfig(history: any[] = []) {
	const taskState = new TaskState()
	let lastPath: string | undefined
	let lastContent: string | undefined
	const diffViewProvider = {
		open: sinon.stub().callsFake(async (p: string) => {
			lastPath = p
		}),
		update: sinon.stub().callsFake(async (content: string) => {
			lastContent = content
		}),
		reset: sinon.stub().resolves(),
		saveChanges: sinon.stub().callsFake(async () => {
			if (lastPath && lastContent !== undefined) {
				await fs.writeFile(lastPath, lastContent)
			}
			return { finalContent: lastContent }
		}),
		applyAndSaveSilently: sinon.stub().callsFake(async (p: string, content: string) => {
			await fs.writeFile(p, content)
			return { finalContent: content }
		}),
		showReview: sinon.stub().resolves(),
		scrollToFirstDiff: sinon.stub().resolves(),
		hideReview: sinon.stub().resolves(),
		undoUserEdits: sinon.stub().resolves(),
	}

	const callbacks = {
		say: sinon.stub().resolves(undefined),
		ask: sinon.stub().resolves({ response: "yesButtonClicked" }),
		saveCheckpoint: sinon.stub().resolves(),
		sayAndCreateMissingParamError: sinon.stub().resolves("missing"),
		removeLastPartialMessageIfExistsWithType: sinon.stub().resolves(),
		shouldAutoApproveToolWithPath: sinon.stub().resolves(true),
		postStateToWebview: sinon.stub().resolves(),
		cancelTask: sinon.stub().resolves(),
		updateTaskHistory: sinon.stub().resolves([]),
		switchToActMode: sinon.stub().resolves(false),
		setActiveHookExecution: sinon.stub().resolves(),
		clearActiveHookExecution: sinon.stub().resolves(),
		getActiveHookExecution: sinon.stub().resolves(undefined),
		runUserPromptSubmitHook: sinon.stub().resolves({}),
		executeCommandTool: sinon.stub().resolves([false, "ok"]),
		cancelRunningCommandTool: sinon.stub().resolves(false),
		doesLatestTaskCompletionHaveNewChanges: sinon.stub().resolves(false),
		updateFCListFromToolResponse: sinon.stub().resolves(),
		shouldAutoApproveTool: sinon.stub().returns([true, true]),
		reinitExistingTaskFromId: sinon.stub().resolves(),
		applyLatestBrowserSettings: sinon.stub().resolves(undefined),
	}

	const config = {
		taskId: "task-1",
		ulid: "ulid-1",
		cwd: tmpDir,
		mode: "act",
		strictPlanModeEnabled: false,
		yoloModeToggled: true,
		doubleCheckCompletionEnabled: false,
		vscodeTerminalExecutionMode: "backgroundExec",
		enableParallelToolCalling: true,
		isSubagentExecution: true,
		taskState,
		messageState: {
			getApiConversationHistory: sinon.stub().returns(history),
		},
		api: {
			getModel: () => ({ id: "test-model", info: { supportsImages: false } }),
		},
		autoApprovalSettings: {
			enableNotifications: false,
			actions: { executeCommands: false },
		},
		autoApprover: {
			shouldAutoApproveTool: sinon.stub().returns([true, true]),
		},
		browserSettings: {},
		focusChainSettings: {},
		services: {
			stateManager: {
				getGlobalStateKey: () => undefined,
				getGlobalSettingsKey: (key: string) => {
					if (key === "mode") return "act"
					if (key === "hooksEnabled") return false
					return undefined
				},
				getApiConfiguration: () => ({
					planModeApiProvider: "openai",
					actModeApiProvider: "openai",
				}),
			},
			fileContextTracker: {
				trackFileContext: sinon.stub().resolves(),
				markFileAsEditedByDirac: sinon.stub(),
			},
			browserSession: {},
			urlContentFetcher: {},
			diffViewProvider,
			diracIgnoreController: { validateAccess: () => true },
			commandPermissionController: {},
			contextManager: {},
		},
		callbacks,
		coordinator: { getHandler: sinon.stub() },
	} as unknown as TaskConfig

	const validator = new ToolValidator({ validateAccess: () => true } as any)
	return { config, callbacks, taskState, validator }
}

describe("EditFileToolHandler – stale anchor detection (Sprint 3 task E)", () => {
	let sandbox: sinon.SinonSandbox

	beforeEach(async () => {
		sandbox = sinon.createSandbox()
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dirac-edit-stale-test-"))

		sandbox.stub(getDiagnosticsProvidersModule, "getDiagnosticsProviders").returns([
			{
				capturePreSaveState: sandbox.stub().resolves([]),
				getDiagnosticsFeedback: sandbox.stub().resolves({ newProblemsMessage: "", fixedCount: 0 }),
				getDiagnosticsFeedbackForFiles: sandbox.stub().callsFake(async (data) => data.map(() => ({ newProblemsMessage: "", fixedCount: 0 }))),
			} as any,
		])

		setVscodeHostProviderMock({
			hostBridgeClient: {
				workspaceClient: {
					getDiagnostics: sandbox.stub().resolves({ fileDiagnostics: [] }),
					getWorkspacePaths: sandbox.stub().resolves({ paths: [tmpDir] }),
					saveOpenDocumentIfDirty: sandbox.stub().resolves({ wasSaved: false }),
				},
			} as any,
		})
	})

	afterEach(async () => {
		sandbox.restore()
		HostProvider.reset()
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	function makeBlock(fileName: string, anchors: string[]) {
		return {
			type: "tool_use" as const,
			name: DiracDefaultTool.EDIT_FILE,
			params: {
				files: [
					{
						path: fileName,
						edits: [{ edit_type: "replace", anchor: anchors[1], end_anchor: anchors[1], text: "new line 2" }],
					},
				],
			},
			partial: false,
			call_id: "call-stale-1",
		}
	}

	it("succeeds when current hash matches lastKnownHash from history", async () => {
		const fileName = "fresh.txt"
		const filePath = path.join(tmpDir, fileName)
		const original = "line 1\nline 2\nline 3"
		await fs.writeFile(filePath, original)

		const history = buildHistoryWithReadHash(fileName, contentHash(original))
		const { config, taskState, validator } = createConfig(history)
		const handler = new EditFileToolHandler(validator, false)

		const lines = original.split("\n")
		const anchors = AnchorStateManager.reconcile(filePath, lines, config.ulid).map(
			(a, i) => `${a}${ANCHOR_DELIMITER}${lines[i]}`,
		)
		const block = makeBlock(fileName, anchors)
		taskState.assistantMessageContent = [block]

		const result = await handler.execute(config, block)
		const finalContent = await fs.readFile(filePath, "utf8")
		assert.equal(finalContent, "line 1\nnew line 2\nline 3")
		assert.ok(typeof result === "string")
		assert.ok(result.includes("Applied 1 edit(s) successfully"))
	})

	it("rejects edit with diagnostic when file has changed since last read", async () => {
		const fileName = "drifted.txt"
		const filePath = path.join(tmpDir, fileName)

		// Model "saw" the file at this content/hash in history.
		const seenContent = "line 1\nline 2\nline 3"
		const seenHash = contentHash(seenContent)

		// But on disk it now has a different content (manual edit, hook, ...).
		const onDisk = "line 1\nline 2 — changed\nline 3"
		await fs.writeFile(filePath, onDisk)

		const history = buildHistoryWithReadHash(fileName, seenHash)
		const { config, taskState, validator } = createConfig(history)
		const handler = new EditFileToolHandler(validator, false)

		const lines = seenContent.split("\n")
		const anchors = AnchorStateManager.reconcile(filePath, lines, config.ulid).map(
			(a, i) => `${a}${ANCHOR_DELIMITER}${lines[i]}`,
		)
		const block = makeBlock(fileName, anchors)
		taskState.assistantMessageContent = [block]

		const mistakeBefore = taskState.consecutiveMistakeCount
		const result = await handler.execute(config, block)

		assert.ok(typeof result === "string")
		assert.ok(result.includes("has changed since the last read"), `expected stale diagnostic, got: ${result}`)
		assert.ok(result.includes(`Previously known hash: ${seenHash}`))
		assert.ok(result.includes("re-read the file"))

		// File on disk should be untouched.
		const after = await fs.readFile(filePath, "utf8")
		assert.equal(after, onDisk)

		// consecutiveMistakeCount must NOT have been incremented (state of the
		// world, not a model fault).
		assert.equal(taskState.consecutiveMistakeCount, mistakeBefore)
	})

	it("preserves legacy behaviour when no lastKnownHash is recorded in history", async () => {
		const fileName = "legacy.txt"
		const filePath = path.join(tmpDir, fileName)
		const original = "line 1\nline 2\nline 3"
		await fs.writeFile(filePath, original)

		// Empty history: no prior read_file → check is skipped.
		const { config, taskState, validator } = createConfig([])
		const handler = new EditFileToolHandler(validator, false)

		const lines = original.split("\n")
		const anchors = AnchorStateManager.reconcile(filePath, lines, config.ulid).map(
			(a, i) => `${a}${ANCHOR_DELIMITER}${lines[i]}`,
		)
		const block = makeBlock(fileName, anchors)
		taskState.assistantMessageContent = [block]

		const result = await handler.execute(config, block)
		const finalContent = await fs.readFile(filePath, "utf8")
		assert.equal(finalContent, "line 1\nnew line 2\nline 3")
		assert.ok(typeof result === "string")
		assert.ok(result.includes("Applied 1 edit(s) successfully"))
	})
})
