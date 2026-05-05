import { QwenApiRegions } from "@shared/api"
import { QwenHandler } from "./qwen"
import { pickMode, registerProvider } from "./registry"

registerProvider("qwen", {
	factory: (options, mode) =>
		new QwenHandler({
			onRetryAttempt: options.onRetryAttempt,
			qwenApiKey: options.qwenApiKey,
			qwenApiLine:
				options.qwenApiLine === QwenApiRegions.INTERNATIONAL ? QwenApiRegions.INTERNATIONAL : QwenApiRegions.CHINA,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
		}),
})
