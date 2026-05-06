import { setTimeout as setTimeoutPromise } from "node:timers/promises"
import { sendPartialMessageEvent } from "@core/controller/ui/subscribeToPartialMessage"
import { formatResponse } from "@core/prompts/responses"
import { showSystemNotification } from "@integrations/notifications"
import { processFilesIntoText } from "@integrations/misc/extract-text"
import { ErrorService } from "@services/error"
import { telemetryService } from "@services/telemetry"
import { findLastIndex } from "@shared/array"
import { DiracApiReqCancelReason } from "@shared/ExtensionMessage"
import { DiracContent, DiracUserContent } from "@shared/messages/content"
import { DiracMessageModelInfo } from "@shared/messages/metrics"
import { convertDiracMessageToProto } from "@shared/proto-conversions/dirac-message"
import { Logger } from "@shared/services/Logger"
import { Session } from "@shared/services/Session"
import { isLocalModel } from "@utils/model-utils"
import pWaitFor from "p-wait-for"
import type { Task } from "./index"
import { StreamChunkCoordinator } from "./StreamChunkCoordinator"
import { TaskState } from "./TaskState"
import { updateApiReqMsg } from "./utils"

/**
 * AgentLoopRunner encapsulates the ReAct agent loop extracted from Task.
 *
 * Sprint 2 PR3 — step 3A: initiateLoop extracted from Task.initiateTaskLoop.
 * Sprint 2 PR3 — step 3B: makeRequest extracted from Task.recursivelyMakeDiracRequests.
 */
export class AgentLoopRunner {
	constructor(
		private readonly task: Task,
		private readonly taskState: TaskState,
	) {}

	/**
	 * Drive the outer while-loop that calls makeRequest
	 * until the task completes or is aborted.
	 *
	 * Extracted from Task.initiateTaskLoop — public API of Task is preserved
	 * via the thin wrapper that delegates here.
	 */
	async initiateLoop(userContent: DiracContent[]): Promise<void> {
		let nextUserContent = userContent
		let includeFileDetails = true
		while (!this.taskState.abort) {
			const didEndLoop = await this.task.recursivelyMakeDiracRequests(nextUserContent, includeFileDetails)
			includeFileDetails = false // we only need file details the first time

			//  The way this agentic loop works is that dirac will be given a task that he then calls tools to complete. unless there's an attempt_completion call, we keep responding back to him with his tool's responses until he either attempt_completion or does not use anymore tools. If he does not use anymore tools, we ask him to consider if he's completed the task and then call attempt_completion, otherwise proceed with completing the task.

			//const totalCost = this.calculateApiCost(totalInputTokens, totalOutputTokens)
			if (didEndLoop) {
				// For now a task never 'completes'. This will only happen if the user hits max requests and denies resetting the count.
				//this.say("task_completed", `Task completed. Total API usage cost: ${totalCost}`)
				break
			}
			// this.say(
			// 	"tool",
			// 	"Dirac responded with only text blocks but has not called attempt_completion yet. Forcing him to continue with task..."
			// )
			nextUserContent = [
				{
					type: "text",
					text: formatResponse.noToolsUsed(this.taskState.useNativeToolCalls),
				},
			]
			this.taskState.consecutiveMistakeCount++
		}
	}

