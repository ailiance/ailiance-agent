/**
 * Bedrock Converse API stream parser.
 *
 * Converts the raw AWS SDK async iterable from ConverseStreamCommand
 * into typed ApiStreamChunk events. Handles:
 *  - text content blocks
 *  - reasoning / thinking blocks (Anthropic Claude via Bedrock)
 *  - tool_use blocks
 *  - usage metadata (with prompt cache tokens)
 *  - stream error events
 */

import type { ModelInfo } from "@shared/api"
import { calculateApiCostOpenAI } from "@utils/cost"
import type { ApiStream } from "./stream"

// ---------------------------------------------------------------------------
// Local type definitions for Bedrock stream shapes
// (The AWS SDK types don't fully cover streaming response fields)
// ---------------------------------------------------------------------------

interface ExtendedMetadata {
	usage?: {
		inputTokens?: number
		outputTokens?: number
		cacheReadInputTokens?: number
		cacheWriteInputTokens?: number
	}
	additionalModelResponseFields?: {
		thinkingResponse?: {
			reasoning?: Array<{
				type: string
				text?: string
				signature?: string
			}>
		}
	}
}

interface ContentBlockStart {
	contentBlockIndex?: number
	start?: {
		type?: string
		thinking?: string
		signature?: string
		toolUse?: ToolUseStart
	}
	contentBlock?: {
		type?: string
		thinking?: string
		signature?: string
	}
	type?: string
	thinking?: string
	data?: string
}

interface ContentBlockDelta {
	contentBlockIndex?: number
	delta?: {
		type?: string
		thinking?: string
		text?: string
		signature?: string
		reasoningContent?: {
			text?: string
		}
		toolUse?: ToolUseDelta
	}
}

interface ToolUseStart {
	toolUseId: string
	name: string
}

interface ToolUseDelta {
	input: string
}

// ---------------------------------------------------------------------------
// Stream parser
// ---------------------------------------------------------------------------

/**
 * Parses a raw Bedrock ConverseStream async iterable into ApiStreamChunks.
 *
 * @param stream   The async iterable from `response.stream` returned by the AWS SDK.
 * @param modelInfo Model metadata used for cost calculation.
 */
