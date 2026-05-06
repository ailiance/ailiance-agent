import * as assert from "assert"
import * as sinon from "sinon"
import { LocalRouter } from "../LocalRouter"
import { routingObserver } from "../RoutingObserver"
import type { ChatRequest, ChatResponse, WorkerEndpoint } from "../types"

const makeEndpoint = (overrides: Partial<WorkerEndpoint> = {}): WorkerEndpoint => ({
	id: "test-worker",
	url: "http://localhost:9999/v1",
	modelId: "test-model",
	capabilities: ["general"],
	priority: 10,
	ctxMax: Number.POSITIVE_INFINITY,
	...overrides,
})

const makeResponse = (): ChatResponse => ({
	id: "resp-1",
	choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
})

const makeRequest = (): ChatRequest => ({
	messages: [{ role: "user", content: "hello" }],
})

describe("LocalRouter", () => {
	let sandbox: sinon.SinonSandbox
	let fetchStub: sinon.SinonStub

	beforeEach(() => {
		sandbox = sinon.createSandbox()
		fetchStub = sandbox.stub(globalThis, "fetch")
		routingObserver.reset()
	})

	afterEach(() => {
		sandbox.restore()
		routingObserver.reset()
	})

	it("pickWorker selects by capability and health", () => {
		const workers = [
			makeEndpoint({ id: "fr-worker", capabilities: ["fr", "general"], priority: 10 }),
			makeEndpoint({ id: "code-worker", capabilities: ["code", "general"], priority: 8 }),
		]
		const router = new LocalRouter(workers)
		// Both start as "unknown" health — pickWorker includes unknowns
		const req: ChatRequest = { messages: [{ role: "user", content: "Comment ça fonctionne ?" }] }
		const picked = router.pickWorker(req)
		// French message → "fr" cap → fr-worker wins (priority 10)
		assert.ok(picked !== null)
		assert.strictEqual(picked?.id, "fr-worker")
		router.dispose()
	})

	it("chat() returns cached response on second call", async () => {
		const resp = makeResponse()
		fetchStub.resolves(new Response(JSON.stringify(resp), { status: 200 }))

		const router = new LocalRouter([makeEndpoint()])
		const req = makeRequest()

		await router.chat(req)
		await router.chat(req)

		// Second call should use cache — fetch only called once
		assert.strictEqual(fetchStub.callCount, 1)
		router.dispose()
	})

	it("chat() fetches from worker on cache miss", async () => {
		const resp = makeResponse()
		fetchStub.resolves(new Response(JSON.stringify(resp), { status: 200 }))

		const router = new LocalRouter([makeEndpoint()])
		const result = await router.chat(makeRequest())

		assert.strictEqual(fetchStub.callCount, 1)
		assert.strictEqual(result.id, resp.id)
		router.dispose()
	})

	it("chat() throws when no worker is available", async () => {
		const router = new LocalRouter([])
		await assert.rejects(() => router.chat(makeRequest()), /no worker available/)
		router.dispose()
	})

	it("chat() cache hit emits cacheHit: true", async () => {
		const resp = makeResponse()
		fetchStub.resolves(new Response(JSON.stringify(resp), { status: 200 }))

		const router = new LocalRouter([makeEndpoint()])
		const req = makeRequest()
		await router.chat(req) // cache miss — populates cache
		routingObserver.reset() // clear first event

		await router.chat(req) // cache hit
		const event = routingObserver.last()
		assert.ok(event !== null)
		assert.strictEqual(event?.cacheHit, true)
		assert.strictEqual(event?.workerId, "test-worker")
		router.dispose()
	})

	it("chat() cache miss emits cacheHit: false", async () => {
		const resp = makeResponse()
		fetchStub.resolves(new Response(JSON.stringify(resp), { status: 200 }))

		const router = new LocalRouter([makeEndpoint()])
		await router.chat(makeRequest())
		const event = routingObserver.last()
		assert.ok(event !== null)
		assert.strictEqual(event?.cacheHit, false)
		assert.strictEqual(event?.workerId, "test-worker")
		router.dispose()
	})

	it("chat() no worker does not emit", async () => {
		const router = new LocalRouter([])
		await assert.rejects(() => router.chat(makeRequest()), /no worker available/)
		assert.strictEqual(routingObserver.last(), null)
		router.dispose()
	})
})
