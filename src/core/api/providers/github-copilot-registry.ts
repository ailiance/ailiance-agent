import { GithubCopilotHandler } from "./github-copilot"
import { pickMode, registerProvider } from "./registry"

registerProvider("github-copilot", {
	factory: (options, mode) =>
		new GithubCopilotHandler({
			onRetryAttempt: options.onRetryAttempt,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
		}),
})