export async function* parseBedrockConverseStream(stream: AsyncIterable<any>, modelInfo: ModelInfo): ApiStream {
	// Buffer content by contentBlockIndex to handle multi-block responses correctly
	const contentBuffers: Record<number, string> = {}
	const blockTypes = new Map<number, "reasoning" | "text">()
	const activeToolCalls: Map<number, { toolUseId: string; name: string }> = new Map()

	for await (const chunk of stream) {
		// Handle thinking response in additionalModelResponseFields (LangChain format)
		const metadata = chunk.metadata as ExtendedMetadata | undefined
		if (metadata?.additionalModelResponseFields?.thinkingResponse) {
			const thinkingResponse = metadata.additionalModelResponseFields.thinkingResponse
			if (thinkingResponse.reasoning && Array.isArray(thinkingResponse.reasoning)) {
				for (const reasoningBlock of thinkingResponse.reasoning) {
					if (reasoningBlock.type === "text" && reasoningBlock.text) {
						yield {
							type: "reasoning",
							reasoning: reasoningBlock.text,
							...(reasoningBlock.signature ? { signature: reasoningBlock.signature } : {}),
						}
					}
				}
			}
		}

		// Handle metadata events with token usage information
		if (chunk.metadata?.usage) {
			const inputTokens = chunk.metadata.usage.inputTokens || 0
			const outputTokens = chunk.metadata.usage.outputTokens || 0
			const cacheReadInputTokens = chunk.metadata.usage.cacheReadInputTokens || 0
			const cacheWriteInputTokens = chunk.metadata.usage.cacheWriteInputTokens || 0

			yield {
				type: "usage",
				inputTokens,
				outputTokens,
				cacheReadTokens: cacheReadInputTokens,
				cacheWriteTokens: cacheWriteInputTokens,
				totalCost: calculateApiCostOpenAI(
					modelInfo,
					inputTokens,
					outputTokens,
					cacheWriteInputTokens,
					cacheReadInputTokens,
				),
			}
		}

		// Handle content block start - check if Bedrock uses Anthropic SDK format
		if (chunk.contentBlockStart) {
			const blockStart = chunk.contentBlockStart as ContentBlockStart
			const blockIndex = chunk.contentBlockStart.contentBlockIndex

			if (blockStart.start?.toolUse) {
				const toolUse = blockStart.start.toolUse
				if (toolUse.toolUseId && toolUse.name && blockIndex !== undefined) {
					activeToolCalls.set(blockIndex, {
						toolUseId: toolUse.toolUseId,
						name: toolUse.name,
					})
				}
			}

			// Check for thinking block in various possible formats
			if (
				blockStart.start?.type === "thinking" ||
				blockStart.contentBlock?.type === "thinking" ||
				blockStart.type === "thinking"
			) {
				if (blockIndex !== undefined) {
					blockTypes.set(blockIndex, "reasoning")
					// Capture signature if provided at block start
					const signature = blockStart.start?.signature || blockStart.contentBlock?.signature || undefined
					// Initialize content if provided
					const initialContent =
						blockStart.start?.thinking || blockStart.contentBlock?.thinking || blockStart.thinking || ""
					if (initialContent || signature) {
						yield {
							type: "reasoning",
							reasoning: initialContent || "",
							...(signature ? { signature } : {}),
						}
					}
				}
			}

			// Handle redacted thinking blocks
			if (
				blockStart.start?.type === "redacted_thinking" ||
				blockStart.contentBlock?.type === "redacted_thinking" ||
				blockStart.type === "redacted_thinking"
			) {
				yield {
					type: "reasoning",
					reasoning: "[Redacted thinking block]",
					...(blockStart.data ? { redacted_data: blockStart.data } : {}),
				}
			}
		}

		// Handle content block delta - accumulate content by block index
		if (chunk.contentBlockDelta) {
			const blockIndex = chunk.contentBlockDelta.contentBlockIndex

			if (blockIndex !== undefined) {
				// Initialize buffer for this block if it doesn't exist
				if (!(blockIndex in contentBuffers)) {
					contentBuffers[blockIndex] = ""
				}

				// Check if this is a thinking block
				const blockType = blockTypes.get(blockIndex)
				const delta = chunk.contentBlockDelta.delta as ContentBlockDelta["delta"]

				// Handle signature delta - used to send thinking block signatures
				if (delta?.type === "signature_delta" && delta?.signature) {
					yield {
						type: "reasoning",
						reasoning: "", // reasoning text already sent via thinking_delta
						signature: delta.signature,
					}
				}
				// Handle thinking delta (Anthropic SDK format)
				else if (delta?.type === "thinking_delta" || delta?.thinking) {
					const thinkingContent = delta.thinking || delta.text || ""
					if (thinkingContent) {
						yield {
							type: "reasoning",
							reasoning: thinkingContent,
						}
					}
				} else if (delta?.reasoningContent?.text) {
					// Handle reasoning content (Bedrock format)
					const reasoningText = delta.reasoningContent.text
					if (reasoningText) {
						yield {
							type: "reasoning",
							reasoning: reasoningText,
						}
					}
				} else if (delta?.toolUse?.input !== undefined) {
					const toolCall = activeToolCalls.get(blockIndex)
					const toolInput = delta.toolUse.input
					if (toolCall && typeof toolInput === "string") {
						yield {
							type: "tool_calls",
							tool_call: {
								call_id: toolCall.toolUseId,
								function: {
									id: toolCall.toolUseId,
									name: toolCall.name,
									arguments: toolInput,
								},
							},
						}
					}
				} else if (chunk.contentBlockDelta.delta?.text) {
					// Handle regular text content
					const textContent = chunk.contentBlockDelta.delta.text
					contentBuffers[blockIndex] += textContent

					// Stream based on block type
					if (blockType === "reasoning") {
						yield {
							type: "reasoning",
							reasoning: textContent,
						}
					} else {
						yield {
							type: "text",
							text: textContent,
						}
					}
				}
			}
		}

		// Handle content block stop - clean up buffers
		if (chunk.contentBlockStop) {
			const blockIndex = chunk.contentBlockStop.contentBlockIndex

			if (blockIndex !== undefined) {
				// Clean up buffers and tracking for this block
				delete contentBuffers[blockIndex]
				blockTypes.delete(blockIndex)
				activeToolCalls.delete(blockIndex)
			}
		}

		// Handle errors with unified error handling
		yield* handleBedrockStreamError(chunk)
	}
}

/**
 * Handles Bedrock stream error events in a unified way.
 * Yields error text chunks for recoverable errors,
 * throws for context window errors (so retry/truncation logic can handle them).
 */
function* handleBedrockStreamError(chunk: any): Generator<{ type: "text"; text: string }> {
	if (chunk.internalServerException) {
		yield {
			type: "text",
			text: `[ERROR] Internal server error: ${chunk.internalServerException.message}`,
		}
	} else if (chunk.modelStreamErrorException) {
		yield {
			type: "text",
			text: `[ERROR] Model stream error: ${chunk.modelStreamErrorException.message}`,
		}
	} else if (chunk.validationException) {
		// Check if this is a context window error - if so, throw it
		// so the retry mechanism can handle truncation
		const message = chunk.validationException.message || ""
		const isContextError = /input.*too long|context.*exceed|maximum.*token|input length.*max.*tokens/i.test(message)

		if (isContextError) {
			// Throw as exception so context management can handle it
			throw chunk.validationException
		}

		// Otherwise yield as error text
		yield {
			type: "text",
			text: `[ERROR] Validation error: ${message}`,
		}
	} else if (chunk.throttlingException) {
		yield {
			type: "text",
			text: `[ERROR] Throttling error: ${chunk.throttlingException.message}`,
		}
	} else if (chunk.serviceUnavailableException) {
		yield {
			type: "text",
			text: `[ERROR] Service unavailable: ${chunk.serviceUnavailableException.message}`,
		}
	}
}
