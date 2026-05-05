import { RequestyHandler } from "./requesty"
import { pickMode, registerProvider } from "./registry"

registerProvider("requesty", {
	factory: (options, mode) =>
		new RequestyHandler({
			onRetryAttempt: options.onRetryAttempt,
			requestyBaseUrl: options.requestyBaseUrl,
			requestyApiKey: options.requestyApiKey,
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
			requestyModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeRequestyModelId",
				"actModeRequestyModelId",
			),
			requestyModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeRequestyModelInfo",
				"actModeRequestyModelInfo",
			),
		}),
})
