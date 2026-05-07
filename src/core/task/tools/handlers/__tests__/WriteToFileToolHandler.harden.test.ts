import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DiracDefaultTool } from "@shared/tools"
import { afterEach, beforeEach, describe, it } from "mocha"
import sinon from "sinon"
import { HostProvider } from "@/hosts/host-provider"
import { setVscodeHostProviderMock } from "@/test/host-provider-test-utils"
import { atomicWriteFile, ensureParentDirectory, MKDIR_MAX_DEPTH } from "@/utils/fs"
import { TaskState } from "../../../TaskState"
import { ToolValidator } from "../../ToolValidator"
import type { TaskConfig } from "../../types/TaskConfig"
import {
	formatWriteToFileSizeError,
	resolveWriteToFileMaxSize,
	WRITE_TO_FILE_ABSOLUTE_MAX,
	WRITE_TO_FILE_DEFAULT_MAX_SIZE,
	WriteToFileToolHandler,
} from "../WriteToFileToolHandler"

let tmpDir: string

function createConfig(opts: { writeToFileMaxSize?: number } = {}) {
	const taskState = new TaskState()
	const diffViewProvider = {
		open: sinon.stub().resolves(),
		update: sinon.stub().resolves(),
		reset: sinon.stub().resolves(),
		revertChanges: sinon.stub().resolves(),
		saveChanges: sinon.stub().resolves({ finalContent: "" }),
		applyAndSaveSilently: sinon.stub().resolves({ finalContent: "" }),
		scrollToFirstDiff: sinon.stub().resolves(),
		isEditing: false,
		editType: undefined as "create" | "modify" | undefined,
		originalContent: "",
	}

	const callbacks = {
		say: sinon.stub().resolves(undefined),
		ask: sinon.stub().resolves({ response: "yesButtonClicked" }),
		sayAndCreateMissingParamError: sinon.stub().resolves("missing"),
		removeLastPartialMessageIfExistsWithType: sinon.stub().resolves(),
		shouldAutoApproveToolWithPath: sinon.stub().resolves(true),
	}

	const config = {
		taskId: "task-1",
		ulid: "ulid-1",
		cwd: tmpDir,
		taskState,
		api: {
			getModel: () => ({ id: "test-model", info: { supportsImages: false, contextWindow: 128_000 } }),
		},
		messageState: { getDiracMessages: () => [] },
		autoApprovalSettings: { enableNotifications: false },
		backgroundEditEnabled: true,
		services: {
			stateManager: {
				getApiConfiguration: () => ({
					planModeApiProvider: "openai",
					actModeApiProvider: "openai",
				}),
				getGlobalSettingsKey: (key: string) => {
					if (key === "mode") return "act"
					if (key === "writeToFileMaxSize") return opts.writeToFileMaxSize
					return undefined
				},
			},
			diffViewProvider,
			fileContextTracker: {
				markFileAsEditedByDirac: sinon.stub(),
				trackFileContext: sinon.stub().resolves(),
			},
			diracIgnoreController: { validateAccess: () => true },
		},
		callbacks,
	} as unknown as TaskConfig

	const validator = new ToolValidator({ validateAccess: () => true } as any)

	return { config, callbacks, taskState, validator, diffViewProvider }
}

