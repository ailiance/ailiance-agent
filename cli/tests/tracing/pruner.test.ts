// ailiance-agent fork: tests for trace rotation policy.
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { prune } from "@core/tracing/pruner"

let runsDir: string

beforeEach(() => {
	runsDir = fs.mkdtempSync(path.join(os.tmpdir(), "aki-prune-"))
})

afterEach(() => {
	fs.rmSync(runsDir, { recursive: true, force: true })
})

function makeRun(name: string, sizeBytes: number, ageMs: number): void {
	const dir = path.join(runsDir, name)
	fs.mkdirSync(dir, { recursive: true })
	const file = path.join(dir, "trace.jsonl")
	fs.writeFileSync(file, "x".repeat(sizeBytes))
	const t = Date.now() - ageMs
	fs.utimesSync(file, t / 1000, t / 1000)
	fs.utimesSync(dir, t / 1000, t / 1000)
}

describe("prune", () => {
	it("returns empty result when dir does not exist", async () => {
		const r = await prune({ dir: path.join(runsDir, "missing") })
		expect(r.kept).toEqual([])
		expect(r.removed).toEqual([])
		expect(r.freedBytes).toBe(0)
	})

	it("keeps everything when nothing exceeds thresholds", async () => {
		makeRun("recent-1", 100, 60_000)
		makeRun("recent-2", 100, 120_000)
		const r = await prune({ dir: runsDir, maxAgeDays: 30, maxTotalSizeBytes: 10 * 1024 })
		expect(r.removed).toEqual([])
		expect(r.kept.sort()).toEqual(["recent-1", "recent-2"])
	})

	it("removes runs older than maxAgeDays when over size budget", async () => {
		const day = 24 * 60 * 60 * 1000
		makeRun("ancient", 100, 90 * day)
		makeRun("recent", 100, 60_000)
		// Tiny size budget so ancient is not rescued by the size policy.
		const r = await prune({ dir: runsDir, maxAgeDays: 30, maxTotalSizeBytes: 150 })
		expect(r.removed).toEqual(["ancient"])
		expect(r.kept).toEqual(["recent"])
	})

	it("rescues old runs when they fit in the size budget (more permissive)", async () => {
		const day = 24 * 60 * 60 * 1000
		makeRun("old-1", 50, 90 * day)
		makeRun("recent", 50, 60_000)
		// Size budget large enough for both — old-1 stays even though
		// older than 30 days, because the policy keeps whichever is more
		// permissive.
		const r = await prune({ dir: runsDir, maxAgeDays: 30, maxTotalSizeBytes: 10 * 1024 })
		expect(r.removed).toEqual([])
		expect(r.kept.sort()).toEqual(["old-1", "recent"])
	})

	it("evicts oldest runs when total size exceeds budget AND age cutoff trims them", async () => {
		const day = 24 * 60 * 60 * 1000
		makeRun("ancient-big", 500, 90 * day)
		makeRun("old-big", 500, 60 * day)
		makeRun("recent-big", 500, 60_000)
		// maxAgeDays=30 → ancient-big and old-big are age-eligible to drop.
		// maxTotalSizeBytes=600 → only one run fits; the most recent is kept.
		const r = await prune({ dir: runsDir, maxAgeDays: 30, maxTotalSizeBytes: 600 })
		expect(r.kept).toEqual(["recent-big"])
		expect(r.removed.sort()).toEqual(["ancient-big", "old-big"])
		expect(r.freedBytes).toBe(1000)
	})
})
