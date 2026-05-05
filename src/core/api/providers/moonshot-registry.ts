import { MoonshotHandler } from "./moonshot"
import { pickMode, registerProvider } from "./registry"

registerProvider("moonshot", {
	factory: (options, mode) =>
		new MoonshotHandler({
			onRetryAttempt: options.onRetryAttempt,
			moonshotApiKey: options.moonshotApiKey,
			moonshotApiLine: options.moonshotApiLine,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
