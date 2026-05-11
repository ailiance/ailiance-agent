import type { ChatRequest } from "./types"

/**
 * Rough estimate: ~4 characters per token (anglo + tools/code mix).
 * Overestimate by 20% to be safe against tokenizer variance.
 *
 * For ailiance-agent workflows where system prompt is ~6-10k tokens,
 * this is accurate enough to skip clearly-undersized workers without
 * the cost of a real tokenizer.
 */
export function estimateTokens(req: ChatRequest): number {
	let chars = 0
	for (const m of req.messages) {
		chars += m.content.length
		chars += 8 // role overhead
	}
	// Add max_tokens for generation budget
	const maxGen = req.max_tokens ?? 0
	return Math.ceil((chars / 4) * 1.2) + maxGen
}
