import { LmStudioHandler } from "./lmstudio"
import { pickMode, registerProvider } from "./registry"

registerProvider("lmstudio", {
	factory: (options, mode) =>
		new LmStudioHandler({
			onRetryAttempt: options.onRetryAttempt,
			lmStudioBaseUrl: options.lmStudioBaseUrl,
			lmStudioModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeLmStudioModelId",
				"actModeLmStudioModelId",
			),
			lmStudioMaxTokens: options.lmStudioMaxTokens,
		}),
})
