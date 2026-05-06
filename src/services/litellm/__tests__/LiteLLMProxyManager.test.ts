import * as fs from "node:fs"
import * as path from "node:path"
import * as assert from "assert"
import * as sinon from "sinon"
import { LiteLLMProxyManager } from "../LiteLLMProxyManager"

describe("LiteLLMProxyManager", () => {
	let manager: LiteLLMProxyManager
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		manager = new LiteLLMProxyManager()
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

		it("returns ok:true and removes stale PID when process is dead", async () => {
			// Provide a PID that certainly does not exist on this machine
			sandbox.stub(fs.promises, "readFile").resolves("999999999")
			const unlinkStub = sandbox.stub(fs.promises, "unlink").resolves()

			// Stub process.kill so signal 0 throws ESRCH (process not found)
			const killStub = sandbox.stub(process, "kill").throws(Object.assign(new Error("ESRCH"), { code: "ESRCH" }))

			const result = await manager.stop()

			assert.strictEqual(result.ok, true)
			assert.ok(unlinkStub.called, "should have removed stale PID file")

			killStub.restore()
		})
	})

	describe("DEFAULT_CONFIG_YAML (regression)", () => {
		it("does not contain general_settings, master_key, or database_url", () => {
			// Read the source file directly to assert the embedded YAML constant
			const src = fs.readFileSync(path.resolve(__dirname, "../LiteLLMProxyManager.ts"), "utf8")
			const forbidden = ["general_settings", "master_key", "database_url"]
			for (const term of forbidden) {
				assert.ok(!src.includes(`  ${term}:`), `Source must not contain ${term}: in config YAML`)
			}
		})

		it("contains all 5 eu-kiki worker entries", () => {
			const src = fs.readFileSync(path.resolve(__dirname, "../LiteLLMProxyManager.ts"), "utf8")
			const expected = [
				"eu-kiki-apertus-70b",
				"eu-kiki-eurollm-22b",
				"eu-kiki-devstral-24b",
				"eu-kiki-gemma3-4b",
				"eu-kiki-gateway",
			]
			for (const entry of expected) {
				assert.ok(src.includes(entry), `DEFAULT_CONFIG_YAML must contain model_name: ${entry}`)
			}
		})

		it("contains gemma3 Ollama entries for macM1", () => {
			const src = fs.readFileSync(path.resolve(__dirname, "../LiteLLMProxyManager.ts"), "utf8")
			assert.ok(src.includes("gemma3-1b"), "DEFAULT_CONFIG_YAML must contain gemma3-1b")
			assert.ok(src.includes("gemma3-4b"), "DEFAULT_CONFIG_YAML must contain gemma3-4b")
			assert.ok(src.includes("100.112.121.126:11434"), "DEFAULT_CONFIG_YAML must reference macM1 Ollama endpoint")
		})
	})

	describe("start()", () => {
		it("returns ok:false when litellm binary is not installed", async () => {
			// No PID file
			sandbox
				.stub(fs.promises, "readFile")
				.onFirstCall()
				.rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
			// litellm binary access fails = not installed
			sandbox.stub(fs.promises, "access").rejects(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))

			const result = await manager.start()

			assert.strictEqual(result.ok, false)
			assert.ok(result.msg.includes("aki proxy install"), `msg should reference aki proxy install, got: ${result.msg}`)
		})
	})
})
