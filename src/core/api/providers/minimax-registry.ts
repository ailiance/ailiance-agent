import { MinimaxHandler } from "./minimax"
import { pickMode, registerProvider } from "./registry"

registerProvider("minimax", {
	factory: (options, mode) =>
		new MinimaxHandler({
			onRetryAttempt: options.onRetryAttempt,
			minimaxApiKey: options.minimaxApiKey,
			minimaxApiLine: options.minimaxApiLine,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
		}),
})
