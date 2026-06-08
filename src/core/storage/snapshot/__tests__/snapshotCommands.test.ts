import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { InMemoryEnvironment } from "../../../../services/environment/InMemoryEnvironment"
import { GlobalFileNames } from "../../disk"
import { SNAPSHOT_SCHEMA_VERSION, type SnapshotBundle, serialize } from "../SessionSnapshot"
import { SnapshotStore } from "../SnapshotStore"
import { runRestore, runSessions, runSnapshot, type SnapshotCommandDeps } from "../snapshotCommands"

function makeDeps(store: SnapshotStore): SnapshotCommandDeps {
	let n = 0
	return {
		store,
		taskId: "task-1",
		envLabel: "local",
		newId: () => `snap_id${n++}`,
		capture: async (taskId, label, envLabel, idgen) =>
			serialize(
				{
					id: idgen(),
					label,
					sourceTaskId: taskId,
					createdAt: "2026-06-08T10:00:00.000Z",
					env: envLabel,
					schemaVersion: SNAPSHOT_SCHEMA_VERSION,
				},
				{ [GlobalFileNames.apiConversationHistory]: "[]" },
			),
		rehydrate: async (_b: SnapshotBundle, target: string) => target,
		newTaskId: () => "task-restored",
	}
}

describe("snapshotCommands", () => {
	it("runSnapshot saves a bundle and reports its id", async () => {
		const store = new SnapshotStore(new InMemoryEnvironment("/"), "/snapshots")
		const out = await runSnapshot(makeDeps(store), "before refactor")
		assert.match(out, /snap_id0/)
		const metas = await store.list()
		assert.equal(metas.length, 1)
		assert.equal(metas[0].label, "before refactor")
	})
	it("runSessions lists saved snapshots", async () => {
		const store = new SnapshotStore(new InMemoryEnvironment("/"), "/snapshots")
		const deps = makeDeps(store)
		await runSnapshot(deps, "first")
		assert.match(await runSessions(deps), /first/)
	})
	it("runRestore on a missing id reports a friendly error, not a throw", async () => {
		const store = new SnapshotStore(new InMemoryEnvironment("/"), "/snapshots")
		assert.match(await runRestore(makeDeps(store), "missing"), /not found/i)
	})
})
