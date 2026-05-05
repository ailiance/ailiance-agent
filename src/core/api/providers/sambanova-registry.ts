import { SambanovaHandler } from "./sambanova"
import { pickMode, registerProvider } from "./registry"

registerProvider("sambanova", {
	factory: (options, mode) =>
		new SambanovaHandler({
			onRetryAttempt: options.onRetryAttempt,
			sambanovaApiKey: options.sambanovaApiKey,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
