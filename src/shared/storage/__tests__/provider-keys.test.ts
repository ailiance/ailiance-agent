import { liteLlmDefaultModelId } from "@shared/api"
import { expect } from "chai"
import { describe, it } from "mocha"
import { getProviderDefaultModelId, getProviderModelIdKey } from "../provider-keys"

describe("Provider key mapping", () => {
	it("returns LiteLLM default model ID", () => {
		expect(getProviderDefaultModelId("litellm")).to.equal(liteLlmDefaultModelId)
	})

	it("uses provider-specific model key for LiteLLM", () => {
		expect(getProviderModelIdKey("litellm", "act")).to.equal("actModeLiteLlmModelId")
		expect(getProviderModelIdKey("litellm", "plan")).to.equal("planModeLiteLlmModelId")
	})

	it("keeps provider-specific model key behavior for OpenRouter", () => {
		expect(getProviderModelIdKey("openrouter", "act")).to.equal("actModeOpenRouterModelId")
		expect(getProviderModelIdKey("openrouter", "plan")).to.equal("planModeOpenRouterModelId")
	})

	it("uses provider-specific model key behavior for Isaac", () => {
		expect(getProviderModelIdKey("isaac", "act")).to.equal("actModeIsaacModelId")
		expect(getProviderModelIdKey("isaac", "plan")).to.equal("planModeIsaacModelId")
	})

	it("uses generic model key for vscode-lm", () => {
		expect(getProviderModelIdKey("vscode-lm", "act")).to.equal("actModeApiModelId")
		expect(getProviderModelIdKey("vscode-lm", "plan")).to.equal("planModeApiModelId")
	})
})
