import { QwenCodeHandler } from "./qwen-code"
import { pickMode, registerProvider } from "./registry"

registerProvider("qwen-code", {
	factory: (options, mode) =>
		new QwenCodeHandler({
			onRetryAttempt: options.onRetryAttempt,
			qwenCodeOauthPath: options.qwenCodeOauthPath,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
