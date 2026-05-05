import { DoubaoHandler } from "./doubao"
import { pickMode, registerProvider } from "./registry"

registerProvider("doubao", {
	factory: (options, mode) =>
		new DoubaoHandler({
			onRetryAttempt: options.onRetryAttempt,
			doubaoApiKey: options.doubaoApiKey,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
