import { GeminiHandler } from "./gemini"
import { pickMode, registerProvider } from "./registry"

registerProvider("gemini", {
	factory: (options, mode) =>
		new GeminiHandler({
			onRetryAttempt: options.onRetryAttempt,
			vertexProjectId: options.vertexProjectId,
			vertexRegion: options.vertexRegion,
			geminiApiKey: options.geminiApiKey,
			geminiBaseUrl: options.geminiBaseUrl,
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
			ulid: options.ulid,
			geminiSearchEnabled: options.geminiSearchEnabled,
		}),
})