	/**
	 * Execute one ReAct iteration: stream an API request, process chunks,
	 * handle tool calls, and recurse with tool results.
	 *
	 * Extracted from Task.recursivelyMakeDiracRequests — public API of Task is
	 * preserved via the thin wrapper that delegates here.
	 */
	async makeRequest(userContent: DiracContent[], includeFileDetails = false): Promise<boolean> {
		if (this.taskState.abort) {
			throw new Error("Task instance aborted")
		}

		const { model, providerId, customPrompt, mode } = this.task.getCurrentProviderInfo()
		if (providerId && model.id) {
			try {
				await this.task.modelContextTracker.recordModelUsage(providerId, model.id, mode)
			} catch {}
		}

		const modelInfo: DiracMessageModelInfo = {
			modelId: model.id,
			providerId: providerId,
			mode: mode,
		}

		const mistakeResult = await this.handleMistakeLimitReached(userContent)
		if (mistakeResult.didEndLoop) {
			return true
		}
		userContent = mistakeResult.userContent

		const previousApiReqIndex = findLastIndex(
			this.task.messageStateHandler.getDiracMessages(),
			(m) => m.say === "api_req_started",
		)
		const isFirstRequest =
			this.task.messageStateHandler.getDiracMessages().filter((m) => m.say === "api_req_started").length === 0
		await this.task.initializeCheckpoints(isFirstRequest)

		const useCompactPrompt = customPrompt === "compact" && isLocalModel(this.task.getCurrentProviderInfo())
		const shouldCompact = await this.task.determineContextCompaction(previousApiReqIndex)

		const apiRequestData = await this.task.prepareApiRequest({
			userContent,
			shouldCompact,
			includeFileDetails,
			useCompactPrompt,
			previousApiReqIndex,
			isFirstRequest,
			providerId,
			modelId: model.id,
			mode: modelInfo.mode,
		})
		this.taskState.didSwitchToActMode = false // Reset after use
		userContent = apiRequestData.userContent
		const lastApiReqIndex = apiRequestData.lastApiReqIndex

		if (apiRequestData.isDirectResponse && apiRequestData.directResponseText) {
			await this.task.say("text", apiRequestData.directResponseText)
			return true
		}

		try {
			const taskMetrics: {
				cacheWriteTokens: number
				cacheReadTokens: number
				inputTokens: number
				outputTokens: number
				totalCost: number | undefined
				reasoningTokens: number
			} = {
				cacheWriteTokens: 0,
				cacheReadTokens: 0,
				inputTokens: 0,
				outputTokens: 0,
				reasoningTokens: 0,
				totalCost: undefined,
			}
			let didFinalizeApiReqMsg = false
			let usageChunkSideEffectsQueue = Promise.resolve()

			const updateApiReqMsgFromMetrics = async (
				cancelReason?: DiracApiReqCancelReason,
				streamingFailedMessage?: string,
			) => {
				const modelInfo = this.task.api.getModel().info
				const contextWindow = modelInfo.contextWindow
				const totalTokens =
					taskMetrics.inputTokens +
					taskMetrics.outputTokens +
					(taskMetrics.cacheWriteTokens || 0) +
					(taskMetrics.cacheReadTokens || 0)
				const contextUsagePercentage = contextWindow ? Math.round((totalTokens / contextWindow) * 100) : undefined
				await updateApiReqMsg({
					partial: true,
					messageStateHandler: this.task.messageStateHandler,
					lastApiReqIndex,
					inputTokens: taskMetrics.inputTokens,
					outputTokens: taskMetrics.outputTokens,
					reasoningTokens: taskMetrics.reasoningTokens,
					cacheWriteTokens: taskMetrics.cacheWriteTokens,
					cacheReadTokens: taskMetrics.cacheReadTokens,
					api: this.task.api,
					totalCost: taskMetrics.totalCost,
					cancelReason,
					streamingFailedMessage,
					contextWindow,
					contextUsagePercentage,
				})
			}

			const queueUsageChunkSideEffects = (
				usageInputTokens: number,
				usageOutputTokens: number,
				chunkOptions?: { cacheWriteTokens?: number; cacheReadTokens?: number; totalCost?: number; stopReason?: string },
			) => {
				usageChunkSideEffectsQueue = usageChunkSideEffectsQueue
					.then(async () => {
						if (didFinalizeApiReqMsg || this.taskState.abort) {
							return
						}

						await updateApiReqMsgFromMetrics()
						await this.task.postStateToWebview()
						await telemetryService.captureTokenUsage(
							this.task.ulid,
							usageInputTokens,
							usageOutputTokens,
							providerId,
							model.id,
							chunkOptions,
						)
					})
					.catch((error) => {
						Logger.debug(`[Task ${this.task.taskId}] Failed to process usage chunk side effects: ${error}`)
					})
			}

			const finalizeApiReqMsg = async (cancelReason?: DiracApiReqCancelReason, streamingFailedMessage?: string) => {
				didFinalizeApiReqMsg = true
				await usageChunkSideEffectsQueue
				await updateApiReqMsgFromMetrics(cancelReason, streamingFailedMessage)
				const lastApiReqIndex = findLastIndex(
					this.task.messageStateHandler.getDiracMessages(),
					(m) => m.say === "api_req_started",
				)
				if (lastApiReqIndex !== -1) {
					await this.task.messageStateHandler.updateDiracMessage(lastApiReqIndex, { partial: false })
				}
			}

			const abortStream = async (cancelReason: DiracApiReqCancelReason, streamingFailedMessage?: string) => {
				Session.get().finalizeRequest()

				if (this.task.diffViewProvider.isEditing) {
					await this.task.diffViewProvider.revertChanges()
				}

				const diracMessages = this.task.messageStateHandler.getDiracMessages()
				diracMessages.forEach((msg) => {
					if (msg.partial) {
						msg.partial = false
						Logger.log("updating partial message", msg)
					}
				})
				await finalizeApiReqMsg(cancelReason, streamingFailedMessage)
				await this.task.messageStateHandler.saveDiracMessagesAndUpdateHistory()

				await this.task.messageStateHandler.addToApiConversationHistory({
					role: "assistant",
					content: [
						{
							type: "text",
							text:
								assistantMessage +
								`\n\n[${
									cancelReason === "streaming_failed"
										? "Response interrupted by API Error"
										: "Response interrupted by user"
								}]`,
						},
					],
					modelInfo,
					metrics: {
						tokens: {
							prompt: taskMetrics.inputTokens,
							completion: taskMetrics.outputTokens,
							cached: (taskMetrics.cacheWriteTokens ?? 0) + (taskMetrics.cacheReadTokens ?? 0),
						},
						cost: taskMetrics.totalCost,
					},
					ts: Date.now(),
				})

				telemetryService.captureConversationTurnEvent(
					this.task.ulid,
					providerId,
					modelInfo.modelId,
					"assistant",
					modelInfo.mode,
					undefined,
					this.taskState.useNativeToolCalls,
				)

				this.taskState.didFinishAbortingStream = true
			}

			// reset streaming state
			this.taskState.currentStreamingContentIndex = 0
			this.taskState.assistantMessageContent = []
			this.taskState.didCompleteReadingStream = false
			this.taskState.userMessageContent = []
			this.taskState.userMessageContentReady = false
			this.taskState.didRejectTool = false
			this.taskState.didAlreadyUseTool = false
			this.taskState.presentAssistantMessageLocked = false
			this.taskState.presentAssistantMessageHasPendingUpdates = false
			this.taskState.didAutomaticallyRetryFailedApiRequest = false
			await this.task.diffViewProvider.reset()
			this.task.streamHandler.reset()
			this.taskState.toolUseIdMap.clear()

			const { toolUseHandler, reasonsHandler } = this.task.streamHandler.getHandlers()
			// agent-kiki fork: tracing — measure latency of every API roundtrip
			// so the planner turn is recorded even if the stream errors out
			// before any tool executes.
			const plannerStartedAt = Date.now()
			const stream = this.task.attemptApiRequest(previousApiReqIndex, shouldCompact)

			let assistantMessageId = ""
			let assistantMessage = ""
			let assistantTextOnly = ""
			let assistantTextSignature: string | undefined

			this.taskState.isStreaming = true
			let didReceiveUsageChunk = false
			let stopReason: string | undefined
			let didFinalizeReasoningForUi = false

			const finalizePendingReasoningMessage = async (thinking: string): Promise<boolean> => {
				const pendingReasoningIndex = findLastIndex(
					this.task.messageStateHandler.getDiracMessages(),
					(message) => message.type === "say" && message.say === "reasoning" && message.partial === true,
				)

				if (pendingReasoningIndex === -1) {
					return false
				}

				await this.task.messageStateHandler.updateDiracMessage(pendingReasoningIndex, {
					text: thinking,
					partial: false,
				})
				const completedReasoning = this.task.messageStateHandler.getDiracMessages()[pendingReasoningIndex]
				if (completedReasoning) {
					await sendPartialMessageEvent(convertDiracMessageToProto(completedReasoning))
					await this.task.postStateToWebview()
				}
				return true
			}

			Session.get().startApiCall()
			let streamCoordinator: StreamChunkCoordinator | undefined

			try {
				streamCoordinator = new StreamChunkCoordinator(stream, {
					onUsageChunk: (chunk) => {
						this.task.streamHandler.setRequestId(chunk.id)
						didReceiveUsageChunk = true
						taskMetrics.inputTokens += chunk.inputTokens
						taskMetrics.outputTokens += chunk.outputTokens
						taskMetrics.reasoningTokens += chunk.reasoningTokens ?? chunk.thoughtsTokenCount ?? 0
						taskMetrics.cacheWriteTokens += chunk.cacheWriteTokens ?? 0
						taskMetrics.cacheReadTokens += chunk.cacheReadTokens ?? 0
						taskMetrics.totalCost = chunk.totalCost ?? taskMetrics.totalCost
						stopReason = chunk.stopReason ?? stopReason
						queueUsageChunkSideEffects(chunk.inputTokens, chunk.outputTokens, {
							cacheWriteTokens: chunk.cacheWriteTokens,
							cacheReadTokens: chunk.cacheReadTokens,
							totalCost: chunk.totalCost,
							stopReason: chunk.stopReason,
						})
					},
				})

				let shouldInterruptStream = false

				while (true) {
					const chunk = await streamCoordinator.nextChunk()
					if (chunk) {
					}
					if (!chunk) {
						break
					}
					if (!this.taskState.taskFirstTokenTimeMs) {
						this.taskState.taskFirstTokenTimeMs = Math.max(0, Date.now() - this.taskState.taskStartTimeMs)
					}

					switch (chunk.type) {
						case "reasoning": {
							const details = chunk.details ? (Array.isArray(chunk.details) ? chunk.details : [chunk.details]) : []
							this.task.streamHandler.processReasoningDelta({
								id: chunk.id,
								reasoning: chunk.reasoning,
								signature: chunk.signature,
								details,
								redacted_data: chunk.redacted_data,
							})

							if (!this.taskState.abort) {
								const thinkingBlock = reasonsHandler.getCurrentReasoning()
								if (thinkingBlock?.thinking && chunk.reasoning && assistantMessage.length === 0) {
									await this.task.say("reasoning", thinkingBlock.thinking, undefined, undefined, true)
								}
							}
							break
						}
						case "tool_calls": {
							this.task.streamHandler.processToolUseDelta(
								{
									id: chunk.tool_call.function?.id,
									type: "tool_use",
									name: chunk.tool_call.function?.name,
									input: chunk.tool_call.function?.arguments,
									signature: chunk?.signature,
								},
								chunk.tool_call.call_id,
							)
							if (chunk.tool_call.function?.id && chunk.tool_call.call_id) {
								this.taskState.toolUseIdMap.set(chunk.tool_call.call_id, chunk.tool_call.function.id)
							}

							await this.task.processNativeToolCalls(
								assistantTextOnly,
								toolUseHandler.getPartialToolUsesAsContent(),
							)
							break
						}
						case "text": {
							const currentReasoning = reasonsHandler.getCurrentReasoning()
							if (currentReasoning?.thinking && !didFinalizeReasoningForUi) {
								const finalizedReasoning = await finalizePendingReasoningMessage(currentReasoning.thinking)
								if (finalizedReasoning) {
									didFinalizeReasoningForUi = true
								}
							}
							if (chunk.signature) {
								assistantTextSignature = chunk.signature
							}
							this.task.streamHandler.processTextDelta(chunk)

							if (chunk.id) {
								assistantMessageId = chunk.id
							}
							assistantMessage += chunk.text
							assistantTextOnly += chunk.text
							const prevLength = this.taskState.assistantMessageContent.length

							await this.task.processNativeToolCalls(
								assistantTextOnly,
								toolUseHandler.getPartialToolUsesAsContent(),
							)

							if (this.taskState.assistantMessageContent.length > prevLength) {
								this.taskState.userMessageContentReady = false
							}
							break
						}
					}

					await this.task
						.presentAssistantMessage()
						.catch((error) => Logger.debug(`[Task] Failed to present message: ${error}`))

					if (this.taskState.abort) {
						this.task.api.abort?.()
						if (!this.taskState.abandoned) {
							await abortStream("user_cancelled")
						}
						shouldInterruptStream = true
						break
					}

					if (this.taskState.didRejectTool) {
						assistantMessage += "\n\n[Response interrupted by user feedback]"
						shouldInterruptStream = true
						break
					}
				}

				if (shouldInterruptStream) {
					await streamCoordinator.stop()
				} else {
					await streamCoordinator.waitForCompletion()
				}
				await usageChunkSideEffectsQueue

				// agent-kiki fork: tracing — record this planner roundtrip.
				// This fires for every successful API call, including ones whose
				// assistant text contains no valid tool_call (which would never
				// reach the per-tool tracing hook in ToolExecutor).
				try {
					this.task.toolExecutor.recordPlannerTurn(assistantMessage, Date.now() - plannerStartedAt)
				} catch (_err) {
					// non-fatal
				}

				if (!this.taskState.abort && !didFinalizeReasoningForUi) {
					const finalReasoning = reasonsHandler.getCurrentReasoning()
					if (finalReasoning?.thinking) {
						const finalizedPendingReasoning = await finalizePendingReasoningMessage(finalReasoning.thinking)
						if (!finalizedPendingReasoning) {
							await this.task.say("reasoning", finalReasoning.thinking, undefined, undefined, false)
						}
						didFinalizeReasoningForUi = true
					}
				}
			} catch (error) {
				await streamCoordinator?.stop()
				if (!this.taskState.abandoned) {
					const diracError = ErrorService.get().toDiracError(error, this.task.api.getModel().id)
					const errorMessage = diracError.serialize()
					// agent-kiki fork: tracing — record the failed roundtrip
					// before the recovery / abort branches consume the error,
					// so audit traces capture API failures (e.g. transport
					// errors, parse errors, "too many consecutive mistakes").
					try {
						this.task.toolExecutor.recordPlannerTurn(assistantMessage, Date.now() - plannerStartedAt, [errorMessage])
					} catch (_err) {
						// non-fatal
					}
					if (this.taskState.autoRetryAttempts < 3) {
						this.taskState.autoRetryAttempts++

						const delay = 2000 * 2 ** (this.taskState.autoRetryAttempts - 1)

						await this.task.say(
							"error_retry",
							JSON.stringify({
								attempt: this.taskState.autoRetryAttempts,
								maxAttempts: 3,
								delaySeconds: delay / 1000,
								errorMessage,
							}),
						)

						setTimeoutPromise(delay).then(async () => {
							if (this.task.controller.task) {
								this.task.controller.task.taskState.autoRetryAttempts = this.taskState.autoRetryAttempts
								await this.task.controller.task.handleWebviewAskResponse("yesButtonClicked", "", [])
							}
						})
					} else if (this.taskState.autoRetryAttempts >= 3) {
						await this.task.say(
							"error_retry",
							JSON.stringify({
								attempt: 3,
								maxAttempts: 3,
								delaySeconds: 0,
								failed: true,
								errorMessage,
							}),
						)
					}

					// agent-kiki fork: tracing close hook — distinguish the
					// streaming-failure path from a user-initiated abort so the
					// trace meta carries exit_reason="error".
					this.task.abortTask("error", 1)
					await abortStream("streaming_failed", errorMessage)
					await this.task.reinitExistingTaskFromId(this.task.taskId)
				}
			} finally {
				this.taskState.isStreaming = false
				Session.get().endApiCall()
			}

			if (!didReceiveUsageChunk) {
				const apiStreamUsage = await this.task.api.getApiStreamUsage?.()
				if (apiStreamUsage) {
					taskMetrics.inputTokens += apiStreamUsage.inputTokens
					taskMetrics.outputTokens += apiStreamUsage.outputTokens
					taskMetrics.cacheWriteTokens += apiStreamUsage.cacheWriteTokens ?? 0
					taskMetrics.cacheReadTokens += apiStreamUsage.cacheReadTokens ?? 0
					taskMetrics.reasoningTokens +=
						(apiStreamUsage as any).reasoningTokens ?? (apiStreamUsage as any).thoughtsTokenCount ?? 0
					taskMetrics.totalCost = apiStreamUsage.totalCost ?? taskMetrics.totalCost
					queueUsageChunkSideEffects(apiStreamUsage.inputTokens, apiStreamUsage.outputTokens, {
						cacheWriteTokens: apiStreamUsage.cacheWriteTokens,
						cacheReadTokens: apiStreamUsage.cacheReadTokens,
						totalCost: apiStreamUsage.totalCost,
						stopReason: apiStreamUsage.stopReason,
					})
				}
			}

			await finalizeApiReqMsg()
			await this.task.messageStateHandler.saveDiracMessagesAndUpdateHistory()
			await this.task.postStateToWebview()

			if (this.taskState.abort) {
				throw new Error("Dirac instance aborted")
			}

			const assistantHasContent = await this.task.processAssistantResponse({
				assistantMessage,
				assistantTextOnly,
				assistantTextSignature,
				assistantMessageId,
				providerId,
				modelId: model.id,
				mode: modelInfo.mode,
				taskMetrics,
				modelInfo,
				toolUseHandler,
			})

			let didEndLoop = false
			if (assistantHasContent) {
				await pWaitFor(() => this.taskState.userMessageContentReady)
				await this.task.checkpointManager?.saveCheckpoint()

				const didToolUse = this.taskState.assistantMessageContent.some((block) => block.type === "tool_use")
				const hitTokenLimit = stopReason === "MAX_TOKENS" || stopReason === "max_tokens" || stopReason === "length"

				if (!didToolUse) {
					this.taskState.userMessageContent.push({
						type: "text",
						text: hitTokenLimit
							? "You have reached the output token limit. Please continue your response from where you left off. If you were in the middle of a tool call, start over with that tool call. If you were finished, call attempt_completion."
							: formatResponse.noToolsUsed(this.taskState.useNativeToolCalls),
					})
					this.taskState.consecutiveMistakeCount++
				}

				this.taskState.autoRetryAttempts = 0
				const recDidEndLoop = await this.makeRequest(this.taskState.userMessageContent)
				didEndLoop = recDidEndLoop
			} else {
				return await this.task.handleEmptyAssistantResponse({
					modelInfo,
					taskMetrics,
					providerId,
					model,
				})
			}

			return didEndLoop
		} catch (_error) {
			return true
		}
	}

