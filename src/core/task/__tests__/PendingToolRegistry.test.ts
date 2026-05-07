import { strict as assert } from "assert"
import { describe, it } from "mocha"
import { PendingToolEntry, PendingToolRegistry } from "../PendingToolRegistry"

describe("PendingToolRegistry", () => {
	it("register() returns a running entry with a unique taskId", () => {
		const reg = new PendingToolRegistry()
		const a = reg.register({ toolName: "execute_command" })
		const b = reg.register({ toolName: "search_files", blockId: "blk-1" })

		assert.equal(a.status, "running")
		assert.ok(a.taskId.length > 0)
		assert.notEqual(a.taskId, b.taskId)
		assert.equal(b.blockId, "blk-1")
		assert.ok(a.startedAt > 0)
		assert.ok(a.abortController instanceof AbortController)
		assert.equal(a.abortController.signal.aborted, false)
		assert.deepEqual(reg.get(a.taskId), a)
	})

	it("complete() transitions to completed and emits an updated event", () => {
		const reg = new PendingToolRegistry()
		const seen: PendingToolEntry[] = []
		reg.events.on("updated", (e: PendingToolEntry) => seen.push(e))

		const e = reg.register({ toolName: "read_file" })
		reg.complete(e.taskId, { ok: true, bytes: 42 })

		const got = reg.get(e.taskId)!
		assert.equal(got.status, "completed")
		assert.deepEqual(got.result, { ok: true, bytes: 42 })
		assert.ok(got.finishedAt !== undefined)
		// One emit on register, one on complete.
		assert.equal(seen.length, 2)
		assert.equal(seen[1].status, "completed")
	})

	it("complete() is a no-op on missing or already-terminal entries", () => {
		const reg = new PendingToolRegistry()
		// Missing — should not throw.
		reg.complete("nope", "x")

		const e = reg.register({ toolName: "list_files" })
		reg.complete(e.taskId, "first")
		reg.complete(e.taskId, "second")
		assert.equal(reg.get(e.taskId)!.result, "first")
	})

	it("fail() transitions to failed with error string", () => {
		const reg = new PendingToolRegistry()
		const e = reg.register({ toolName: "execute_command" })
		reg.fail(e.taskId, "exit 1: boom")
		const got = reg.get(e.taskId)!
		assert.equal(got.status, "failed")
		assert.equal(got.error, "exit 1: boom")
		assert.ok(got.finishedAt !== undefined)
	})

	it("cancel() aborts the signal and returns true the first time only", () => {
		const reg = new PendingToolRegistry()
		const e = reg.register({ toolName: "execute_command" })
		assert.equal(e.abortController.signal.aborted, false)

		assert.equal(reg.cancel(e.taskId), true)
		assert.equal(e.abortController.signal.aborted, true)
		assert.equal(reg.get(e.taskId)!.status, "cancelled")

		// Second cancel — already terminal.
		assert.equal(reg.cancel(e.taskId), false)
		// Unknown id.
		assert.equal(reg.cancel("missing"), false)
	})

	it("cancelAll() cancels every running entry and skips terminal ones", () => {
		const reg = new PendingToolRegistry()
		const a = reg.register({ toolName: "t1" })
		const b = reg.register({ toolName: "t2" })
		const c = reg.register({ toolName: "t3" })
		reg.complete(a.taskId, "done")
		reg.fail(b.taskId, "err")

		assert.equal(reg.cancelAll(), 1)
		assert.equal(reg.get(c.taskId)!.status, "cancelled")
		assert.equal(reg.get(a.taskId)!.status, "completed")
		assert.equal(reg.get(b.taskId)!.status, "failed")
	})

	it("list() filters by status and toolName", () => {
		const reg = new PendingToolRegistry()
		const a = reg.register({ toolName: "execute_command" })
		const b = reg.register({ toolName: "execute_command" })
		const c = reg.register({ toolName: "read_file" })
		reg.complete(a.taskId, "ok")

		assert.equal(reg.list().length, 3)
		assert.equal(reg.list({ status: "running" }).length, 2)
		assert.equal(reg.list({ toolName: "execute_command" }).length, 2)
		assert.equal(reg.list({ status: "running", toolName: "read_file" }).length, 1)
		assert.equal(reg.list({ status: "completed", toolName: "execute_command" })[0].taskId, a.taskId)
		// Avoid unused-var warnings.
		void b
		void c
	})

	it("prune() removes old terminal entries and keeps running ones", () => {
		const reg = new PendingToolRegistry()
		const oldDone = reg.register({ toolName: "x" })
		reg.complete(oldDone.taskId, "ok")
		const running = reg.register({ toolName: "y" })
		const recentFailed = reg.register({ toolName: "z" })
		reg.fail(recentFailed.taskId, "boom")

		// Backdate the finished timestamp on `oldDone` so it falls past the cutoff.
		reg.get(oldDone.taskId)!.finishedAt = Date.now() - 120_000

		const removed = reg.prune(60_000)
		assert.equal(removed, 1)
		assert.equal(reg.get(oldDone.taskId), undefined)
		assert.equal(reg.get(running.taskId)!.status, "running")
		assert.equal(reg.get(recentFailed.taskId)!.status, "failed")
	})
})
