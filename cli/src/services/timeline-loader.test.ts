import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { groupByDay, loadTimeline, pickEmoji } from "./timeline-loader"

describe("timeline-loader", () => {
	describe("pickEmoji", () => {
		it("returns 🔴 for bug/fix keywords", () => {
			expect(pickEmoji("Fix sidebar bug")).toBe("🔴")
			expect(pickEmoji("Broken tests error fail")).toBe("🔴")
		})

		it("returns 🟣 for add/create/implement/new/build keywords", () => {
			expect(pickEmoji("Add autoModeFromPrompt setting")).toBe("🟣")
			expect(pickEmoji("Create new service")).toBe("🟣")
			expect(pickEmoji("Implement timeline view")).toBe("🟣")
			expect(pickEmoji("Build the component")).toBe("🟣")
		})

		it("returns 🔄 for refactor/clean/simplify/migrate keywords", () => {
			expect(pickEmoji("Refactor LiteLlmHandler")).toBe("🔄")
			expect(pickEmoji("Migrate tests to chatStream")).toBe("🔄")
			expect(pickEmoji("Clean and simplify code")).toBe("🔄")
		})

		it("returns ⚖️ for decision/vs keywords", () => {
			expect(pickEmoji("Decision: Phase 3 vs Phase 4")).toBe("⚖️")
			expect(pickEmoji("Decide between options")).toBe("⚖️")
		})

		it("returns 🔵 for check/verify/inspect/test/investigate keywords", () => {
			expect(pickEmoji("Inspect EuroLLM tool calling")).toBe("🔵")
			expect(pickEmoji("Verify the configuration")).toBe("🔵")
			expect(pickEmoji("Check the configuration")).toBe("🔵")
			expect(pickEmoji("Investigate performance issue")).toBe("🔵")
			expect(pickEmoji("Audit the codebase")).toBe("🔵")
		})

		it("returns ✅ for unrecognized tasks", () => {
			expect(pickEmoji("Update documentation")).toBe("✅")
			expect(pickEmoji("Monitor Qwen3-Next download")).toBe("✅")
		})
	})

	describe("loadTimeline", () => {
		const fakeHistoryPath = path.join(os.homedir(), ".dirac", "data", "state", "taskHistory.json")

		beforeEach(() => {
			vi.spyOn(fs, "readFileSync")
		})

		afterEach(() => {
			vi.restoreAllMocks()
		})

		it("returns empty array when file does not exist", () => {
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("ENOENT")
			})
			expect(loadTimeline()).toEqual([])
		})

		it("returns empty array when JSON is invalid", () => {
			vi.mocked(fs.readFileSync).mockReturnValue("not valid json")
			expect(loadTimeline()).toEqual([])
		})

		it("returns empty array when JSON is not an array", () => {
			vi.mocked(fs.readFileSync).mockReturnValue('{"key": "value"}')
			expect(loadTimeline()).toEqual([])
		})

		it("filters by cutoff days", () => {
			const now = Date.now()
			const recent = { id: "aaa1", ts: now - 1 * 86_400_000, task: "Recent task" }
			const old = { id: "bbb2", ts: now - 10 * 86_400_000, task: "Old task" }
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([recent, old]))

			const result = loadTimeline({ days: 5 })
			expect(result).toHaveLength(1)
			expect(result[0].id).toBe("aaa1")
		})

		it("sorts newest first", () => {
			const now = Date.now()
			const older = { id: "aaa1", ts: now - 2 * 86_400_000, task: "Older task" }
			const newer = { id: "bbb2", ts: now - 1 * 86_400_000, task: "Newer task" }
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([older, newer]))

			const result = loadTimeline({ days: 30 })
			expect(result[0].id).toBe("bbb2")
			expect(result[1].id).toBe("aaa1")
		})

		it("assigns shortId from last 5 chars of id", () => {
			const now = Date.now()
			const entry = { id: "abcde12345", ts: now, task: "Some task" }
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([entry]))

			const result = loadTimeline()
			expect(result[0].shortId).toBe("12345")
		})

		it("prefers ulid over id for shortId", () => {
			const now = Date.now()
			const entry = { id: "id123", ulid: "ULID99999", ts: now, task: "Task with ulid" }
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([entry]))

			const result = loadTimeline()
			expect(result[0].shortId).toBe("99999")
		})

		it("respects limit option", () => {
			const now = Date.now()
			const entries = Array.from({ length: 10 }, (_, i) => ({
				id: `id${i}`,
				ts: now - i * 1000,
				task: `Task ${i}`,
			}))
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entries))

			const result = loadTimeline({ limit: 3 })
			expect(result).toHaveLength(3)
		})

		it("skips entries missing ts or task", () => {
			const now = Date.now()
			const valid = { id: "valid1", ts: now, task: "Valid task" }
			const noTs = { id: "nots1", task: "No timestamp" }
			const noTask = { id: "notask1", ts: now }
			vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify([valid, noTs, noTask]))

			const result = loadTimeline()
			expect(result).toHaveLength(1)
			expect(result[0].id).toBe("valid1")
		})
	})

	describe("groupByDay", () => {
		it("groups entries by YYYY-MM-DD key", () => {
			const entries = [
				{ id: "1", shortId: "1", ts: new Date("2026-05-06T16:00:00").getTime(), task: "Task A", emoji: "✅" },
				{ id: "2", shortId: "2", ts: new Date("2026-05-06T10:00:00").getTime(), task: "Task B", emoji: "✅" },
				{ id: "3", shortId: "3", ts: new Date("2026-05-05T09:00:00").getTime(), task: "Task C", emoji: "✅" },
			]

			const groups = groupByDay(entries)
			expect(groups.size).toBe(2)
			expect(groups.get("2026-05-06")).toHaveLength(2)
			expect(groups.get("2026-05-05")).toHaveLength(1)
		})

		it("returns empty map for empty input", () => {
			const groups = groupByDay([])
			expect(groups.size).toBe(0)
		})
	})
})
