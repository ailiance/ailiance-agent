import { MistralHandler } from "./mistral"
import { pickMode, registerProvider } from "./registry"

registerProvider("mistral", {
	factory: (options, mode) =>
		new MistralHandler({
			onRetryAttempt: options.onRetryAttempt,
			mistralApiKey: options.mistralApiKey,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
