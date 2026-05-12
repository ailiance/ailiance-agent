import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
	deleteMemory,
	findMemories,
	getMemoryRoot,
	listMemories,
	saveMemory,
} from "@/utils/ailiance-memory"

// Isolate each test by swapping HOME to a tmp dir; the module computes
// MEMORY_ROOT at import time from os.homedir(), so we override
// before importing — but Vitest hoists imports above beforeEach. The
// trick: monkey-patch os.homedir() to return our tmp dir, then re-import
// via dynamic import in a beforeEach. That keeps the test hermetic.
// Simpler: each test cleans up after itself.

const TEST_ROOT = getMemoryRoot()

describe("ailiance-memory", () => {
	beforeEach(async () => {
		// Make sure we start clean for the keys this test will use.
		const namesToClear = [
			"test-user-pref",
			"test-feedback-no-amend",
			"test-project-repo-convention",
			"another-memory",
		]
		for (const name of namesToClear) {
			await deleteMemory(name)
		}
	})

	afterEach(async () => {
		// Symmetric cleanup so files don't accumulate in dev environments.
		const namesToClear = [
			"test-user-pref",
			"test-feedback-no-amend",
			"test-project-repo-convention",
			"another-memory",
		]
		for (const name of namesToClear) {
			await deleteMemory(name)
		}
	})

	it("saves and reads back a global memory", async () => {
		const filePath = await saveMemory({
			name: "test-user-pref",
			description: "User prefers French for explanations",
			type: "user",
			body: "Respond in French unless asked otherwise.",
		})
		expect(filePath).toContain("test-user-pref.md")
		const memories = await listMemories({ type: "user" })
		const found = memories.find((m) => m.name === "test-user-pref")
		expect(found).toBeDefined()
		expect(found!.description).toBe("User prefers French for explanations")
		expect(found!.scope).toBe("global")
		expect(found!.body).toBe("Respond in French unless asked otherwise.")
	})

	it("respects project scope when listing", async () => {
		await saveMemory({
			name: "test-project-repo-convention",
			description: "no rebase on main",
			type: "project",
			scope: "project:my-repo",
			body: "Always merge with squash, never rebase.",
		})
		const globalList = await listMemories({ scope: "global" })
		const projList = await listMemories({ scope: "project:my-repo" })
		expect(globalList.find((m) => m.name === "test-project-repo-convention")).toBeUndefined()
		expect(projList.find((m) => m.name === "test-project-repo-convention")).toBeDefined()
	})

	it("deletes a memory by name across scopes", async () => {
		await saveMemory({
			name: "test-feedback-no-amend",
			description: "no commit amend",
			type: "feedback",
			body: "Never use git commit --amend on merged PRs.",
		})
		const removed = await deleteMemory("test-feedback-no-amend")
		expect(removed).toBe(1)
		const after = await listMemories()
		expect(after.find((m) => m.name === "test-feedback-no-amend")).toBeUndefined()
	})

	it("returns 0 when deleting a name that has no matches", async () => {
		const removed = await deleteMemory("definitely-not-saved")
		expect(removed).toBe(0)
	})

	it("findMemories matches against name and description", async () => {
		await saveMemory({
			name: "test-user-pref",
			description: "speak french",
			type: "user",
			body: "x",
		})
		await saveMemory({
			name: "another-memory",
			description: "a note about french",
			type: "reference",
			body: "y",
		})
		const byName = await findMemories("user-pref")
		expect(byName.find((m) => m.name === "test-user-pref")).toBeDefined()
		const byDesc = await findMemories("french")
		expect(byDesc.length).toBeGreaterThanOrEqual(2)
		const empty = await findMemories("totally-unrelated")
		expect(empty).toEqual([])
	})

	it("rejects names with invalid characters", async () => {
		await expect(
			saveMemory({
				name: "bad/name with spaces",
				description: "x",
				type: "user",
				body: "y",
			}),
		).rejects.toThrow(/kebab.snake-case/i)
	})

	it("rebuilds MEMORY.md index on every save", async () => {
		await saveMemory({
			name: "test-user-pref",
			description: "indexed entry",
			type: "user",
			body: "test",
		})
		const indexContent = await fs.readFile(path.join(TEST_ROOT, "MEMORY.md"), "utf-8")
		expect(indexContent).toContain("# Memory Index")
		expect(indexContent).toContain("test-user-pref")
		expect(indexContent).toContain("indexed entry")
	})

	it("lists memories sorted by creation time (newest first)", async () => {
		await saveMemory({ name: "another-memory", description: "older", type: "user", body: "a" })
		// brief sleep to ensure ISO timestamp differs
		await new Promise((resolve) => setTimeout(resolve, 10))
		await saveMemory({ name: "test-user-pref", description: "newer", type: "user", body: "b" })
		const list = await listMemories({ type: "user" })
		const newer = list.findIndex((m) => m.name === "test-user-pref")
		const older = list.findIndex((m) => m.name === "another-memory")
		expect(newer).toBeGreaterThanOrEqual(0)
		expect(older).toBeGreaterThan(newer)
	})
})
