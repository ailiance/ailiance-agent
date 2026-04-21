import { ResponseInput, ResponseInputMessageContentList, ResponseReasoningItem } from "openai/resources/responses/responses"
import {
	DiracAssistantThinkingBlock,
	DiracAssistantToolUseBlock,
	DiracContent,
	DiracImageContentBlock,
	DiracStorageMessage,
	DiracTextContentBlock,
	DiracUserToolResultContentBlock,
	DiracAssistantRedactedThinkingBlock,
} from "@/shared/messages/content"

/**
 * Converts an array of DiracStorageMessage objects (extension of Anthropic format) to a ResponseInput array to use with OpenAI's Responses API.
 *
 * ## Key Differences from Chat Completions API
 *
 * The Responses API has stricter requirements than the Chat Completions API:
 *
 * ### Chat Completions API:
 * - Messages are simple role/content pairs
 * - System prompts are separate messages with role="system"
 * - No explicit reasoning item structure
 * - More forgiving about message ordering
 *
 * ### Responses API:
 * - Uses an "input" array of heterogeneous items (messages, reasoning, function_calls, etc.)
 * - System prompts go in an "instructions" field, not as messages
 * - Reasoning items MUST be immediately followed by a message or function_call
 * - Strict ordering requirements match training data distribution
 *
 * ## The Reasoning Item Constraint
 *
 * **THE CRITICAL ERROR:** "Item 'rs_...' of type 'reasoning' was provided without its required following item"
 *
 * This error occurs when reasoning items are orphaned or separated from their corresponding output.
 *
 * ### What Causes This Error:
 * ```
 * ❌ WRONG - Reasoning orphaned between turns:
 * [
 *   { role: "user", content: [...] },
 *   { type: "reasoning", id: "rs_abc", summary: [...] },  // ← ORPHANED!
 *   { type: "message", role: "assistant", content: [...] },
 *   { role: "user", content: [...] }
 * ]
 * ```
 *
 * ### The Fix - Keep Complete Assistant Turns Together:
 * ```
 * ✅ CORRECT - Reasoning paired with its message:
 * [
 *   { role: "user", content: [...] },
 *   { type: "reasoning", id: "rs_abc", summary: [...] },
 *   { type: "message", role: "assistant", content: [...] },  // ← Immediately follows reasoning
 *   { role: "user", content: [...] }
 * ]
 * ```
 *
 * **Per OpenAI Engineering Guidance:**
 * - ❌ WRONG: `content += filter(lambda x: x.type == "reasoning", resp.output)`
 * - ✅ CORRECT: `content += resp.output`
 *
 * Never extract only reasoning items - always include the complete output sequence
 * (reasoning + message/function_call) as provided by the API.
 *
 * ## Implementation Strategy
 *
 * 1. **Separate processing for assistant vs user messages** - Assistant turns need special
 *    handling to maintain reasoning-message pairing
 * 2. **Collect all assistant items together** - Gather reasoning, messages, and function_calls
 *    for the entire assistant turn before validating
 * 3. **Validate pairing within each turn** - Ensure each reasoning item is immediately followed
 *    by a message or function_call, inserting placeholders if needed
 * 4. **Flush complete turns atomically** - Add all items from an assistant turn together to
 *    maintain proper sequencing
 *
 * @link https://community.openai.com/t/openai-api-error-function-call-was-provided-without-its-required-reasoning-item-the-real-issue/1355347
 *
 * @param messages - Array of DiracStorageMessage objects to be converted
 * @returns ResponseInput array containing the transformed messages with proper reasoning pairing
 */
