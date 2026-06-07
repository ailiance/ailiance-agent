// src/services/memory/dreaming/__tests__/MemorySynthesizer.test.ts
import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { synthesizeMemories } from "../MemorySynthesizer"

async function* fakeStream(text: string) {
	yield { type: "text", text } as any
}

describe("synthesizeMemories", () => {
	it("parses candidates and dedups vs existing by name", async () => {
		const modelJson = JSON.stringify([
			{
				scope: "project:repo",
				type: "project",
				name: "uses-vitest",
				description: "tests via vitest",
				body: "The repo uses vitest.",
			},
			{ scope: "global", type: "user", name: "prefers-fr", description: "FR", body: "User converses in French." },
		])
		const candidates = await synthesizeMemories("transcript", [{ name: "uses-vitest" }], {
			createMessage: () => fakeStream(modelJson),
		})
		assert.deepEqual(
			candidates.map((c) => c.name),
			["prefers-fr"],
		)
	})
	it("returns [] on unparseable output", async () => {
		assert.deepEqual(await synthesizeMemories("x", [], { createMessage: () => fakeStream("not json") }), [])
	})
	it("slugifies odd names so saveMemory never rejects them (poison-loop guard)", async () => {
		const modelJson = JSON.stringify([
			{ scope: "global", type: "user", name: "prefers Français!", description: "d", body: "b" },
		])
		const [c] = await synthesizeMemories("t", [], { createMessage: () => fakeStream(modelJson) })
		assert.match(c.name, /^[a-z0-9][a-z0-9_-]*$/)
		assert.equal(c.name, "prefers-francais")
	})
})
