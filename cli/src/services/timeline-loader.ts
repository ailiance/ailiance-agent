import fs from "node:fs"
import os from "node:os"
import path from "node:path"

export interface TimelineEntry {
	id: string
	shortId: string
	ts: number
	task: string
	emoji: string
	workspace?: string
	totalCost?: number
}

const TASK_HISTORY_PATH = path.join(os.homedir(), ".dirac", "data", "state", "taskHistory.json")

export function pickEmoji(task: string): string {
	const t = task.toLowerCase()
	if (/\b(fix|bug|broken|error|fail)\b/.test(t)) return "🔴"
	if (/\b(add|create|implement|new|build)\b/.test(t)) return "🟣"
	if (/\b(refactor|clean|simplify|migrate|reorganize)\b/.test(t)) return "🔄"
	if (/\b(decid|decision| vs )/.test(t)) return "⚖️"
	if (/\b(check|verify|inspect|test|investigate|audit)\b/.test(t)) return "🔵"
	return "✅"
}

export function loadTimeline(opts: { limit?: number; days?: number } = {}): TimelineEntry[] {
	const { limit = 200, days = 30 } = opts
	let raw: string
	try {
		raw = fs.readFileSync(TASK_HISTORY_PATH, "utf-8")
	} catch {
		return []
	}
	let arr: unknown[]
	try {
		arr = JSON.parse(raw)
	} catch {
		return []
	}
	if (!Array.isArray(arr)) return []
	const cutoff = Date.now() - days * 86_400_000
	return arr
		.filter((t): t is Record<string, unknown> => {
			if (typeof t !== "object" || t === null) return false
			const obj = t as Record<string, unknown>
			return typeof obj.ts === "number" && obj.ts >= cutoff && typeof obj.task === "string"
		})
		.sort((a, b) => (b.ts as number) - (a.ts as number))
		.slice(0, limit)
		.map((t) => {
			const id = String(t.id ?? "")
			const ulid = String(t.ulid ?? "")
			const shortId = (ulid || id).slice(-5).toLowerCase()
			return {
				id,
				shortId,
				ts: t.ts as number,
				task: String(t.task).split("\n")[0].slice(0, 80),
				emoji: pickEmoji(String(t.task)),
				workspace: typeof t.workspaceRootPath === "string" ? t.workspaceRootPath : undefined,
				totalCost: typeof t.totalCost === "number" ? t.totalCost : undefined,
			}
		})
}

export function groupByDay(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
	const out = new Map<string, TimelineEntry[]>()
	for (const e of entries) {
		const d = new Date(e.ts)
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
		if (!out.has(key)) out.set(key, [])
		out.get(key)?.push(e)
	}
	return out
}
