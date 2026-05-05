import { VertexHandler } from "./vertex"
import { pickMode, registerProvider } from "./registry"

registerProvider("vertex", {
	factory: (options, mode) =>
		new VertexHandler({
			onRetryAttempt: options.onRetryAttempt,
			vertexProjectId: options.vertexProjectId,
			vertexRegion: options.vertexRegion,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
			geminiApiKey: options.geminiApiKey,
			geminiBaseUrl: options.geminiBaseUrl,
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			ulid: options.ulid,
		}),
})
