// src/services/memory/dreaming/__tests__/DreamWorker.test.ts
import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "mocha"
import { runDreamOnce } from "../DreamWorker"

describe("runDreamOnce", () => {
	let dir: string
	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "dream-w-"))
	})
	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	it("processes new runs once, saves, advances cursor", async () => {
		const saved: any[] = []
		const deps = {
			cursorFile: path.join(dir, "cursor.json"),
			listRuns: async () => [{ projectKey: "repo", taskId: "t1", runDir: "/runs/t1" }],
			condense: async () => "condensed",
			listExisting: async () => [],
			synthesize: async () => [{ scope: "project:repo", type: "project", name: "fact-1", description: "d", body: "b" }],
			save: async (c: any) => {
				saved.push(c)
			},
		}
		await runDreamOnce(deps as any)
		assert.deepEqual(
			saved.map((s) => s.name),
			["fact-1"],
		)
		saved.length = 0
		await runDreamOnce(deps as any) // t1 already processed
		assert.deepEqual(saved, [])
	})

	it("a throwing save does not block cursor advance (poison-loop guard)", async () => {
		let synthCalls = 0
		const deps = {
			cursorFile: path.join(dir, "cursor.json"),
			listRuns: async () => [{ projectKey: "repo", taskId: "t1", runDir: "/runs/t1" }],
			condense: async () => "condensed",
			listExisting: async () => [],
			synthesize: async () => {
				synthCalls++
				return [{ scope: "global", type: "user", name: "bad", description: "d", body: "b" }]
			},
			save: async () => {
				throw new Error("saveMemory rejected the name")
			},
		}
		await runDreamOnce(deps as any)
		await runDreamOnce(deps as any) // t1 must be marked processed despite the throwing save
		assert.equal(synthCalls, 1) // not re-synthesized on the second pass
	})
})
