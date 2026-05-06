import { LiteLlmHandler } from "./litellm"
import { pickMode, registerProvider } from "./registry"

registerProvider("litellm", {
	factory: (options, mode) =>
		new LiteLlmHandler({
			onRetryAttempt: options.onRetryAttempt,
			liteLlmApiKey: options.liteLlmApiKey,
			liteLlmBaseUrl: options.liteLlmBaseUrl,
			liteLlmModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeLiteLlmModelId",
				"actModeLiteLlmModelId",
			),
			liteLlmModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeLiteLlmModelInfo",
				"actModeLiteLlmModelInfo",
			),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
			liteLlmUsePromptCache: options.liteLlmUsePromptCache,
			ulid: options.ulid,
			useLocalStack: options.useLocalStack,
		}),
})
