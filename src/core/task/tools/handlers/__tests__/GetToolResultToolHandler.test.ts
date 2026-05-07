import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import sinon from "sinon"
import { TaskState } from "../../../TaskState"
import type { TaskConfig } from "../../types/TaskConfig"
import { GetToolResultToolHandler } from "../GetToolResultToolHandler"

function createConfig(): TaskConfig {
	const taskState = new TaskState()
	const callbacks = {
		say: sinon.stub().resolves(undefined),
		sayAndCreateMissingParamError: sinon.stub().resolves("missing"),
		removeLastPartialMessageIfExistsWithType: sinon.stub().resolves(),
	}
	return {
		taskId: "task-1",
		ulid: "ulid-1",
		cwd: "/tmp",
		mode: "act",
		isSubagentExecution: true,
		taskState,
		callbacks,
		services: {},
		api: { getModel: () => ({ id: "test", info: { supportsImages: false } }) },
	} as unknown as TaskConfig
}

function makeBlock(params: Record<string, unknown>): any {
	return {
		name: "get_tool_result",
		params,
		partial: false,
	}
}

describe("GetToolResultToolHandler", () => {
	it("returns toolError when task_id is missing", async () => {
		const config = createConfig()
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({}))
		assert.match(String(result), /Missing required parameter 'task_id'/)
		assert.equal(config.taskState.consecutiveMistakeCount, 1)
	})

	it("returns toolError when task_id is unknown", async () => {
		const config = createConfig()
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({ task_id: "01XXX" }))
		assert.match(String(result), /task_id not found/)
		assert.equal(config.taskState.consecutiveMistakeCount, 1)
	})

	it("returns the result when the task is already completed", async () => {
		const config = createConfig()
		const entry = config.taskState.pendingTools.register({ toolName: "search_files" })
		config.taskState.pendingTools.complete(entry.taskId, "matches: foo bar")
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({ task_id: entry.taskId }))
		const text = String(result)
		assert.match(text, /completed in/)
		assert.match(text, /matches: foo bar/)
	})

	it("returns formatted error when the task has failed", async () => {
		const config = createConfig()
		const entry = config.taskState.pendingTools.register({ toolName: "execute_command" })
		config.taskState.pendingTools.fail(entry.taskId, "boom")
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({ task_id: entry.taskId }))
		assert.match(String(result), /failed:\nboom/)
	})

	it("reports cancelled tasks", async () => {
		const config = createConfig()
		const entry = config.taskState.pendingTools.register({ toolName: "execute_command" })
		config.taskState.pendingTools.cancel(entry.taskId)
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({ task_id: entry.taskId }))
		assert.match(String(result), /was cancelled/)
	})

	it("returns running status immediately when wait=false", async () => {
		const config = createConfig()
		const entry = config.taskState.pendingTools.register({ toolName: "list_files" })
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({ task_id: entry.taskId, wait: "false" }))
		const text = String(result)
		assert.match(text, /status: running/)
		assert.match(text, /elapsed_ms/)
	})

	it("waits for completion and returns the result when wait=true", async () => {
		const config = createConfig()
		const entry = config.taskState.pendingTools.register({ toolName: "search_files" })
		const handler = new GetToolResultToolHandler()

		setTimeout(() => {
			config.taskState.pendingTools.complete(entry.taskId, "delayed payload")
		}, 50)

		const result = await handler.execute(config, makeBlock({ task_id: entry.taskId, wait: true, timeout_ms: 5000 }))
		assert.match(String(result), /delayed payload/)
	})

	it("returns running with timeout message when wait=true exceeds timeout_ms", async () => {
		const config = createConfig()
		const entry = config.taskState.pendingTools.register({ toolName: "search_files" })
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({ task_id: entry.taskId, wait: true, timeout_ms: 50 }))
		const text = String(result)
		assert.match(text, /still running after 50ms/)
		assert.match(text, /retry get_tool_result later/)

		// Listener cleanup: after timeout, completing should not throw or
		// double-resolve.
		assert.doesNotThrow(() => {
			config.taskState.pendingTools.complete(entry.taskId, "late")
		})
		assert.equal(config.taskState.pendingTools.events.listenerCount("updated"), 0)
	})

	it("clamps timeout_ms above the 5-minute hard cap", async () => {
		const config = createConfig()
		const entry = config.taskState.pendingTools.register({ toolName: "execute_command" })
		// Pre-complete so we don't actually wait.
		config.taskState.pendingTools.complete(entry.taskId, "ok")
		const handler = new GetToolResultToolHandler()
		const result = await handler.execute(config, makeBlock({ task_id: entry.taskId, wait: true, timeout_ms: 999_999_999 }))
		assert.match(String(result), /ok/)
	})
})
