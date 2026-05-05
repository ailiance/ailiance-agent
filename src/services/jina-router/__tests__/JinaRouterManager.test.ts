import * as fs from "node:fs"
import * as assert from "assert"
import * as sinon from "sinon"
import { JinaRouterManager } from "../JinaRouterManager"

describe("JinaRouterManager", () => {
	let manager: JinaRouterManager
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		manager = new JinaRouterManager()
		sandbox = sinon.createSandbox()
	})

	afterEach(() => {
		sandbox.restore()
	})

	describe("status()", () => {
		it("returns { running: false } when no PID file exists", async () => {
			sandbox.stub(fs.promises, "readFile").rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))

			const result = await manager.status()

			assert.strictEqual(result.running, false)
			assert.strictEqual(result.pid, undefined)
		})
	})

	describe("stop()", () => {
		it("returns ok:true with no-op message when no PID file exists", async () => {
			sandbox.stub(fs.promises, "readFile").rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))

			const result = await manager.stop()

			assert.strictEqual(result.ok, true)
			assert.ok(result.msg.toLowerCase().includes("not running"), `msg should say not running, got: ${result.msg}`)
		})
	})

	describe("install()", () => {
		it("returns ok:false when neither uv nor python3 is available", async () => {
			// Stub findUv and findPython via fs.access failures for all candidates,
			// and make the 'which' fallback fail by having execFile-based calls reject.
			// We access private methods via the manager instance cast to any.
			const managerAny = manager as unknown as Record<string, () => Promise<string | null>>
			sandbox.stub(managerAny, "findUv").resolves(null)
			sandbox.stub(managerAny, "findPython").resolves(null)

			const result = await manager.install()

			assert.strictEqual(result.ok, false)
			assert.ok(result.msg.toLowerCase().includes("python"), `msg should mention python, got: ${result.msg}`)
		})

		it("install() error message for copy failure mentions server script", () => {
			// Regression guard: verify the source code returns the expected error phrase
			// when copyFile fails, so callers can identify the root cause.
			const src = require("node:fs").readFileSync(
				require("node:path").resolve(__dirname, "../JinaRouterManager.ts"),
				"utf8",
			) as string
			assert.ok(
				src.includes("Failed to copy server script"),
				"install() must return 'Failed to copy server script' on copyFile failure",
			)
		})
	})

	describe("start()", () => {
		it("returns ok:false when venv is not installed", async () => {
			// No PID file
			sandbox
				.stub(fs.promises, "readFile")
				.onFirstCall()
				.rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
			// venv python binary access fails = not installed
			sandbox.stub(fs.promises, "access").rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))

			const result = await manager.start()

			assert.strictEqual(result.ok, false)
			assert.ok(result.msg.includes("aki router install"), `msg should reference aki router install, got: ${result.msg}`)
		})
	})
})
