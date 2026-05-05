import { formatResponse } from "@core/prompts/responses"
import { DiracContent } from "@shared/messages/content"
import type { Task } from "./index"
import { TaskState } from "./TaskState"

/**
 * AgentLoopRunner encapsulates the ReAct agent loop extracted from Task.
 *
 * Sprint 2 PR3 — step 3A: initiateLoop extracted from Task.initiateTaskLoop.
 * Step 3B (makeRequest ← recursivelyMakeDiracRequests) is deferred to PR4.
 */
export class AgentLoopRunner {
	constructor(
		private readonly task: Task,
		private readonly taskState: TaskState,
	) {}

	/**
	 * Drive the outer while-loop that calls recursivelyMakeDiracRequests
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
}
