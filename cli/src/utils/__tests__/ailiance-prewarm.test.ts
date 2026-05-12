import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	clearAilianceGatewayCache,
	formatPrewarmLog,
	getAilianceGatewayCache,
	prewarmAilianceGateway,
} from "../ailiance-prewarm"

function makeFakeStateManager(baseUrl: string | undefined, apiKey: string | undefined = "unused") {
	const globalState: Record<string, unknown> = { openAiBaseUrl: baseUrl }
	const secrets: Record<string, unknown> = { openAiApiKey: apiKey }
	return {
		globalState,
		secrets,
		getGlobalSettingsKey(key: string) {
			return globalState[key]
		},
		getSecretKey(key: string) {
			return secrets[key]
		},
	}
}

describe("prewarmAilianceGateway", () => {
	const originalFetch = globalThis.fetch
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true })
		clearAilianceGatewayCache()
	})
	afterEach(() => {
		vi.useRealTimers()
		globalThis.fetch = originalFetch
		clearAilianceGatewayCache()
	})

	it("returns ok with models on a healthy gateway", async () => {
		const calls: Array<{ url: string; headers: Record<string, string> }> = []
		globalThis.fetch = vi.fn(async (url: string, init: any) => {
			calls.push({ url, headers: init.headers })
			return new Response(
				JSON.stringify({ data: [{ id: "ailiance" }, { id: "ailiance-mistral" }] }),
				{ status: 200, headers: { "content-type": "application/json" } },
			)
		}) as any
		const sm = makeFakeStateManager("http://electron-server:9300")
		const r = await prewarmAilianceGateway(sm as any)
		expect(r.ok).toBe(true)
		expect(r.modelCount).toBe(2)
		expect(r.models).toEqual(["ailiance", "ailiance-mistral"])
		expect(calls[0].url).toBe("http://electron-server:9300/v1/models")
		expect(calls[0].headers.Authorization).toBe("Bearer unused")
		// Cache populated for first-prompt fast path.
		const cached = getAilianceGatewayCache()
		expect(cached?.url).toBe("http://electron-server:9300")
		expect(cached?.models).toEqual(["ailiance", "ailiance-mistral"])
	})

	it("appends /v1/models when baseUrl already ends with /v1", async () => {
		const calls: string[] = []
		globalThis.fetch = vi.fn(async (url: string) => {
			calls.push(url as string)
			return new Response(JSON.stringify({ data: [] }), { status: 200 })
		}) as any
		const sm = makeFakeStateManager("http://x:9300/v1")
		await prewarmAilianceGateway(sm as any)
		expect(calls[0]).toBe("http://x:9300/v1/models")
	})

	it("strips trailing slash from baseUrl before probing", async () => {
		const calls: string[] = []
		globalThis.fetch = vi.fn(async (url: string) => {
			calls.push(url as string)
			return new Response(JSON.stringify({ data: [] }), { status: 200 })
		}) as any
		const sm = makeFakeStateManager("http://x:9300/")
		await prewarmAilianceGateway(sm as any)
		expect(calls[0]).toBe("http://x:9300/v1/models")
	})

	it("returns not-ok with HTTP status on non-2xx", async () => {
		globalThis.fetch = vi.fn(
			async () => new Response("nope", { status: 502, statusText: "Bad Gateway" }),
		) as any
		const sm = makeFakeStateManager("http://x:9300")
		const r = await prewarmAilianceGateway(sm as any)
		expect(r.ok).toBe(false)
		expect(r.error).toContain("HTTP 502")
		expect(getAilianceGatewayCache()).toBeUndefined()
	})

	it("returns not-ok with network error message", async () => {
		globalThis.fetch = vi.fn(async () => {
			throw new Error("ECONNREFUSED 127.0.0.1:9300")
		}) as any
		const sm = makeFakeStateManager("http://x:9300")
		const r = await prewarmAilianceGateway(sm as any)
		expect(r.ok).toBe(false)
		expect(r.error).toContain("ECONNREFUSED")
	})

	it("returns not-ok with explicit error when baseUrl is empty", async () => {
		const sm = makeFakeStateManager(undefined)
		const r = await prewarmAilianceGateway(sm as any)
		expect(r.ok).toBe(false)
		expect(r.error).toContain("no baseUrl")
	})

	it("formatPrewarmLog produces actionable failure hint", () => {
		const log = formatPrewarmLog({
			ok: false,
			gatewayUrl: "http://x:9300",
			error: "timeout after 5000ms",
			durationMs: 5001,
		})
		expect(log).toContain("NOT ready")
		expect(log).toContain("AILIANCE_GATEWAY")
		expect(log).toContain("timeout")
	})

	it("formatPrewarmLog success log includes model count and duration", () => {
		const log = formatPrewarmLog({
			ok: true,
			gatewayUrl: "http://x:9300",
			modelCount: 47,
			models: [],
			durationMs: 123,
		})
		expect(log).toContain("47 models")
		expect(log).toContain("123ms")
		expect(log).toContain("http://x:9300")
	})
})
