import * as assert from "assert"
import { ResponseCache } from "../ResponseCache"
import type { ChatRequest, ChatResponse } from "../types"

describe("ResponseCache", () => {
	const makeResponse = (id: string): ChatResponse => ({
		id,
		choices: [{ message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
	})

	const makeRequest = (content: string): ChatRequest => ({
		messages: [{ role: "user", content }],
	})

	it("stores and retrieves a value", () => {
		const cache = new ResponseCache()
		const resp = makeResponse("r1")
		cache.set("key1", resp)
		assert.deepStrictEqual(cache.get("key1"), resp)
	})

	it("returns null for missing key", () => {
		const cache = new ResponseCache()
		assert.strictEqual(cache.get("missing"), null)
	})

	it("evicts oldest entry when maxSize is reached", () => {
		const cache = new ResponseCache({ maxSize: 2 })
		cache.set("a", makeResponse("a"))
		cache.set("b", makeResponse("b"))
		cache.set("c", makeResponse("c")) // should evict "a"
		assert.strictEqual(cache.get("a"), null)
		assert.ok(cache.get("b") !== null)
		assert.ok(cache.get("c") !== null)
		assert.strictEqual(cache.size(), 2)
	})

	it("expires entries after TTL", async () => {
		const cache = new ResponseCache({ ttlMs: 10 })
		cache.set("x", makeResponse("x"))
		await new Promise((r) => setTimeout(r, 20))
		assert.strictEqual(cache.get("x"), null)
	})

	it("keyOf produces consistent hashes", () => {
		const req = makeRequest("hello world")
		const k1 = ResponseCache.keyOf(req, "worker-a")
		const k2 = ResponseCache.keyOf(req, "worker-a")
		assert.strictEqual(k1, k2)
	})

	it("keyOf differs for different workers", () => {
		const req = makeRequest("hello world")
		const k1 = ResponseCache.keyOf(req, "worker-a")
		const k2 = ResponseCache.keyOf(req, "worker-b")
		assert.notStrictEqual(k1, k2)
	})
})
