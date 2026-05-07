import { Text } from "ink"
import { render } from "ink-testing-library"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { App } from "./App"

// Mock the child components to isolate App routing logic
vi.mock("./AiActDisclosure", () => ({
	AiActDisclosure: ({ onAcknowledge }: any) => {
		// Auto-acknowledge in tests so routing logic is exercised directly
		React.useEffect(() => { onAcknowledge() }, [])
		return null
	},
}))

vi.mock("./ChatView", () => ({
	ChatView: ({ taskId, controller }: any) =>
		React.createElement(Text, null, `ChatView: ${taskId || "no-id"} controller=${controller ? "present" : "none"}`),
}))

vi.mock("./TaskJsonView", () => ({
	TaskJsonView: ({ taskId, verbose }: any) =>
		React.createElement(Text, null, `TaskJsonView: ${taskId || "no-id"} verbose=${String(verbose)}`),
}))

vi.mock("./HistoryView", () => ({
	HistoryView: ({ items }: any) => React.createElement(Text, null, `HistoryView: ${items?.length || 0} items`),
}))

vi.mock("./ConfigView", () => ({
	ConfigView: ({ dataDir }: any) => React.createElement(Text, null, `ConfigView: ${dataDir}`),
}))

vi.mock("./AuthView", () => ({
	AuthView: ({ quickSetup }: any) => React.createElement(Text, null, `AuthView: ${quickSetup?.provider || "no-provider"}`),
}))

vi.mock("../context/TaskContext", () => ({
	TaskContextProvider: ({ children }: any) => children,
}))

vi.mock("../context/StdinContext", () => ({
	StdinProvider: ({ children }: any) => children,
}))

// Mock useTerminalSize to prevent EventEmitter memory leak warnings from resize listeners
vi.mock("../hooks/useTerminalSize", () => ({
	useTerminalSize: () => ({ columns: 80, rows: 24, resizeKey: 0 }),
}))

// ink-picture's TerminalInfoProvider issues a terminal-size query escape sequence
// ([16t) on render and may suspend until a response arrives. In headless
// vitest there is no terminal to respond, which prevents InternalApp from
// rendering its content at all. Stub it to a passthrough.
vi.mock("ink-picture", () => ({
	TerminalInfoProvider: ({ children }: any) => children,
}))

// Allow the AiActDisclosure mock's useEffect (which auto-acknowledges) to flush
// before reading `lastFrame()`. Without this the App is still on the disclosure
// gate and renders nothing routable.
const delay = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

describe("App", () => {
	const mockController = {
		dispose: vi.fn(),
		stateManager: { flushPendingState: vi.fn() },
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("view routing", () => {
		it("should render ChatView when view is task", async () => {
			const { lastFrame } = render(<App controller={mockController} taskId="test-task" view="task" />)
			await delay()
			expect(lastFrame()).toContain("ChatView")
			expect(lastFrame()).toContain("test-task")
		})

		it("should render TaskJsonView when view is task with jsonOutput", async () => {
			const { lastFrame } = render(<App controller={mockController} jsonOutput={true} taskId="test-task" view="task" />)
			await delay()
			expect(lastFrame()).toContain("TaskJsonView")
			expect(lastFrame()).toContain("test-task")
		})

		it("should render HistoryView when view is history", async () => {
			const historyItems = [
				{ id: "1", ts: Date.now(), task: "Task 1" },
				{ id: "2", ts: Date.now(), task: "Task 2" },
			]
			const { lastFrame } = render(<App controller={mockController} historyItems={historyItems} view="history" />)
			await delay()
			expect(lastFrame()).toContain("HistoryView")
			expect(lastFrame()).toContain("2 items")
		})

		it("should render ConfigView when view is config", async () => {
			const { lastFrame } = render(
				<App dataDir="/path/to/config" globalState={{ key: "value" }} view="config" workspaceState={{}} />,
			)
			await delay()
			expect(lastFrame()).toContain("ConfigView")
			expect(lastFrame()).toContain("/path/to/config")
		})

		it("should render AuthView when view is auth", async () => {
			const { lastFrame } = render(<App controller={mockController} view="auth" />)
			await delay()
			expect(lastFrame()).toContain("AuthView")
		})

		it("should render ChatView when view is welcome", async () => {
			const { lastFrame } = render(
				<App controller={mockController} onWelcomeExit={() => {}} onWelcomeSubmit={() => {}} view="welcome" />,
			)
			await delay()
			expect(lastFrame()).toContain("ChatView")
		})
	})

	describe("default props", () => {
		it("should use default verbose=false with jsonOutput", async () => {
			const { lastFrame } = render(<App controller={mockController} jsonOutput={true} view="task" />)
			await delay()
			expect(lastFrame()).toContain("verbose=false")
		})

		it("should use empty array for historyItems by default", async () => {
			const { lastFrame } = render(<App controller={mockController} view="history" />)
			await delay()
			expect(lastFrame()).toContain("0 items")
		})
	})

	describe("props passing", () => {
		it("should pass verbose to TaskJsonView", async () => {
			const { lastFrame } = render(<App controller={mockController} jsonOutput={true} verbose={true} view="task" />)
			await delay()
			expect(lastFrame()).toContain("verbose=true")
		})

		it("should pass taskId to ChatView", async () => {
			const { lastFrame } = render(<App controller={mockController} taskId="my-task-123" view="task" />)
			await delay()
			expect(lastFrame()).toContain("my-task-123")
		})

		it("should pass controller to ChatView", async () => {
			const { lastFrame } = render(<App controller={mockController} view="task" />)
			await delay()
			expect(lastFrame()).toContain("controller=present")
		})
	})
})
