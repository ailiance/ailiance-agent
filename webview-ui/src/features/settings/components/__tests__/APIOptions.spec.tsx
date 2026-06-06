import { ApiConfiguration } from "@shared/api"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useSettingsStore } from "@/features/settings/store/settingsStore"
import ApiOptions from "../ApiOptions"

vi.mock("@/features/settings/store/settingsStore", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/features/settings/store/settingsStore")>()
	return {
		...actual,
		// Override the Zustand hook with a vi.fn so individual tests can set the
		// returned state via vi.mocked(useSettingsStore).mockReturnValue(...).
		useSettingsStore: vi.fn(() => ({
			apiConfiguration: {
				planModeApiProvider: "openai",
				actModeApiProvider: "openai",
			},
			setApiConfiguration: vi.fn(),
			requestyModels: {},
			planActSeparateModelsSetting: false,
			remoteConfigSettings: {},
		})),
	}
})

const mockExtensionState = (apiConfiguration: Partial<ApiConfiguration>) => {
	vi.mocked(useSettingsStore).mockReturnValue({
		apiConfiguration,
		setApiConfiguration: vi.fn(),
		requestyModels: {},
		planActSeparateModelsSetting: false,
		remoteConfigSettings: {},
	} as any)
}

// NOTE: The requesty / together / fireworks / nebius providers were removed during the
// ISAAC rebrand (they are no longer in shared/providers/providers.json and have no
// provider component in components/providers/). Their tests were deleted accordingly.
// The supported providers are: isaac, openrouter, openai, vscode-lm, litellm, lmstudio.

describe("ApiOptions Component", () => {
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }
		mockExtensionState({
			planModeApiProvider: "openai",
			actModeApiProvider: "openai",
		})
	})

	it("renders the API provider selector", () => {
		render(<ApiOptions currentMode="plan" showModelOptions={true} />)
		const providerSelector = screen.getByTestId("provider-selector-input")
		expect(providerSelector).toBeInTheDocument()
	})
})

describe("OpenApiInfoOptions", () => {
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }
		mockExtensionState({
			planModeApiProvider: "openai",
			actModeApiProvider: "openai",
		})
	})

	it("renders OpenAI Supports Images input", () => {
		render(<ApiOptions currentMode="plan" showModelOptions={true} />)
		fireEvent.click(screen.getByText("Model Configuration"))
		const apiKeyInput = screen.getByText("Supports Images")
		expect(apiKeyInput).toBeInTheDocument()
	})

	it("renders OpenAI Context Window Size input", () => {
		render(<ApiOptions currentMode="plan" showModelOptions={true} />)
		fireEvent.click(screen.getByText("Model Configuration"))
		const orgIdInput = screen.getByText("Context Window Size")
		expect(orgIdInput).toBeInTheDocument()
	})

	it("renders OpenAI Max Output Tokens input", () => {
		render(<ApiOptions currentMode="plan" showModelOptions={true} />)
		fireEvent.click(screen.getByText("Model Configuration"))
		const modelInput = screen.getByText("Max Output Tokens")
		expect(modelInput).toBeInTheDocument()
	})
})
