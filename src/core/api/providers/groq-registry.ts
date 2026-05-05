import { GroqHandler } from "./groq"
import { pickMode, registerProvider } from "./registry"

registerProvider("groq", {
	factory: (options, mode) =>
		new GroqHandler({
			onRetryAttempt: options.onRetryAttempt,
			groqApiKey: options.groqApiKey,
			groqModelId: pickMode(options as Record<string, unknown>, mode, "planModeGroqModelId", "actModeGroqModelId"),
			groqModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeGroqModelInfo",
				"actModeGroqModelInfo",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
