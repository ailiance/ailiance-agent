import { BasetenHandler } from "./baseten"
import { pickMode, registerProvider } from "./registry"

registerProvider("baseten", {
	factory: (options, mode) =>
		new BasetenHandler({
			onRetryAttempt: options.onRetryAttempt,
			basetenApiKey: options.basetenApiKey,
			basetenModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeBasetenModelId",
				"actModeBasetenModelId",
			),
			basetenModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeBasetenModelInfo",
				"actModeBasetenModelInfo",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
