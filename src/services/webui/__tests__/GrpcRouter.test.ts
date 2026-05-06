import * as assert from "assert"
import * as sinon from "sinon"
import * as localStackManagerModule from "../../local-stack/LocalStackManager"
import * as stackMonitorModule from "../../local-stack/StackMonitor"
import { GrpcRouter } from "../GrpcRouter"

describe("GrpcRouter", () => {
	let router: GrpcRouter
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		router = new GrpcRouter()
	})

	afterEach(() => {
		sandbox.restore()
	})

	it("returns 404 for unknown method", async () => {
		const result = await router.handle("StackService/unknown", {})
		assert.strictEqual(result.status, 404)
		assert.ok((result.data as { error: string }).error.includes("unknown method"))
	})

	it("calls stackMonitor.snapshot() and returns 200 for getSnapshot", async () => {
		const fakeSnapshot = { proxy: { running: false }, router: { running: false }, models: [] }
		const snapshotStub = sandbox.stub(stackMonitorModule.stackMonitor, "snapshot").resolves(fakeSnapshot as any)

		const result = await router.handle("StackService/getSnapshot", {})

		assert.strictEqual(result.status, 200)
		assert.deepStrictEqual(result.data, fakeSnapshot)
		assert.ok(snapshotStub.calledOnce)
	})

	it("returns 500 with error message when handler throws", async () => {
		sandbox.stub(stackMonitorModule.stackMonitor, "snapshot").rejects(new Error("connection refused"))

		const result = await router.handle("StackService/getSnapshot", {})

		assert.strictEqual(result.status, 500)
		assert.strictEqual((result.data as { error: string }).error, "connection refused")
	})

	it("calls localStackManager.start() for startStack", async () => {
		const startStub = sandbox
			.stub(localStackManagerModule.localStackManager, "start")
			.resolves({ ok: true, msg: "stack ready" })

		const result = await router.handle("StackService/startStack", {})

		assert.strictEqual(result.status, 200)
		assert.ok(startStub.calledOnce)
	})

	it("calls localStackManager.stop() for stopStack", async () => {
		const stopStub = sandbox
			.stub(localStackManagerModule.localStackManager, "stop")
			.resolves({ ok: true, msg: "stack stopped" })

		const result = await router.handle("StackService/stopStack", {})

		assert.strictEqual(result.status, 200)
		assert.ok(stopStub.calledOnce)
	})

	it("calls stop then start for restartStack", async () => {
		const callOrder: string[] = []
		sandbox.stub(localStackManagerModule.localStackManager, "stop").callsFake(async () => {
			callOrder.push("stop")
			return { ok: true, msg: "stopped" }
		})
		sandbox.stub(localStackManagerModule.localStackManager, "start").callsFake(async () => {
			callOrder.push("start")
			return { ok: true, msg: "started" }
		})

		await router.handle("StackService/restartStack", {})

		assert.deepStrictEqual(callOrder, ["stop", "start"])
	})
})
