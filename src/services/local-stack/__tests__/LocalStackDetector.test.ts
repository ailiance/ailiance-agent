import * as assert from "assert"
import * as sinon from "sinon"
import * as stackManagerModule from "../LocalStackManager"
import { clearStackEndpointCache, detectStackEndpoint } from "../LocalStackDetector"

describe("detectStackEndpoint", () => {
	let sandbox: sinon.SinonSandbox

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		clearStackEndpointCache()
	})

	afterEach(() => {
		sandbox.restore()
		clearStackEndpointCache()
	})

	it("returns {available:false, via:'none'} when neither proxy nor router is running", async () => {
		sandbox.stub(stackManagerModule.localStackManager, "status").resolves({
			proxy: { running: false },
			router: { running: false },
			ready: false,
		})

		const result = await detectStackEndpoint()

		assert.strictEqual(result.available, false)
		assert.strictEqual(result.via, "none")
		assert.strictEqual(result.url, undefined)
	})

	it("returns {available:true, via:'proxy'} when only proxy is running", async () => {
		sandbox.stub(stackManagerModule.localStackManager, "status").resolves({
			proxy: { running: true, url: "http://127.0.0.1:4000" },
			router: { running: false },
			ready: false,
		})

		const result = await detectStackEndpoint()

		assert.strictEqual(result.available, true)
		assert.strictEqual(result.via, "proxy")
		assert.strictEqual(result.url, "http://127.0.0.1:4000")
	})

	it("returns {available:true, via:'router'} when router is running (even if proxy is also up)", async () => {
		sandbox.stub(stackManagerModule.localStackManager, "status").resolves({
			proxy: { running: true, url: "http://127.0.0.1:4000" },
			router: { running: true, url: "http://127.0.0.1:5050" },
			ready: true,
		})

		const result = await detectStackEndpoint()

		assert.strictEqual(result.available, true)
		assert.strictEqual(result.via, "router")
		assert.strictEqual(result.url, "http://127.0.0.1:5050")
	})

	it("caches the result and does not call status() a second time within TTL", async () => {
		const statusStub = sandbox.stub(stackManagerModule.localStackManager, "status").resolves({
			proxy: { running: false },
			router: { running: true, url: "http://127.0.0.1:5050" },
			ready: false,
		})

		await detectStackEndpoint()
		await detectStackEndpoint()

		assert.strictEqual(statusStub.callCount, 1)
	})
})
