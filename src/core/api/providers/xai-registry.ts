import { XAIHandler } from "./xai"
import { pickMode, registerProvider } from "./registry"

registerProvider("xai", {
	factory: (options, mode) =>
		new XAIHandler({
			onRetryAttempt: options.onRetryAttempt,
			xaiApiKey: options.xaiApiKey,
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
