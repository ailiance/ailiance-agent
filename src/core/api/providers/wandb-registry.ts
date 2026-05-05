import { WandbHandler } from "./wandb"
import { pickMode, registerProvider } from "./registry"

registerProvider("wandb", {
	factory: (options, mode) =>
		new WandbHandler({
			onRetryAttempt: options.onRetryAttempt,
			wandbApiKey: options.wandbApiKey,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
