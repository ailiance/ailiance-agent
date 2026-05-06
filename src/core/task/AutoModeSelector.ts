export type Mode = "plan" | "act"

/**
 * Heuristic classifier: examines the latest user prompt and returns
 * the recommended mode. Only used when autoModeFromPrompt setting is true.
 */
export class AutoModeSelector {
	/**
	 * Classify the user prompt to choose plan vs act.
	 * Returns null if the heuristic can't decide (caller should keep current mode).
	 */
	classify(userPrompt: string): Mode | null {
		if (!userPrompt || userPrompt.trim().length === 0) return null
		const lower = userPrompt.toLowerCase()

		// Strong plan indicators
		if (
			/\b(plan|architecte|architecture|design|conçois|concois|propose|roadmap|redesign)\b/.test(lower) ||
			/\bcomment\s+ferais.tu\b/.test(lower) ||
			/\b(réfléchis|reflechis|reflexion|réflexion)\b/.test(lower) ||
			/\bpasse\s+en\s+revue\b/.test(lower) ||
			/\b(audit|review)\b/.test(lower) ||
			/\b(refactor|refacto)\b/.test(lower) ||
			/\b(tous\s+les|chaque|dans\s+tout)\s+(les\s+)?(fichiers?|tests?|modules?)\b/.test(lower) ||
			/\banalyse\b/.test(lower)
		) {
			return "plan"
		}

		// Conversational greetings — always act
		if (/^(bonjour|salut|hello|hi|merci|thanks|ok|oui|non|yes|no)\b/.test(lower.trim())) {
			return "act"
		}

		// Strong imperative verbs — always act regardless of length
		if (
			/\b(fais|fait|écris|ecris|écrit|ecrit|ajoute|réalise|realise|génère|genere|construis|implémente|implemente|build)\b/.test(
				lower,
			)
		) {
			return "act"
		}

		// Other action verbs (short prompts only)
		if (
			/\b(liste|montre|affiche|lis|ouvre|crée|cree|lance|exécute|execute|run|read|list|show|open|write|create|make)\b/.test(
				lower,
			)
		) {
			if (userPrompt.length <= 120) return "act"
		}

		// No strong signal — let caller keep current mode
		return null
	}

	/**
	 * Extract last user prompt from a messages array (OpenAI shape).
	 */
	static lastUserPrompt(messages: Array<{ role: string; content: string | unknown }>): string {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i]
			if (m.role === "user" && typeof m.content === "string") {
				return m.content
			}
		}
		return ""
	}
}

export const autoModeSelector = new AutoModeSelector()
