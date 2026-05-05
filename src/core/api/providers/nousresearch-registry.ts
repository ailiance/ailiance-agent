import { NousResearchHandler } from "./nousresearch"
import { pickMode, registerProvider } from "./registry"

// Note: the provider id is "nousResearch" (camelCase) — matches existing user configs.
registerProvider("nousResearch", {
	factory: (options, mode) =>
		new NousResearchHandler({
			onRetryAttempt: options.onRetryAttempt,
			nousResearchApiKey: options.nousResearchApiKey,
			apiModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeNousResearchModelId",
				"actModeNousResearchModelId",
			),
		}),
})
