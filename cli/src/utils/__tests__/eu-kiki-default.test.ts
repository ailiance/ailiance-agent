import { describe, expect, it } from "vitest"
import {
	EU_KIKI_DEFAULT_API_KEY,
	EU_KIKI_DEFAULT_GATEWAY,
	EU_KIKI_DEFAULT_MODEL,
	applyEuKikiDefault,
	hasNonEuKikiProviderEnv,
	resolveEuKikiGatewayUrl,
} from "../eu-kiki-default"

/**
 * Lightweight in-memory StateManager double matching the methods used by
 * applyEuKikiDefault. Avoids spinning up the full StateManager (filesystem,
 * VS Code shim, etc.) for a unit-level test of the decision logic.
 */
function makeFakeStateManager() {
	const settings: Record<string, unknown> = {}
	const globalState: Record<string, unknown> = {}
	const secrets: Record<string, unknown> = {}
	const sessionOverrides: Record<string, unknown> = {}
	return {
		settings,
		globalState,
		secrets,
		sessionOverrides,
		setSessionOverride(key: string, value: unknown) {
			sessionOverrides[key] = value
		},
		setGlobalState(key: string, value: unknown) {
			globalState[key] = value
		},
		setSecret(key: string, value: unknown) {
			secrets[key] = value
		},
		getGlobalSettingsKey(key: string) {
			return sessionOverrides[key] ?? settings[key] ?? globalState[key]
		},
		getGlobalStateKey(key: string) {
			return globalState[key]
		},
		getSecretKey(key: string) {
			return secrets[key]
		},
	}
}

describe("eu-kiki default fallback", () => {
	it("resolveEuKikiGatewayUrl falls back to studio:9300", () => {
		expect(resolveEuKikiGatewayUrl({})).toBe(EU_KIKI_DEFAULT_GATEWAY)
	})

	it("resolveEuKikiGatewayUrl honours AGENT_KIKI_GATEWAY", () => {
		expect(resolveEuKikiGatewayUrl({ AGENT_KIKI_GATEWAY: "http://example.com:9999/" })).toBe(
			"http://example.com:9999",
		)
	})

	it("resolveEuKikiGatewayUrl strips /chat/completions suffix", () => {
		expect(resolveEuKikiGatewayUrl({ AGENT_KIKI_GATEWAY: "http://x:9300/chat/completions/" })).toBe(
			"http://x:9300",
		)
	})

	it("hasNonEuKikiProviderEnv detects a real provider env", () => {
		expect(hasNonEuKikiProviderEnv({ ANTHROPIC_API_KEY: "k" })).toBe(true)
		expect(hasNonEuKikiProviderEnv({ AGENT_KIKI_GATEWAY: "http://foo" })).toBe(false)
		expect(hasNonEuKikiProviderEnv({})).toBe(false)
	})

	it("applies persisted defaults when nothing is configured", () => {
		const sm = makeFakeStateManager()
		const decision = applyEuKikiDefault(sm as any, { env: {} })
		expect(decision.applied).toBe(true)
		expect(decision.reason).toBe("applied-fallback")
		expect(decision.gatewayUrl).toBe(EU_KIKI_DEFAULT_GATEWAY)
		expect(sm.globalState.actModeApiProvider).toBe("openai")
		expect(sm.globalState.planModeApiProvider).toBe("openai")
		expect(sm.globalState.actModeOpenAiModelId).toBe(EU_KIKI_DEFAULT_MODEL)
		expect(sm.globalState.openAiBaseUrl).toBe(EU_KIKI_DEFAULT_GATEWAY)
		expect(sm.secrets.openAiApiKey).toBe(EU_KIKI_DEFAULT_API_KEY)
		expect(sm.globalState.welcomeViewCompleted).toBe(true)
	})

	it("uses session overrides (no persistence) when AGENT_KIKI_GATEWAY is set", () => {
		const sm = makeFakeStateManager()
		const decision = applyEuKikiDefault(sm as any, { env: { AGENT_KIKI_GATEWAY: "http://other:9300" } })
		expect(decision.applied).toBe(true)
		expect(decision.reason).toBe("applied-from-env")
		expect(decision.gatewayUrl).toBe("http://other:9300")
		expect(sm.sessionOverrides.openAiBaseUrl).toBe("http://other:9300")
		expect(sm.sessionOverrides.actModeApiProvider).toBe("openai")
		// Persisted slot stays untouched.
		expect(sm.globalState.openAiBaseUrl).toBeUndefined()
		// Secret cache populated only because slot was empty.
		expect(sm.secrets.openAiApiKey).toBe(EU_KIKI_DEFAULT_API_KEY)
	})

	it("does not clobber an existing real openAiApiKey when overriding via env", () => {
		const sm = makeFakeStateManager()
		sm.secrets.openAiApiKey = "real-key"
		applyEuKikiDefault(sm as any, { env: { AGENT_KIKI_GATEWAY: "http://x:9300" } })
		expect(sm.secrets.openAiApiKey).toBe("real-key")
	})

	it("skips when an upstream provider env var is set", () => {
		const sm = makeFakeStateManager()
		const decision = applyEuKikiDefault(sm as any, { env: { ANTHROPIC_API_KEY: "k" } })
		expect(decision.applied).toBe(false)
		expect(decision.reason).toBe("env-provider-already-set")
		expect(sm.globalState.actModeApiProvider).toBeUndefined()
	})

	it("skips when the user has already onboarded", () => {
		const sm = makeFakeStateManager()
		sm.globalState.welcomeViewCompleted = true
		sm.globalState.actModeApiProvider = "anthropic"
		const decision = applyEuKikiDefault(sm as any, { env: {} })
		expect(decision.applied).toBe(false)
		expect(decision.reason).toBe("auth-already-configured")
	})
})
