import type { WorkerCapability } from "./types"

/**
 * Heuristic classifier — no embeddings, no Python, just regex + keyword match.
 * Returns the most likely capability needed for this prompt.
 */
export class PromptClassifier {
	classify(messages: Array<{ role: string; content: string }>): WorkerCapability {
		const last = this.lastUserContent(messages)
		if (!last) return "general"
		const lower = last.toLowerCase()

		// Code: keywords or fenced code blocks
		if (
			/```|\bfunction\b|\bdef \w|\bclass \w|\brefactor\b|\bdebug\b|\bimplement\b|\.py\b|\.ts\b|\.js\b|\.cpp\b/.test(
				lower,
			)
		) {
			return "code"
		}
		// French: common French stop words
		if (/\b(le|la|les|des|une|est|sont|comment|pourquoi|écris|analyse|fais|montre)\b/.test(lower)) {
			return "fr"
		}
		// Reasoning: math/logic keywords
		if (/\b(prove|why|step.by.step|reason|calcul|démontre|raisonne)\b/.test(lower)) {
			return "reason"
		}
		return "general"
	}

	private lastUserContent(messages: Array<{ role: string; content: string }>): string | null {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === "user") return messages[i].content
		}
		return null
	}
}
