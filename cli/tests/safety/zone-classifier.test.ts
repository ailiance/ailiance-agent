// agent-kiki fork: tests for the 3-zone shell command classifier.
import { describe, expect, it } from "vitest"
import { classifyCommand } from "@core/safety/zoneClassifier"

describe("classifyCommand", () => {
	it("hard-denies rm -rf /", () => {
		expect(classifyCommand("rm -rf /")).toBe("hard_deny")
	})

	it("hard-denies dd of=/dev/sda", () => {
		expect(classifyCommand("dd if=/dev/zero of=/dev/sda bs=1M")).toBe("hard_deny")
	})

	it("hard-denies mkfs.ext4", () => {
		expect(classifyCommand("mkfs.ext4 /dev/sdb1")).toBe("hard_deny")
	})

	it("hard-denies shutdown", () => {
		expect(classifyCommand("shutdown -h now")).toBe("hard_deny")
	})

	it("hard-denies sudo apt", () => {
		expect(classifyCommand("sudo apt update")).toBe("hard_deny")
	})

	it("hard-denies empty/whitespace commands", () => {
		expect(classifyCommand("")).toBe("hard_deny")
		expect(classifyCommand("   ")).toBe("hard_deny")
	})

	it("auto-oks pytest", () => {
		expect(classifyCommand("pytest tests/")).toBe("auto_ok")
	})

	it("auto-oks git diff", () => {
		expect(classifyCommand("git diff HEAD~1")).toBe("auto_ok")
	})

	it("auto-oks git status", () => {
		expect(classifyCommand("git status")).toBe("auto_ok")
	})

	it("requires confirm for npm install lodash", () => {
		expect(classifyCommand("npm install lodash")).toBe("confirm")
	})

	it("auto-oks npm test (not in network subcmd set)", () => {
		expect(classifyCommand("npm test")).toBe("auto_ok")
	})

	it("requires confirm for unknown commands", () => {
		expect(classifyCommand("curl https://example.com")).toBe("confirm")
	})

	it("auto-oks formatters and ls", () => {
		expect(classifyCommand("ruff check .")).toBe("auto_ok")
		expect(classifyCommand("ls -la")).toBe("auto_ok")
	})
})
