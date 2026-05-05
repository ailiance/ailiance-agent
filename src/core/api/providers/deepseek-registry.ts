import { DeepSeekHandler } from "./deepseek"
import { pickMode, registerProvider } from "./registry"

registerProvider("deepseek", {
	factory: (options, mode) =>
		new DeepSeekHandler({
			onRetryAttempt: options.onRetryAttempt,
			deepSeekApiKey: options.deepSeekApiKey,
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
