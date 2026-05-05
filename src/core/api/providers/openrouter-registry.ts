import { OpenRouterHandler } from "./openrouter"
import { pickMode, registerProvider } from "./registry"

registerProvider("openrouter", {
	factory: (options, mode) =>
		new OpenRouterHandler({
			onRetryAttempt: options.onRetryAttempt,
			openRouterApiKey: options.openRouterApiKey,
			openRouterModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeOpenRouterModelId",
				"actModeOpenRouterModelId",
			),
			openRouterModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeOpenRouterModelInfo",
				"actModeOpenRouterModelInfo",
			),
			openRouterProviderSorting: options.openRouterProviderSorting,
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
			enableParallelToolCalling: options.enableParallelToolCalling,
		}),
})
