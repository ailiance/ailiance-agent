import { ClaudeCodeHandler } from "./claude-code"
import { pickMode, registerProvider } from "./registry"

registerProvider("claude-code", {
	factory: (options, mode) =>
		new ClaudeCodeHandler({
			onRetryAttempt: options.onRetryAttempt,
			claudeCodePath: options.claudeCodePath,
			apiModelId: pickMode(options as Record<string, unknown>, mode, "planModeApiModelId", "actModeApiModelId"),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
		}),
})
