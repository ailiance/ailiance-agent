export type WorkerCapability = "fr" | "code" | "embed" | "reason" | "general"

export interface WorkerEndpoint {
	id: string // "studio-eurollm", "studio-apertus", "tower-gemma", etc.
	url: string // "http://100.116.92.12:9303/v1"
	modelId: string // "eurollm-22b"
	capabilities: WorkerCapability[]
	priority: number // higher = preferred for matching cap
}

export type WorkerHealth = "up" | "down" | "unknown"

export interface ChatRequest {
	messages: Array<{ role: string; content: string }>
	model?: string
	max_tokens?: number
	temperature?: number
	stream?: boolean
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
