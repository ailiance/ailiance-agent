import { ZAiHandler } from "./zai"
import { pickMode, registerProvider } from "./registry"

registerProvider("zai", {
	factory: (options, mode) =>
		new ZAiHandler({
			onRetryAttempt: options.onRetryAttempt,
			zaiApiLine: options.zaiApiLine,
			zaiApiKey: options.zaiApiKey,
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