	async handleMistakeLimitReached(
		userContent: DiracContent[],
	): Promise<{ didEndLoop: boolean; userContent: DiracContent[] }> {
		if (
			this.taskState.consecutiveMistakeCount <
			this.task.stateManager.getGlobalSettingsKey("maxConsecutiveMistakes")
		) {
			return { didEndLoop: false, userContent }
		}

		// In yolo mode, don't wait for user input - fail the task
		if (this.task.stateManager.getGlobalSettingsKey("yoloModeToggled")) {
			const errorMessage =
				`[YOLO MODE] Task failed: Too many consecutive mistakes ` +
				`(${this.taskState.consecutiveMistakeCount}). ` +
				`The model may not be capable enough for this task. ` +
				`Consider using a more capable model.`
			await this.task.say("error", errorMessage)
			return { didEndLoop: true, userContent }
		}

		const autoApprovalSettings = this.task.stateManager.getGlobalSettingsKey("autoApprovalSettings")
		if (autoApprovalSettings.enableNotifications) {
			showSystemNotification({
				subtitle: "Error",
				message: "Dirac is having trouble. Would you like to continue the task?",
			})
		}

		const { response, text, images, files } = await this.task.ask(
			"mistake_limit_reached",
			`Tool use failure. Can potentially be mitigated with some user guidance (e.g. "Try breaking down the task into smaller steps").`,
		)

		if (response === "messageResponse") {
			await this.task.say("user_feedback", text, images, files)

			const feedbackUserContent: DiracUserContent[] = []
			feedbackUserContent.push({
				type: "text",
				text: formatResponse.tooManyMistakes(text),
			})

			if (images && images.length > 0) {
				feedbackUserContent.push(...formatResponse.imageBlocks(images))
			}

			let fileContentString = ""
			if (files && files.length > 0) {
				fileContentString = await processFilesIntoText(files)
			}

			if (fileContentString) {
				feedbackUserContent.push({
					type: "text",
					text: fileContentString,
				})
			}

			userContent = feedbackUserContent
		}

		this.taskState.consecutiveMistakeCount = 0
		this.taskState.autoRetryAttempts = 0
		return { didEndLoop: false, userContent }
	}
}
