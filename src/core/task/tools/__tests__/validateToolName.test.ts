import { describe, it } from "mocha"
import "should"
import { validateToolName } from "../validateToolName"

const KNOWN = new Set([
	"read_file",
	"write_to_file",
	"execute_command",
	"search_files",
	"list_files",
	"edit_file",
	"attempt_completion",
	"ask_followup_question",
])

describe("validateToolName", () => {
	it("accepts a name present in the whitelist", () => {
		const r = validateToolName("read_file", KNOWN)
		r.valid.should.equal(true)
	})

	it("rejects an empty string", () => {
		const r = validateToolName("", KNOWN)
		r.valid.should.equal(false)
		if (!r.valid) {
			r.reason.should.match(/empty/i)
			r.hint.should.be.a.String()
		}
	})

	it("rejects null / non-string input", () => {
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime guard
		const r = validateToolName(null as any, KNOWN)
		r.valid.should.equal(false)
		// biome-ignore lint/suspicious/noExplicitAny: testing runtime guard
		const r2 = validateToolName(42 as any, KNOWN)
		r2.valid.should.equal(false)
	})

	it("rejects names containing ':' with a hint mentioning forbidden characters", () => {
		const r = validateToolName("digikey:search", KNOWN)
		r.valid.should.equal(false)
		if (!r.valid) {
			r.reason.should.match(/forbidden|':'|\.'/)
			r.hint.should.match(/cannot contain/i)
			r.hint.should.match(/read_file/)
		}
	})

	it("rejects names containing '.' with a forbidden-character hint", () => {
		const r = validateToolName("kicad.new_project", KNOWN)
		r.valid.should.equal(false)
		if (!r.valid) {
			r.reason.should.match(/forbidden/)
			r.hint.should.match(/cannot contain/i)
		}
	})

	it("rejects valid-shape but unknown names with a known-tool hint", () => {
		const r = validateToolName("oscilloscope", KNOWN)
		r.valid.should.equal(false)
		if (!r.valid) {
			r.reason.should.match(/not a known tool/)
			// Hint should suggest some real tools and the get_tool_result escape hatch
			r.hint.should.match(/read_file/)
			r.hint.should.match(/get_tool_result/)
		}
	})

	it("forbidden-char rule fires before unknown-name rule", () => {
		// `bom:search` is both forbidden-char AND unknown — we want the
		// shape error first because the hint is more actionable.
		const r = validateToolName("bom:search", KNOWN)
		r.valid.should.equal(false)
		if (!r.valid) {
			r.reason.should.match(/forbidden/)
		}
	})
})
