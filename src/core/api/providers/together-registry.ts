import { TogetherHandler } from "./together"
import { pickMode, registerProvider } from "./registry"

registerProvider("together", {
	factory: (options, mode) =>
		new TogetherHandler({
			onRetryAttempt: options.onRetryAttempt,
			togetherApiKey: options.togetherApiKey,
			togetherModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeTogetherModelId",
				"actModeTogetherModelId",
			),
		}),
})
