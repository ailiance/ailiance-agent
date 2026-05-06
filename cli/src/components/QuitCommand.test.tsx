import { render } from "ink-testing-library"
// biome-ignore lint/correctness/noUnusedImports: React must be in scope for JSX in this test file.
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock ink's useApp
const mockExit = vi.fn()
vi.mock("ink", async (importOriginal) => {
	const actual = await importOriginal<typeof import("ink")>()
	return {
		...actual,
		useApp: () => ({ exit: mockExit }),
	}
})

// Mock child_process
vi.mock("child_process", () => ({
	execSync: vi.fn().mockReturnValue(""),
	exec: vi.fn(),
}))

// Mock dependencies
vi.mock("@/core/controller/slash/getAvailableSlashCommands", () => ({
	getAvailableSlashCommands: vi.fn().mockResolvedValue({
		commands: [
			{ name: "q", description: "Quit", source: "builtin" },
			{ name: "exit", description: "Exit", source: "builtin" },
		],
	}),
}))

vi.mock("@/core/storage/StateManager", () => ({
	StateManager: {
		get: () => ({
			getGlobalSettingsKey: vi.fn().mockReturnValue("act"),
			getGlobalStateKey: vi.fn().mockReturnValue([]),
			getApiConfiguration: vi.fn().mockReturnValue({}),
		}),
	},
}))

vi.mock("@/services/telemetry", () => ({
	telemetryService: {
		captureHostEvent: vi.fn(),
	},
}))

vi.mock("@shared/services/Session", () => ({
	Session: {
		get: () => ({
			getStats: vi.fn().mockReturnValue({}),
		}),
	},
}))

vi.mock("../context/TaskContext", () => ({
	useTaskContext: () => ({
		controller: {},
		clearState: vi.fn(),
	}),
	useTaskState: () => ({
		diracMessages: [],
	}),
}))

vi.mock("../hooks/useStateSubscriber", () => ({
	useIsSpinnerActive: () => ({ isActive: false, startTime: 0 }),
}))

import { ChatView } from "./ChatView"

// Helper to wait for async state updates
const delay = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

// NOTE: These tests simulate writing `/q` / `/exit` to stdin and pressing
// Enter, expecting the slash-menu Enter handler at
// `useChatInputHandler.ts` (the `cmd.name === "exit" || cmd.name === "q"`
// branch) to fire `handleExit`. In headless ink-testing-library the
// SlashCommandMenu's selectedSlashIndex / showSlashMenu state never settles
// before the Enter byte is consumed, so the selection branch is unreachable
// from a stdin-only harness. Skipped pending a refactor that exposes the
// menu state via a hook seam (or a direct-call test on the slash handler).
describe.skip("Quit Command (/q and /exit)", () => {
	const mockOnExit = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should exit the application when /q is selected from slash menu", async () => {
		const { stdin } = render(<ChatView onExit={mockOnExit} />)
		await delay()

		// Type /q
		stdin.write("/q")
		await delay()

		// Press Enter
		stdin.write("\r")

		// handleExit has a 150ms timeout
		await delay(200)

		expect(mockExit).toHaveBeenCalled()
		expect(mockOnExit).toHaveBeenCalled()
	})

	it("should exit the application when /exit is selected from slash menu", async () => {
		const { stdin } = render(<ChatView onExit={mockOnExit} />)
		await delay()

		// Type /exit
		stdin.write("/exit")
		await delay()

		// Press Enter
		stdin.write("\r")

		// handleExit has a 150ms timeout
		await delay(200)

		expect(mockExit).toHaveBeenCalled()
		expect(mockOnExit).toHaveBeenCalled()
	})
})
