import { OpenAiCodexHandler } from "./openai-codex"
import { pickMode, registerProvider } from "./registry"

registerProvider("openai-codex", {
	factory: (options, mode) =>
		new OpenAiCodexHandler({
			onRetryAttempt: options.onRetryAttempt,
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
