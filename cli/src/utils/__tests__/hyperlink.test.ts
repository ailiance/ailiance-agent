import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { osc8 } from "../hyperlink"

describe("osc8 hyperlink", () => {
	const originalEnv = { ...process.env }

	beforeEach(() => {
		// Reset env vars before each test
		delete process.env.TERM_PROGRAM
		delete process.env.COLORTERM
		delete process.env.TERM
	})

	afterEach(() => {
		// Restore original env
		process.env.TERM_PROGRAM = originalEnv.TERM_PROGRAM
		process.env.COLORTERM = originalEnv.COLORTERM
		process.env.TERM = originalEnv.TERM
	})

	it("returns plain label when terminal not supported", () => {
		const result = osc8("https://example.com", "example")
		expect(result).toBe("example")
	})

	it("returns OSC 8 escape sequence when TERM_PROGRAM is set", () => {
		process.env.TERM_PROGRAM = "iTerm.app"
		const result = osc8("https://example.com", "example")
		expect(result).toContain("\x1b]8;;https://example.com\x1b\\")
		expect(result).toContain("example")
		expect(result).toContain("\x1b]8;;\x1b\\")
	})

	it("returns OSC 8 escape sequence when COLORTERM=truecolor", () => {
		process.env.COLORTERM = "truecolor"
		const result = osc8("http://127.0.0.1:25463", "http://127.0.0.1:25463")
		expect(result).toContain("\x1b]8;;")
		expect(result).toContain("http://127.0.0.1:25463")
	})

	it("returns OSC 8 escape sequence when TERM contains xterm", () => {
		process.env.TERM = "xterm-256color"
		const result = osc8("https://example.com", "click here")
		expect(result).toContain("\x1b]8;;https://example.com\x1b\\")
		expect(result).toContain("click here")
	})

	it("fallback returns only the label without escape codes", () => {
		const result = osc8("https://example.com", "click here")
		expect(result).toBe("click here")
		expect(result).not.toContain("\x1b")
	})
})