describe("WriteToFileToolHandler – hardening (Sprint 3-B)", () => {
	let sandbox: sinon.SinonSandbox

	beforeEach(async () => {
		sandbox = sinon.createSandbox()
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "aki-write-harden-"))
		setVscodeHostProviderMock()
	})

	afterEach(async () => {
		sandbox.restore()
		HostProvider.reset()
		await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
	})

	describe("resolveWriteToFileMaxSize", () => {
		it("returns the default when nothing is configured", () => {
			const { config } = createConfig()
			assert.equal(resolveWriteToFileMaxSize(config), WRITE_TO_FILE_DEFAULT_MAX_SIZE)
		})

		it("respects a positive user setting", () => {
			const { config } = createConfig({ writeToFileMaxSize: 2_000_000 })
			assert.equal(resolveWriteToFileMaxSize(config), 2_000_000)
		})

		it("clamps to the absolute ceiling", () => {
			const { config } = createConfig({ writeToFileMaxSize: 9_999_999_999 })
			assert.equal(resolveWriteToFileMaxSize(config), WRITE_TO_FILE_ABSOLUTE_MAX)
		})

		it("falls back to default for invalid values", () => {
			const { config } = createConfig({ writeToFileMaxSize: -1 })
			assert.equal(resolveWriteToFileMaxSize(config), WRITE_TO_FILE_DEFAULT_MAX_SIZE)
		})
	})

	describe("size limit enforcement", () => {
		it("rejects content larger than the default 1 MB cap", async () => {
			const { config, callbacks, taskState, validator } = createConfig()
			const handler = new WriteToFileToolHandler(validator)

			const oversize = "a".repeat(WRITE_TO_FILE_DEFAULT_MAX_SIZE + 1)

			const block = {
				type: "tool_use" as const,
				name: DiracDefaultTool.FILE_NEW,
				params: { path: "big.txt", content: oversize },
				partial: false,
				call_id: "size-1",
			}

			const result = await handler.execute(config, block)

			assert.equal(typeof result, "string")
			assert.ok((result as string).includes("exceeds writeToFileMaxSize"))
			assert.ok((callbacks.say as sinon.SinonStub).calledWith("error", sinon.match(/exceeds writeToFileMaxSize/)))
			assert.equal(taskState.consecutiveMistakeCount, 1)
		})

		it("allows a 1.5 MB write when writeToFileMaxSize is raised to 2 MB", async () => {
			const { config, validator } = createConfig({ writeToFileMaxSize: 2_000_000 })
			const handler = new WriteToFileToolHandler(validator)

			const payload = "b".repeat(1_500_000)

			const block = {
				type: "tool_use" as const,
				name: DiracDefaultTool.FILE_NEW,
				params: { path: "ok.txt", content: payload },
				partial: false,
				call_id: "size-2",
			}

			// Use validateAndPrepareFileOperation directly to avoid the full execute() pipeline
			// (hooks, telemetry, …) which is out of scope for this hardening test.
			const result = await handler.validateAndPrepareFileOperation(
				config,
				block,
				"ok.txt",
				undefined,
				payload,
			)
			// Should NOT short-circuit with a size-limit error.
			assert.ok(!("error" in result), `unexpected error: ${(result as any).error}`)
		})
	})

	describe("formatWriteToFileSizeError", () => {
		it("contains relPath, size and limit", () => {
			const msg = formatWriteToFileSizeError("foo/bar.txt", 1234, 1000)
			assert.ok(msg.includes("foo/bar.txt"))
			assert.ok(msg.includes("1234"))
			assert.ok(msg.includes("1000"))
		})
	})

	describe("ensureParentDirectory", () => {
		it("creates missing nested parents", async () => {
			const target = path.join(tmpDir, "sub1", "sub2", "file.txt")
			await ensureParentDirectory(target)
			const stat = await fs.stat(path.dirname(target))
			assert.ok(stat.isDirectory())
		})

		it("is a no-op when parent already exists", async () => {
			const target = path.join(tmpDir, "file.txt")
			// Should not throw even though tmpDir exists.
			await ensureParentDirectory(target)
		})

		it("refuses to create more than MKDIR_MAX_DEPTH nested directories", async () => {
			const parts: string[] = []
			for (let i = 0; i < MKDIR_MAX_DEPTH + 2; i++) {
				parts.push(`d${i}`)
			}
			const target = path.join(tmpDir, ...parts, "file.txt")
			await assert.rejects(() => ensureParentDirectory(target), /refusing to create more than/)
		})
	})

	describe("atomicWriteFile", () => {
		it("writes content via tmp+rename and leaves no tmp behind on success", async () => {
			const target = path.join(tmpDir, "atomic.txt")
			await atomicWriteFile(target, "hello world")
			assert.equal(await fs.readFile(target, "utf8"), "hello world")
			const remaining = await fs.readdir(tmpDir)
			assert.deepEqual(
				remaining.filter((f) => f.startsWith("atomic.txt.tmp.")),
				[],
			)
		})

		it("cleans up the tmp file when rename fails", async () => {
			const target = path.join(tmpDir, "fail.txt")
			const renameError = new Error("rename boom")
			const renameStub = sandbox.stub(fs, "rename").rejects(renameError)

			await assert.rejects(() => atomicWriteFile(target, "data"), /rename boom/)
			renameStub.restore()

			const remaining = await fs.readdir(tmpDir)
			assert.deepEqual(
				remaining.filter((f) => f.startsWith("fail.txt.tmp.")),
				[],
				"tmp file should be cleaned up after a failed rename",
			)
			// Final file must not exist either.
			await assert.rejects(() => fs.stat(target), /ENOENT/)
		})

		it("uses a tmp path that includes pid and 6 hex chars", async () => {
			const target = path.join(tmpDir, "pattern.txt")
			let observedTmpPath = ""
			const origWriteFile = fs.writeFile
			const writeStub = sandbox.stub(fs, "writeFile").callsFake(async (p: any, ...rest: any[]) => {
				observedTmpPath = String(p)
				return (origWriteFile as any).call(fs, p, ...rest)
			})

			await atomicWriteFile(target, "x")
			writeStub.restore()

			const re = new RegExp(`pattern\\.txt\\.tmp\\.${process.pid}\\.[0-9a-f]{6}$`)
			assert.ok(re.test(observedTmpPath), `tmp path ${observedTmpPath} should match ${re}`)
		})
	})

	describe("auto-mkdir in handler", () => {
		it("creates missing parent directories during validateAndPrepareFileOperation", async () => {
			const { config, validator } = createConfig()
			const handler = new WriteToFileToolHandler(validator)

			const relPath = path.join("nested-a", "nested-b", "file.txt")

			const block = {
				type: "tool_use" as const,
				name: DiracDefaultTool.FILE_NEW,
				params: { path: relPath, content: "ok" },
				partial: false,
				call_id: "mkdir-1",
			}

			const result = await handler.validateAndPrepareFileOperation(
				config,
				block,
				relPath,
				undefined,
				"ok",
			)
			assert.ok(!("error" in result), `unexpected error: ${(result as any).error}`)

			const parent = path.join(tmpDir, "nested-a", "nested-b")
			const stat = await fs.stat(parent)
			assert.ok(stat.isDirectory())
		})
	})
})
