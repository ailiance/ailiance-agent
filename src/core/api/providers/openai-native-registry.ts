import { OpenAiNativeHandler } from "./openai-native"
import { pickMode, registerProvider } from "./registry"

registerProvider("openai-native", {
	factory: (options, mode) =>
		new OpenAiNativeHandler({
			onRetryAttempt: options.onRetryAttempt,
			openAiNativeApiKey: options.openAiNativeApiKey,
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
		}),
})
