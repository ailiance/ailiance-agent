import { VsCodeLmHandler } from "./vscode-lm"
import { pickMode, registerProvider } from "./registry"

registerProvider("vscode-lm", {
	factory: (options, mode) =>
		new VsCodeLmHandler({
			onRetryAttempt: options.onRetryAttempt,
			vsCodeLmModelSelector: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeVsCodeLmModelSelector",
				"actModeVsCodeLmModelSelector",
			),
		}),
})
