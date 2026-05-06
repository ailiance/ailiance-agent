import { localStackManager } from "./LocalStackManager"

export interface StackEndpoint {
	available: boolean
	url?: string // the URL to use (router > proxy > undefined)
	via: "router" | "proxy" | "none"
}

// Cache for 30 seconds to avoid pinging ports on every request
let cachedEndpoint: StackEndpoint | undefined
let cacheTimestamp = 0
const CACHE_TTL_MS = 30_000

/**
 * Detect which local stack endpoint to route through.
 * Returns the highest-priority running endpoint:
 *   1. Jina router (port 5050) — semantic routing
 *   2. LiteLLM proxy (port 4000) — direct multiplexing
 *   3. none — no auto-routing
 *
 * Result is cached for 30 seconds to avoid latency on every request.
 */
export async function detectStackEndpoint(): Promise<StackEndpoint> {
	const now = Date.now()
	if (cachedEndpoint !== undefined && now - cacheTimestamp < CACHE_TTL_MS) {
		return cachedEndpoint
	}

	const status = await localStackManager.status()

	let endpoint: StackEndpoint
	if (status.router?.running) {
		endpoint = { available: true, url: status.router.url, via: "router" }
	} else if (status.proxy?.running) {
		endpoint = { available: true, url: status.proxy.url, via: "proxy" }
	} else {
		endpoint = { available: false, via: "none" }
	}

	cachedEndpoint = endpoint
	cacheTimestamp = now
	return endpoint
}

/**
 * Clear the detection cache (useful in tests or after stack state changes).
 */
export function clearStackEndpointCache(): void {
	cachedEndpoint = undefined
	cacheTimestamp = 0
}
