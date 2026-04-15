import { GenerateContentResponse, Part, Content } from "@google/genai"
import { Anthropic } from "@anthropic-ai/sdk"
import { DiracStorageMessage } from "@/shared/messages/content"

export function convertAnthropicMessagesToGemini(messages: DiracStorageMessage[]): Content[] {
	const toolUseIdToName = new Map<string, string>()

	// Pre-scan to build a map of tool_use_id to function name
	for (const msg of messages) {
		if (Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (typeof block !== "string" && block.type === "tool_use") {
					toolUseIdToName.set(block.id, block.name)
				}
			}
		}
	}

	return messages.map((message) => {
		return {
			role: message.role === "assistant" ? "model" : "user",
			parts: convertAnthropicContentToGemini(message.content as DiracStorageMessage["content"], toolUseIdToName),
		}
	})
}

export function convertAnthropicContentToGemini(
	content: string | DiracStorageMessage["content"],
	toolUseIdToName?: Map<string, string>,
): Part[] {
	if (typeof content === "string") {
		return [{ text: content }]
	}

	let lastThoughtSignature: string | undefined

	return content
		.map((block: any): Part | null => {
			if (block.signature) {
				lastThoughtSignature = block.signature
			}
			const signature = block.signature || lastThoughtSignature

			if (block.type === "text") {
				return {
					text: block.text,
					thoughtSignature: signature,
				}
			}
			if (block.type === "thinking") {
				return {
					thought: true,
					text: block.thinking,
					thoughtSignature: signature,
				} as any
			}
			if (block.type === "image") {
				return {
					inlineData: {
						mimeType: block.source.media_type,
						data: block.source.data,
					},
				}
			}
			if (block.type === "tool_use") {
				return {
					functionCall: {
						id: block.id,
						name: block.name,
						args: block.input as Record<string, unknown>,
					},
					thoughtSignature: signature,
				}
			}
			if (block.type === "tool_result") {
				return {
					functionResponse: {
						id: block.tool_use_id,
						name: toolUseIdToName?.get(block.tool_use_id) || block.tool_use_id,
						response: {
							result: block.content as unknown as Record<string, unknown>,
						},
					},
				}
			}
			return null
		})
		.filter((part): part is Part => part !== null)
}

export function convertAnthropicMessageToGemini(message: Anthropic.Messages.MessageParam): Content {
	return {
		role: message.role === "assistant" ? "model" : "user",
		parts: convertAnthropicContentToGemini(message.content as DiracStorageMessage["content"]),
	}
}

export function unescapeGeminiContent(content: string) {
	return content.replace(/\\n/g, "\n")
}

export function convertGeminiResponseToAnthropic(response: GenerateContentResponse): Anthropic.Messages.Message {
	const content: Anthropic.Messages.ContentBlock[] = []

	const text = response.text
	if (text) {
		content.push({ type: "text", text } as Anthropic.Messages.TextBlock)
	}

	let stop_reason: Anthropic.Messages.Message["stop_reason"] = null
	const finishReason = response.candidates?.[0]?.finishReason
	if (finishReason) {
		switch (finishReason) {
			case "STOP":
				stop_reason = "end_turn"
				break
			case "MAX_TOKENS":
				stop_reason = "max_tokens"
				break
			case "SAFETY":
			case "RECITATION":
			case "OTHER":
				stop_reason = "stop_sequence"
				break
		}
	}

	return {
		id: `msg_${Date.now()}`,
		type: "message",
		role: "assistant",
		content,
		model: "",
		stop_reason,
		stop_sequence: null, // Gemini doesn't provide this information
		container: null,
		stop_details: null,

		usage: {
			input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
			output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
			cache_creation_input_tokens: undefined,
			cache_read_input_tokens: undefined,
			cache_creation: undefined,
			cache_read: undefined,
			inference_geo: undefined,
			server_tool_use: undefined,
			service_tier: undefined,
		} as any,
	}
}