export function convertToOpenAIResponsesInput(
	_messages: DiracStorageMessage[],
	options?: { usePreviousResponseId?: boolean },
): {
	input: ResponseInput
	previousResponseId?: string
} {
	// Chain from the latest stored Responses API assistant message when available.
	// When chaining, only send new items after that assistant turn.
	let previousResponseId: string | undefined
	let messages = _messages
	if (options?.usePreviousResponseId) {
		for (let i = _messages.length - 1; i >= 0; i--) {
			const msg = _messages[i]
			// Must be less than 24 hours old to be considered for chaining as the previous Id is only valid for 24 hours.
			// Set to 23 hours to account for any potential delays in processing.
			const isLessThan23HoursOld = msg.ts ? Date.now() - msg.ts < 23 * 60 * 60 * 1000 : false
			if (msg.role === "assistant" && msg.id && isLessThan23HoursOld) {
				previousResponseId = msg.id
				messages = _messages.slice(i + 1)
				break
			}
		}
	}

	const allItems: any[] = []
	const toolUseIdToCallId = new Map<string, string>()

	for (const m of messages) {
		if (typeof m.content === "string") {
			allItems.push({ role: m.role, content: [{ type: "input_text", text: m.content }] })
			continue
		}

		if (m.role === "assistant") {
			// For assistant messages, we must ensure reasoning items are IMMEDIATELY followed
			// by their corresponding message or function_call. Process the entire assistant
			// turn and ensure proper pairing.
			const reasoningItems: any[] = []
			const outputItems: any[] = []

			for (const _part of m.content) {
				const part = _part as DiracContent
				switch (part.type) {
					case "thinking": {
						const thinkingBlock = part as DiracAssistantThinkingBlock
						const hasThinkingContent = thinkingBlock.thinking && thinkingBlock.thinking.trim().length > 0
						const hasSummaryContent =
							thinkingBlock.summary && Array.isArray(thinkingBlock.summary) && thinkingBlock.summary.length > 0

						if (thinkingBlock.call_id && thinkingBlock.call_id.length > 0) {
							let summary: any[] = []
							if (hasSummaryContent) {
								summary = thinkingBlock.summary as any[]
							} else if (hasThinkingContent) {
								summary = [{ type: "summary_text", text: thinkingBlock.thinking }]
							}

							reasoningItems.push({
								id: thinkingBlock.call_id,
								type: "reasoning",
								summary,
							} as ResponseReasoningItem)
						}
						break
					}
					case "redacted_thinking": {
						const redactedBlock = part as DiracAssistantRedactedThinkingBlock
						if (redactedBlock.call_id && redactedBlock.call_id.length > 0) {
							const reasoningItem: any = {
								id: redactedBlock.call_id,
								type: "reasoning",
								summary: [],
							}
							if (redactedBlock.data) {
								reasoningItem.encrypted_content = redactedBlock.data
							}
							reasoningItems.push(reasoningItem as ResponseReasoningItem)
						}
						break
					}
					case "text": {
						const textBlock = part as DiracTextContentBlock
						const messageItem: any = {
							type: "message",
							role: "assistant",
							content: [{ type: "output_text", text: textBlock.text || "" }],
						}
						if (textBlock.call_id) {
							messageItem.id = textBlock.call_id
						}
						outputItems.push(messageItem)
						break
					}
					case "image": {
						const imageBlock = part as DiracImageContentBlock
						const imageItem: any = {
							type: "message",
							role: "assistant",
							content: [{ type: "output_text", text: `[image:${imageBlock.source.type === "base64" ? imageBlock.source.media_type : "url"}]` }],
						}
						if (imageBlock.call_id) {
							imageItem.id = imageBlock.call_id
						}
						outputItems.push(imageItem)
						break
					}
					case "tool_use": {
						const toolUseBlock = part as DiracAssistantToolUseBlock
						const call_id = toolUseBlock.call_id || toolUseBlock.id
						if (toolUseBlock.call_id) {
							toolUseIdToCallId.set(toolUseBlock.id, toolUseBlock.call_id)
						}
						outputItems.push({
							type: "function_call",
							call_id,
							id: !toolUseBlock.id.startsWith("fc_") ? `fc_${toolUseBlock.id.slice(0, 50)}` : toolUseBlock.id,
							name: toolUseBlock.name,
							arguments: JSON.stringify(toolUseBlock.input ?? {}),
						})
						break
					}
				}
			}

			// Pair reasoning items with their corresponding output items.
			// OpenAI Responses API requires that a reasoning item be immediately followed by the item it belongs to.
			// We use the shared ID prefix (the 24 characters after 'rs_' or 'fc_') to identify pairings.
			const assistantTurnItems: any[] = []
			const usedReasoningIds = new Set<string>()

			for (const outputItem of outputItems) {
				const outputId = outputItem.id || outputItem.call_id
				if (outputId) {
					// Extract the unique part of the ID (after the prefix)
					const outputIdSuffix = outputId.includes("_") ? outputId.split("_")[1] : outputId
					const outputIdPrefix = outputIdSuffix.slice(0, 24)

					// Find a matching reasoning item
					const matchingReasoning = reasoningItems.find((r) => {
						if (usedReasoningIds.has(r.id)) return false
						const reasoningIdSuffix = r.id.includes("_") ? r.id.split("_")[1] : r.id
						return reasoningIdSuffix.startsWith(outputIdPrefix)
					})

					if (matchingReasoning) {
						assistantTurnItems.push(matchingReasoning)
						usedReasoningIds.add(matchingReasoning.id)
					}
				}
				assistantTurnItems.push(outputItem)
			}

			// Add any remaining (orphaned) reasoning items at the end, followed by a placeholder if needed.
			// However, orphaned reasoning items are rare and usually indicate a bug in generation or storage.
			for (const reasoningItem of reasoningItems) {
				if (!usedReasoningIds.has(reasoningItem.id)) {
					assistantTurnItems.push(reasoningItem)
					// Every reasoning item MUST be followed by something.
					assistantTurnItems.push({
						type: "message",
						role: "assistant",
						content: [{ type: "output_text", text: "" }],
					})
				}
			}

			allItems.push(...assistantTurnItems)
		} else {
			// User messages - collect all content
			const messageContent: ResponseInputMessageContentList = []

			for (const _part of m.content) {
				const part = _part as DiracContent
				switch (part.type) {
					case "text": {
						const textBlock = part as DiracTextContentBlock
						messageContent.push({ type: "input_text", text: textBlock.text || "" })
						break
					}
					case "image": {
						const imageBlock = part as DiracImageContentBlock
						messageContent.push({
							type: "input_image",
							detail: "auto",
							image_url: imageBlock.source.type === "base64" ? `data:${imageBlock.source.media_type};base64,${imageBlock.source.data}` : (imageBlock.source as any).url,
						})
						break
					}
					case "tool_result": {
						const toolResultBlock = part as DiracUserToolResultContentBlock
						// Flush any pending message content before adding tool result
						if (messageContent.length > 0) {
							allItems.push({ role: m.role, content: [...messageContent] })
							messageContent.length = 0
						}
						const call_id =
							toolResultBlock.call_id ||
							toolUseIdToCallId.get(toolResultBlock.tool_use_id) ||
							toolResultBlock.tool_use_id
						allItems.push({
							type: "function_call_output",
							call_id,
							output:
								typeof toolResultBlock.content === "string"
									? toolResultBlock.content
									: JSON.stringify(toolResultBlock.content),
						})
						break
					}
				}
			}

			// Flush any remaining user message content
			if (messageContent.length > 0) {
				allItems.push({ role: m.role, content: [...messageContent] })
			}
		}
	}

	return { input: allItems, previousResponseId }
}
