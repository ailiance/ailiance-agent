import { CerebrasHandler } from "./cerebras"
import { pickMode, registerProvider } from "./registry"

registerProvider("cerebras", {
	factory: (options, mode) =>
		new CerebrasHandler({
			onRetryAttempt: options.onRetryAttempt,
			cerebrasApiKey: options.cerebrasApiKey,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
