import { VercelAIGatewayHandler } from "./vercel-ai-gateway"
import { pickMode, registerProvider } from "./registry"

registerProvider("vercel-ai-gateway", {
	factory: (options, mode) =>
		new VercelAIGatewayHandler({
			onRetryAttempt: options.onRetryAttempt,
			vercelAiGatewayApiKey: options.vercelAiGatewayApiKey,
			openRouterModelId: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeVercelAiGatewayModelId",
				"actModeVercelAiGatewayModelId",
			),
			openRouterModelInfo: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeVercelAiGatewayModelInfo",
				"actModeVercelAiGatewayModelInfo",
			),
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			thinkingBudgetTokens: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeThinkingBudgetTokens",
				"actModeThinkingBudgetTokens",
			),
		}),
})
