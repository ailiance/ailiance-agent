import type { IsaacMessage } from "@shared/ExtensionMessage"
import { describe, expect, it } from "vitest"
import { BUTTON_CONFIGS, getButtonConfig } from "./buttonConfig"

describe("getButtonConfig", () => {
	// Test default behavior
	it("returns default config when no task is provided", () => {
		const task = undefined
		const config = getButtonConfig(task)
		expect(config).toEqual(BUTTON_CONFIGS.default)
	})

	// Test streaming/partial messages
	it("returns partial config for streaming messages", () => {
		const streamingMessage: IsaacMessage = {
			type: "say",
			say: "api_req_started",
			partial: true,
			ts: Date.now(),
		}
		const config = getButtonConfig(streamingMessage)
		expect(config).toEqual(BUTTON_CONFIGS.partial)
	})

	// Test error recovery states
	describe("Error Recovery States", () => {
		const errorStates = ["api_req_failed", "mistake_limit_reached"]

		errorStates.forEach((errorState) => {
			it(`returns correct config for ${errorState}`, () => {
				const errorMessage: IsaacMessage = {
					type: "ask",
					ask: errorState as any,
					partial: true,
					text: "",
					ts: Date.now(),
				}
				const config = getButtonConfig(errorMessage)
				expect(config).toEqual(BUTTON_CONFIGS[errorState])
			})
		})
	})

	// Test tool approval states
	// Note: tool/command/browser_action_launch/use_subagents asks are now handled by the
	// inline ApprovalBox, so getButtonConfig returns the default (no action-row buttons).
	describe("Tool Approval States", () => {
		it("returns default config for generic tool ask (handled by inline ApprovalBox)", () => {
			const toolMessage: IsaacMessage = {
				type: "ask",
				ask: "tool",
				text: JSON.stringify({ tool: "generic_tool" }),
				ts: Date.now(),
			}
			const config = getButtonConfig(toolMessage)
			expect(config).toEqual(BUTTON_CONFIGS.default)
		})

		it("returns default config for file editing tools (handled by inline ApprovalBox)", () => {
			const saveMessages = [{ tool: "editedExistingFile" }, { tool: "newFileCreated" }]

			saveMessages.forEach((toolData) => {
				const toolMessage: IsaacMessage = {
					type: "ask",
					ask: "tool",
					text: JSON.stringify(toolData),
					ts: Date.now(),
				}
				const config = getButtonConfig(toolMessage)
				expect(config).toEqual(BUTTON_CONFIGS.default)
			})
		})
	})

	// Test command execution states
	describe("Command Execution States", () => {
		it("returns default config for command ask (handled by inline ApprovalBox)", () => {
			const commandMessage: IsaacMessage = {
				type: "ask",
				ask: "command",
				ts: Date.now(),
			}
			const config = getButtonConfig(commandMessage)
			expect(config).toEqual(BUTTON_CONFIGS.default)
		})

		it("returns command_output config for command_output ask", () => {
			const commandOutputMessage: IsaacMessage = {
				type: "ask",
				ask: "command_output",
				ts: Date.now(),
			}
			const config = getButtonConfig(commandOutputMessage)
			expect(config).toEqual(BUTTON_CONFIGS.command_output)
		})
	})

	// Test other specific ask states
	describe("Other Ask States", () => {
		const stateConfigs = [
			{ ask: "followup", expectedConfig: "followup" },
			// browser_action_launch and use_subagents are handled by the inline ApprovalBox,
			// so getButtonConfig returns the default config for them.
			{ ask: "browser_action_launch", expectedConfig: "default" },
			{ ask: "use_subagents", expectedConfig: "default" },
			{ ask: "plan_mode_respond", expectedConfig: "plan_mode_respond" },
			{ ask: "completion_result", expectedConfig: "completion_result" },
			{ ask: "resume_task", expectedConfig: "resume_task" },
			{ ask: "resume_completed_task", expectedConfig: "resume_completed_task" },
			{ ask: "new_task", expectedConfig: "new_task" },
			{ ask: "condense", expectedConfig: "condense" },
			{ ask: "report_bug", expectedConfig: "report_bug" },
		]

		stateConfigs.forEach(({ ask, expectedConfig }) => {
			it(`returns ${expectedConfig} config for ${ask} ask`, () => {
				const message: IsaacMessage = {
					type: "ask",
					ask: ask as any,
					ts: Date.now(),
				}
				const config = getButtonConfig(message)
				expect(config).toEqual(BUTTON_CONFIGS[expectedConfig])
			})
		})
	})

	// Test API request states
	it("returns api_req_active config for api_req_started say message", () => {
		const apiReqMessage: IsaacMessage = {
			type: "say",
			say: "api_req_started",
			ts: Date.now(),
		}
		const config = getButtonConfig(apiReqMessage)
		expect(config).toEqual(BUTTON_CONFIGS.api_req_active)
	})

	// Test mode parameter (though not extensively used in the current implementation)
	it("handles mode parameter without changing core behavior", () => {
		const message: IsaacMessage = {
			type: "ask",
			ask: "tool",
			text: JSON.stringify({ tool: "generic_tool" }),
			ts: Date.now(),
		}
		const configAct = getButtonConfig(message, "act")
		const configPlan = getButtonConfig(message, "plan")
		expect(configAct).toEqual(configPlan)
	})
})
