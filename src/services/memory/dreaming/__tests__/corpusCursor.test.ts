// src/services/memory/dreaming/__tests__/corpusCursor.test.ts
import { strict as assert } from "node:assert"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, it } from "mocha"
import { isProcessed, loadCursor, markProcessed, saveCursor } from "../corpusCursor"

describe("dream corpus cursor", () => {
	let dir: string
	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "dream-cur-"))
	})
	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	it("marks tasks processed and persists", async () => {
		const file = path.join(dir, "cursor.json")
		let cur = await loadCursor(file)
		assert.deepEqual(cur.processed, {})
		cur = markProcessed(cur, "proj-a", "task1")
		await saveCursor(file, cur)
		const reloaded = await loadCursor(file)
		assert.ok(isProcessed(reloaded, "proj-a", "task1"))
	})
	it("tolerates a missing/corrupt cursor file", async () => {
		assert.deepEqual((await loadCursor(path.join(dir, "nope.json"))).processed, {})
	})
})
