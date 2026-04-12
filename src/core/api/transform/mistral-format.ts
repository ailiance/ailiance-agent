import { Anthropic } from "@anthropic-ai/sdk"

export type MistralMessage =
	| {
			role: "system" | "user" | "assistant"
			content: string
	  }
	| {
			role: "user"
			content: (
				| { type: "text"; text: string }
				| { type: "image_url"; imageUrl: { url: string } }
			)[]
	  }

export function convertToMistralMessages(anthropicMessages: Anthropic.Messages.MessageParam[]): MistralMessage[] {
	const mistralMessages: MistralMessage[] = []

	for (const anthropicMessage of anthropicMessages) {
		if (typeof anthropicMessage.content === "string") {
			mistralMessages.push({
				role: anthropicMessage.role as any,
				content: anthropicMessage.content,
			})
		} else {
			if (anthropicMessage.role === "user") {
				// Filter to only include text and image blocks
				const textAndImageBlocks = anthropicMessage.content.filter(
					(part) => part.type === "text" || part.type === "image",
				)

				if (textAndImageBlocks.length > 0) {
					mistralMessages.push({
						role: "user",
						content: textAndImageBlocks.map((part) => {
							if (part.type === "image") {
								return {
									type: "image_url",
									imageUrl: {
										url: `data:${part.source.media_type};base64,${part.source.data}`,
									},
								}
							}
							return { type: "text", text: part.type === "text" ? part.text : "" }
						}),
					})
				}
			} else if (anthropicMessage.role === "assistant") {
				// Only process text blocks - assistant cannot send images or other content types in Mistral's API format
				const textBlocks = anthropicMessage.content.filter((part) => part.type === "text")

				if (textBlocks.length > 0) {
					const content = textBlocks
						.map((part) => (part.type === "text" ? part.text : ""))
						.join("\n")

					mistralMessages.push({
						role: "assistant",
						content,
					})
				}
			}
		}
	}

	return mistralMessages
}
