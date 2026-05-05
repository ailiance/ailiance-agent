import { HuggingFaceHandler } from "./huggingface"
import { pickMode, registerProvider } from "./registry"

registerProvider("huggingface", {
	factory: (options, mode) =>
		new HuggingFaceHandler({
			onRetryAttempt: options.onRetryAttempt,
			huggingFaceApiKey: options.huggingFaceApiKey,
			huggingFaceModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeHuggingFaceModelId",
				"actModeHuggingFaceModelId",
			),
			huggingFaceModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeHuggingFaceModelInfo",
				"actModeHuggingFaceModelInfo",
			),
		}),
})
