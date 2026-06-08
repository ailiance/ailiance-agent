import type { captureSnapshot } from "./capture"
import type { rehydrate } from "./restore"
import { type SnapshotBundle, SnapshotError } from "./SessionSnapshot"
import type { SnapshotStore } from "./SnapshotStore"

export interface SnapshotCommandDeps {
	store: SnapshotStore
	taskId: string
	envLabel: string
	newId: () => string
	capture: typeof captureSnapshot
	rehydrate: typeof rehydrate
	newTaskId: () => string
}

export async function runSnapshot(deps: SnapshotCommandDeps, label: string): Promise<string> {
	const bundle = await deps.capture(deps.taskId, label || "(unlabeled)", deps.envLabel, deps.newId)
	await deps.store.save(bundle)
	return `Snapshot ${bundle.meta.id} saved${label ? ` ("${label}")` : ""}.`
}

export async function runSessions(deps: SnapshotCommandDeps): Promise<string> {
	const metas = await deps.store.list()
	if (metas.length === 0) {
		return "No snapshots yet. Use /snapshot [label] to create one."
	}
	const rows = metas
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.map((m) => `  ${m.id}  ${m.label}  ${m.createdAt}  ${m.env}`)
		.join("\n")
	return `Snapshots:\n${rows}`
}

export async function runRestore(deps: SnapshotCommandDeps, id: string): Promise<string> {
	if (!id) {
		return "Usage: /restore <snapshot-id>"
	}
	let bundle: SnapshotBundle
	try {
		bundle = await deps.store.load(id)
	} catch (error) {
		if (error instanceof SnapshotError) {
			return `Cannot restore: ${error.message}`
		}
		throw error
	}
	const target = deps.newTaskId()
	await deps.rehydrate(bundle, target)
	return `Restored snapshot ${id} into a new session (${target}).`
}
