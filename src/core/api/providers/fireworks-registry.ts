import { FireworksHandler } from "./fireworks"
import { pickMode, registerProvider } from "./registry"

registerProvider("fireworks", {
	factory: (options, mode) =>
		new FireworksHandler({
			onRetryAttempt: options.onRetryAttempt,
			fireworksApiKey: options.fireworksApiKey,
			fireworksModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeFireworksModelId",
				"actModeFireworksModelId",
			),
		}),
})
