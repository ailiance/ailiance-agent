import { AnthropicHandler } from "./anthropic"
import { pickMode, registerProvider } from "./registry"

registerProvider("anthropic", {
	factory: (options, mode) =>
		new AnthropicHandler({
			onRetryAttempt: options.onRetryAttempt,
			apiKey: options.apiKey,
			anthropicBaseUrl: options.anthropicBaseUrl,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
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
		}),
})
