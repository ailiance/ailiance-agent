import * as assert from "assert"
import * as sinon from "sinon"
import * as jinaModule from "../../jina-router/JinaRouterManager"
import * as litellmModule from "../../litellm/LiteLLMProxyManager"
import { LocalStackManager } from "../LocalStackManager"

describe("LocalStackManager", () => {
	let manager: LocalStackManager
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		manager = new LocalStackManager()
		sandbox = sinon.createSandbox()
	})

	afterEach(() => {
		sandbox.restore()
	})

	describe("status()", () => {
		it("returns ready:false when both managers are stopped", async () => {
			sandbox.stub(litellmModule.liteLLMProxyManager, "status").resolves({ running: false })
			sandbox.stub(jinaModule.jinaRouterManager, "status").resolves({ running: false })

			const result = await manager.status()

			assert.strictEqual(result.proxy.running, false)
			assert.strictEqual(result.router.running, false)
			assert.strictEqual(result.ready, false)
		})
	})

	describe("start()", () => {
		it("starts proxy before router", async () => {
			const callOrder: string[] = []
			sandbox.stub(litellmModule.liteLLMProxyManager, "start").callsFake(async () => {
				callOrder.push("proxy")
				return { ok: true, msg: "proxy started", url: "http://127.0.0.1:4000" }
			})
			sandbox.stub(jinaModule.jinaRouterManager, "start").callsFake(async () => {
				callOrder.push("router")
				return { ok: true, msg: "router started", url: "http://127.0.0.1:5000" }
			})
			sandbox.stub(litellmModule.liteLLMProxyManager, "status").resolves({ running: true, url: "http://127.0.0.1:4000" })
			sandbox.stub(jinaModule.jinaRouterManager, "status").resolves({ running: true, url: "http://127.0.0.1:5000" })

			await manager.start()

			assert.deepStrictEqual(callOrder, ["proxy", "router"])
		})

		it("returns ok:false and does not attempt router start when proxy fails", async () => {
			sandbox.stub(litellmModule.liteLLMProxyManager, "start").resolves({ ok: false, msg: "proxy failed" })
			const routerStartStub = sandbox.stub(jinaModule.jinaRouterManager, "start")

			const result = await manager.start()

			assert.strictEqual(result.ok, false)
			assert.ok(result.msg.includes("proxy start failed"))
			assert.strictEqual(routerStartStub.callCount, 0)
		})
	})

	describe("stop()", () => {
		it("stops router before proxy", async () => {
			const callOrder: string[] = []
			sandbox.stub(jinaModule.jinaRouterManager, "stop").callsFake(async () => {
				callOrder.push("router")
				return { ok: true, msg: "router stopped" }
			})
			sandbox.stub(litellmModule.liteLLMProxyManager, "stop").callsFake(async () => {
				callOrder.push("proxy")
				return { ok: true, msg: "proxy stopped" }
			})

			await manager.stop()

			assert.deepStrictEqual(callOrder, ["router", "proxy"])
		})
	})
})
