import { describe, expect, it } from "vitest"
import {
	canonicaliseToolName,
	hasHallucinatedToolXml,
	parseHallucinatedToolXml,
} from "@/utils/parse-hallucinated-tool-xml"

describe("parseHallucinatedToolXml", () => {
	it("extracts the exact Mistral-128B leak pattern observed in prod", () => {
		const text = `<function=list_files>
<parameter=paths>
["."]
</parameter>
</function>`
		const r = parseHallucinatedToolXml(text)
		expect(r.calls).toHaveLength(1)
		expect(r.calls[0].name).toBe("list_files")
		expect(r.calls[0].params.paths).toBe('["."]')
		expect(r.residualText).toBe("")
	})

	it("returns residual prose between tool blocks intact", () => {
		const text = `Let me check the directory.
<function=list_files>
<parameter=paths>
["src"]
</parameter>
</function>
Then I'll proceed.`
		const r = parseHallucinatedToolXml(text)
		expect(r.calls).toHaveLength(1)
		expect(r.calls[0].name).toBe("list_files")
		expect(r.residualText).toContain("Let me check")
		expect(r.residualText).toContain("Then I'll proceed")
		expect(r.residualText).not.toContain("<function")
	})

	it("handles multiple sequential tool calls in one text", () => {
		const text = `<function=read_file>
<parameter=path>
a.txt
</parameter>
</function>
<function=read_file>
<parameter=path>
b.txt
</parameter>
</function>`
		const r = parseHallucinatedToolXml(text)
		expect(r.calls).toHaveLength(2)
		expect(r.calls[0].params.path).toBe("a.txt")
		expect(r.calls[1].params.path).toBe("b.txt")
	})

	it("accepts <invoke=NAME> as a near-cousin format", () => {
		const text = `<invoke=execute_command><parameter=command>ls -la</parameter></invoke>`
		const r = parseHallucinatedToolXml(text)
		expect(r.calls).toHaveLength(1)
		expect(r.calls[0].name).toBe("execute_command")
		expect(r.calls[0].params.command).toBe("ls -la")
	})

	it("accepts <parameter name=KEY> attribute style", () => {
		const text = `<function=write_to_file><parameter name="path">x.py</parameter><parameter name="content">print(1)</parameter></function>`
		const r = parseHallucinatedToolXml(text)
		expect(r.calls).toHaveLength(1)
		expect(r.calls[0].params.path).toBe("x.py")
		expect(r.calls[0].params.content).toBe("print(1)")
	})

	it("returns empty calls and original text when no pattern matches", () => {
		const text = "Plain prose with no XML at all."
		const r = parseHallucinatedToolXml(text)
		expect(r.calls).toEqual([])
		expect(r.residualText).toBe(text)
	})

	it("returns empty calls when only the Anthropic outer wrapper is present (handled elsewhere)", () => {
		const text = `<function_calls>
<invoke name="list_files">
<parameter name="path">.</parameter>
</invoke>
</function_calls>`
		const r = parseHallucinatedToolXml(text)
		// We deliberately do not handle <function_calls> outer wrapper —
		// ResponseProcessor already strips it before this parser runs.
		expect(r.calls).toEqual([])
	})

	it("does not crash on empty or null-like input", () => {
		expect(parseHallucinatedToolXml("").calls).toEqual([])
		expect(parseHallucinatedToolXml(undefined as any).residualText).toBe("")
	})

	it("preserves whitespace inside parameter values", () => {
		const text = `<function=execute_command><parameter=command>echo "hello
world"</parameter></function>`
		const r = parseHallucinatedToolXml(text)
		expect(r.calls[0].params.command).toBe('echo "hello\nworld"')
	})

	describe("hasHallucinatedToolXml", () => {
		it("returns true for complete blocks", () => {
			expect(hasHallucinatedToolXml("<function=foo><parameter=x>1</parameter></function>")).toBe(true)
			expect(hasHallucinatedToolXml("text <invoke=foo></invoke> text")).toBe(true)
		})

		it("returns false for partial blocks (let stream parser handle them)", () => {
			expect(hasHallucinatedToolXml("<function=foo><parameter=x>1")).toBe(false)
			expect(hasHallucinatedToolXml("text without tool")).toBe(false)
			expect(hasHallucinatedToolXml("")).toBe(false)
		})

		it("returns false when only Anthropic wrapper is present", () => {
			expect(hasHallucinatedToolXml(`<function_calls><invoke name="x"/></function_calls>`)).toBe(false)
		})
	})

	describe("canonicaliseToolName", () => {
		const known = new Set([
			"list_files",
			"read_file",
			"write_to_file",
			"execute_command",
			"search_files",
		])

		it("returns the canonical name when it matches the enum exactly", () => {
			expect(canonicaliseToolName("list_files", known)).toBe("list_files")
			expect(canonicaliseToolName("read_file", known)).toBe("read_file")
		})

		it("lower-cases before matching for case drift", () => {
			expect(canonicaliseToolName("List_Files", known)).toBe("list_files")
			expect(canonicaliseToolName("READ_FILE", known)).toBe("read_file")
		})

		it("maps observed Mistral-128B aliases to canonical names", () => {
			expect(canonicaliseToolName("listfiles", known)).toBe("list_files")
			expect(canonicaliseToolName("lsfiles", known)).toBe("list_files")
			expect(canonicaliseToolName("read_files", known)).toBe("read_file")
			expect(canonicaliseToolName("write_file", known)).toBe("write_to_file")
			expect(canonicaliseToolName("bash", known)).toBe("execute_command")
			expect(canonicaliseToolName("grep", known)).toBe("search_files")
		})

		it("returns null for entirely unknown names (strict policy)", () => {
			expect(canonicaliseToolName("totally_made_up", known)).toBe(null)
			expect(canonicaliseToolName("", known)).toBe(null)
		})

		it("returns null when the alias resolves to a name the runtime doesn't expose", () => {
			// An alias entry exists for `bash` -> `execute_command`. If the runtime
			// somehow doesn't expose execute_command, the canonicalisation refuses
			// silently rather than dispatching a non-existent tool.
			const restricted = new Set(["list_files"])
			expect(canonicaliseToolName("bash", restricted)).toBe(null)
		})

		it("trims whitespace before matching", () => {
			expect(canonicaliseToolName("  list_files  ", known)).toBe("list_files")
		})
	})
})
