import { getModelInfo, openAiModelInfoSaneDefaults } from "@shared/api"
import { Logger } from "@/shared/services/Logger"
import { OpenAiHandler } from "./openai"
import { OpenAiResponsesCompatibleHandler } from "./openai-responses-compatible"
import { pickMode, registerProvider } from "./registry"

registerProvider("openai", {
	factory: (options, mode) => {
		const openAiModelId = pickMode<string>(
			options as Record<string, unknown>,
			mode,
			"planModeOpenAiModelId",
			"actModeOpenAiModelId",
		)
		let openAiModelInfo = pickMode<typeof openAiModelInfoSaneDefaults>(
			options as Record<string, unknown>,
			mode,
			"planModeOpenAiModelInfo",
			"actModeOpenAiModelInfo",
		)

		if (!openAiModelInfo && openAiModelId) {
			openAiModelInfo = getModelInfo(openAiModelId)
		}

		const isCustomUrl = options.openAiBaseUrl && options.openAiBaseUrl.startsWith("http")
		if (options.openAiCompatibleCustomApiKey || isCustomUrl) {
			openAiModelInfo = {
				...(openAiModelInfo || openAiModelInfoSaneDefaults),
				supportsTools: true,
				supportsReasoning: true,
				isR1FormatRequired: true,
			}
		}

		const apiKey = options.openAiCompatibleCustomApiKey || options.openAiApiKey
		if (apiKey) {
			const maskedKey = `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`
			Logger.info(
				`Using OpenAI API key: ${maskedKey} (from ${options.openAiCompatibleCustomApiKey ? "custom key" : "standard key"})`,
			)
		}

		if (options.openAiBaseUrl?.replace(/\/+$/, "").endsWith("/responses")) {
			const normalizedBaseUrl = options.openAiBaseUrl.replace(/\/responses\/?$/, "")
			return new OpenAiResponsesCompatibleHandler({
				onRetryAttempt: options.onRetryAttempt,
				openAiApiKey: apiKey,
				openAiBaseUrl: normalizedBaseUrl,
				openAiModelId,
				openAiModelInfo,
				reasoningEffort: pickMode(
					options as Record<string, unknown>,
					mode,
					"planModeReasoningEffort",
					"actModeReasoningEffort",
				),
			})
		}

		return new OpenAiHandler({
			onRetryAttempt: options.onRetryAttempt,
			openAiApiKey: apiKey,
			openAiBaseUrl: options.openAiBaseUrl,
			azureApiVersion: options.azureApiVersion,
			openAiHeaders: options.openAiHeaders,
			openAiModelId,
			openAiModelInfo,
			reasoningEffort: pickMode(
				options as Record<string, unknown>,
				mode,
				"planModeReasoningEffort",
				"actModeReasoningEffort",
			),
			useLocalRouter: options.useLocalRouter,
			localRouterWorkers: options.localRouterWorkers,
		})
	},
})
