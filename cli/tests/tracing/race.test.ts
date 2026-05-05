// agent-kiki fork: regression test for the parallel appendTurn race.
// 50 concurrent appendTurn calls must produce 50 valid JSON lines on
// disk with monotonic turn numbers 1..50 (no interleaving, no dropped
// writes).
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { JsonlTracer } from "@core/tracing"

let tmpDir: string

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aki-race-"))
})

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("JsonlTracer parallel appendTurn", () => {
	it("serialises 50 concurrent appendTurn calls without interleaving", async () => {
		const tracer = new JsonlTracer("race-test", tmpDir)
		tracer.writeMeta({
			task: "race",
			mode: "EDIT_REPO",
			approval_mode: "yolo",
			agent_kiki_version: "0.0.0-test",
			gateway_url: "http://localhost",
		})

		const tracePath = path.join(tracer.directory, "trace.jsonl")
		const N = 50

		// Fire all appendTurn calls in the same tick so they race on writeChain.
		await Promise.all(
			Array.from({ length: N }, (_, i) =>
				Promise.resolve().then(() =>
					tracer.appendTurn({
						phase: "plan",
						planner_response: { idx: i },
					}),
				),
			),
		)

		await tracer.flush()

		const raw = fs.readFileSync(tracePath, "utf8").trimEnd()
		const lines = raw.split("\n")
		expect(lines.length).toBe(N)

		const turns: number[] = []
		for (const ln of lines) {
			const obj = JSON.parse(ln) as { turn: number }
			turns.push(obj.turn)
		}
		// Each turn must appear exactly once and the set must be 1..N
		const sorted = [...turns].sort((a, b) => a - b)
		expect(sorted).toEqual(Array.from({ length: N }, (_, i) => i + 1))
	})
})
