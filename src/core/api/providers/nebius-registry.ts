import { NebiusHandler } from "./nebius"
import { pickMode, registerProvider } from "./registry"

registerProvider("nebius", {
	factory: (options, mode) =>
		new NebiusHandler({
			onRetryAttempt: options.onRetryAttempt,
			nebiusApiKey: options.nebiusApiKey,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
