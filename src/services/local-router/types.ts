export type WorkerCapability = "fr" | "code" | "embed" | "reason" | "general"

export interface WorkerEndpoint {
	id: string // "studio-eurollm", "studio-apertus", "tower-gemma", etc.
	url: string // "http://100.116.92.12:9303/v1"
	modelId: string // "eurollm-22b"
	capabilities: WorkerCapability[]
	priority: number // higher = preferred for matching cap
	/**
	 * Maximum context window of this worker (input tokens + max generation).
	 * Used by LocalRouter.pickWorker() to skip undersized workers.
	 * If unknown, set Number.POSITIVE_INFINITY.
	 */
	ctxMax: number
	/**
	 * Whether this worker supports OpenAI-style native function calling
	 * (tools[] param + tool_calls in response). When false, LocalRouter
	 * emulates tools by injecting them into the system prompt and parsing
	 * <tool_call>{...}</tool_call> patterns from the streamed text.
	 */
	supportsTools: boolean
}

export type WorkerHealth = "up" | "down" | "unknown"

export interface ChatTool {
	type: "function"
	function: {
		name: string
		description?: string
		parameters: object
	}
}

export interface ChatRequest {
	messages: Array<{ role: string; content: string }>
	model?: string
	max_tokens?: number
	temperature?: number
	stream?: boolean
	tools?: ChatTool[]
	/**
	 * Optional caller-provided AbortSignal. Composed with the internal
	 * timeout controller — aborting either side aborts the underlying fetch.
	 */
	signal?: AbortSignal
	/**
	 * Total timeout for an SSE chatStream (ms). When exceeded the stream
	 * is aborted and a LocalRouterTimeoutError(kind:"total") is thrown.
	 * Falls back to the localRouterTimeoutMs setting default (60_000).
	 */
	timeoutMs?: number
	/**
	 * Idle / heartbeat timeout (ms). When no chunk is received for this many
	 * ms, the stream is aborted with LocalRouterTimeoutError(kind:"idle").
	 * Falls back to the localRouterIdleTimeoutMs setting default (20_000).
	 */
	idleTimeoutMs?: number
}

export interface ChatResponse {
	// OpenAI-compat shape
	id: string
	choices: Array<{
		message: { role: string; content: string }
		finish_reason: string
	}>
	usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}
