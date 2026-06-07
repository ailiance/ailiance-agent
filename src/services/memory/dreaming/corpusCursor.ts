// src/services/memory/dreaming/corpusCursor.ts
import fs from "node:fs/promises"
import path from "node:path"
import type { DreamCursor } from "./types"

export async function loadCursor(file: string): Promise<DreamCursor> {
	try {
		const parsed = JSON.parse(await fs.readFile(file, "utf8"))
		if (parsed && typeof parsed === "object" && parsed.processed) return parsed as DreamCursor
	} catch {
		// missing or corrupt -> fresh
	}
	return { processed: {} }
}

export async function saveCursor(file: string, cursor: DreamCursor): Promise<void> {
	await fs.mkdir(path.dirname(file), { recursive: true })
	const tmp = `${file}.tmp`
	await fs.writeFile(tmp, JSON.stringify(cursor, null, 2), "utf8")
	await fs.rename(tmp, file)
}

export function markProcessed(cursor: DreamCursor, projectKey: string, taskId: string): DreamCursor {
	const list = [...(cursor.processed[projectKey] ?? [])]
	if (!list.includes(taskId)) list.push(taskId)
	return { processed: { ...cursor.processed, [projectKey]: list } }
}

export function isProcessed(cursor: DreamCursor, projectKey: string, taskId: string): boolean {
	return (cursor.processed[projectKey] ?? []).includes(taskId)
}
