// ailiance-agent fork: ailiance default fallback
//
// When no provider is configured (no API key env vars, no persisted
// auth state), default to the ailiance gateway via the OpenAI-compatible
// code path. The user can override by setting AILIANCE_GATEWAY=<url>
// (AGENT_KIKI_GATEWAY remains supported as deprecated alias) or by
// configuring any of the standard upstream provider env vars.
//
// Behaviour matrix:
//   - AILIANCE_GATEWAY=<url> set      -> session override with that url
//   - AGENT_KIKI_GATEWAY=<url> set    -> session override (deprecated)
//   - upstream provider env present   -> skip (env-config wins)
//   - persisted welcomeViewCompleted  -> skip (user already onboarded)
//   - otherwise                       -> persist ailiance defaults so
//                                        first-run + later runs both work

import type { StateManager } from "@/core/storage/StateManager"

// The gateway runs on electron-server (FastAPI :9300). Tailscale MagicDNS
// resolves `electron-server` to 100.78.191.52 for users on the tailnet.
// The /v1 suffix is REQUIRED: the OpenAI-compatible SDK appends
// /chat/completions to the configured baseUrl, and the gateway only
// matches the OpenAI route prefix /v1/*. Without it, every request
// 404s. Off-tailnet users must set AILIANCE_GATEWAY to a reachable
// URL (with or without /v1 — resolveEuKikiGatewayUrl normalises).
export const AILIANCE_DEFAULT_GATEWAY = "http://electron-server:9300/v1"
export const AILIANCE_DEFAULT_MODEL = "ailiance"

/**
 * Sentinel value, never a real credential. The ailiance gateway does not
 * validate API keys — it is an internal LiteLLM proxy on the trusted
 * network. This string is required only because the openai-compatible
 * provider code path expects a non-empty key field; passing "" would
 * cause the SDK client to refuse to construct.
 *
 * Important: any code that passes a key to setSecret("openAiApiKey", ...)
 * for the ailiance default MUST reference this constant by name rather
 * than re-inlining the literal "unused", so a future rename / rotation
 * cannot leave a stray copy behind. No telemetry path logs this value.
 */
export const AILIANCE_DEFAULT_API_KEY = "unused"

export type EuKikiDefaultReason =
	| "env-provider-already-set"
	| "auth-already-configured"
	| "applied-from-env"
	| "applied-fallback"
	| "migrated-stale-default"

/**
 * Returns true when a previously-persisted baseUrl is a known-broken
 * ailiance default that this CLI version must heal. Covers the two
 * historical leak points:
 *   - http://studio:9300* — wrong host (gateway is on electron-server)
 *   - http://electron-server:9300 — correct host but missing /v1
 *   - http://studio:9303* / direct worker ports — bypassed gateway
 * Conservative: only matches the exact patterns shipped by prior
 * defaults, never a user-supplied URL.
 */
export function needsStaleDefaultMigration(url: string): boolean {
	const trimmed = url.replace(/\/+$/, "")
	if (trimmed === "http://studio:9300") return true
	if (trimmed.startsWith("http://studio:930")) return true // 9301..9309 direct workers
	if (trimmed === "http://electron-server:9300") return true
	return false
}

export interface EuKikiDefaultDecision {
	applied: boolean
	reason: EuKikiDefaultReason
	gatewayUrl?: string
}

/**
 * Derive the ailiance gateway URL from env (AILIANCE_GATEWAY, or the
 * deprecated AGENT_KIKI_GATEWAY alias) or the built-in default.
 * Trailing slashes and `/chat/completions` suffix are stripped to
 * mirror provider-config normalisation.
 */
export function resolveEuKikiGatewayUrl(env: NodeJS.ProcessEnv = process.env): string {
	const raw = (env.AILIANCE_GATEWAY || env.AGENT_KIKI_GATEWAY || AILIANCE_DEFAULT_GATEWAY).trim()
	let url = raw.replace(/\/chat\/completions\/?$/, "")
	url = url.replace(/\/+$/, "")
	return url
}

/**
 * Returns true when at least one upstream provider env var is present.
 * AILIANCE_GATEWAY / AGENT_KIKI_GATEWAY are intentionally excluded —
 * they are our opt-in, not competing providers.
 */
export function hasNonEuKikiProviderEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	const sentinels = [
		"ANTHROPIC_API_KEY",
		"OPENAI_API_KEY",
		"OPENROUTER_API_KEY",
		"GEMINI_API_KEY",
		"GROQ_API_KEY",
		"XAI_API_KEY",
		"MISTRAL_API_KEY",
		"MOONSHOT_API_KEY",
		"HF_TOKEN",
		"ZAI_API_KEY",
		"MINIMAX_API_KEY",
		"MINIMAX_CN_API_KEY",
		"CEREBRAS_API_KEY",
		"AI_GATEWAY_API_KEY",
		"OPENCODE_API_KEY",
		"KIMI_API_KEY",
		"DEEPSEEK_API_KEY",
		"QWEN_API_KEY",
		"TOGETHER_API_KEY",
		"FIREWORKS_API_KEY",
		"NEBIUS_API_KEY",
		"OPENAI_COMPATIBLE_CUSTOM_KEY",
		"OPENAI_API_BASE",
		"AWS_ACCESS_KEY_ID",
		"AWS_BEDROCK_MODEL",
		"GOOGLE_CLOUD_PROJECT",
		"GCP_PROJECT",
	]
	return sentinels.some((key) => !!env[key])
}

interface ApplyOptions {
	env?: NodeJS.ProcessEnv
}

/**
 * Apply the ailiance defaults to the StateManager.
 * Returns a decision object so callers can log what happened.
 *
 * Precedence:
 *   1. Any non-kiki upstream provider env var -> skip.
 *   2. AGENT_KIKI_GATEWAY env var present     -> session override
 *      (does NOT persist; respects per-run overrides).
 *   3. welcomeViewCompleted=true && persisted provider already set -> skip.
 *   4. Otherwise -> persist ailiance defaults + mark welcomeViewCompleted.
 */
export function applyEuKikiDefault(
	stateManager: StateManager,
	options: ApplyOptions = {},
): EuKikiDefaultDecision {
	const env = options.env ?? process.env

	if (hasNonEuKikiProviderEnv(env)) {
		return { applied: false, reason: "env-provider-already-set" }
	}

	const gatewayUrl = resolveEuKikiGatewayUrl(env)
	const explicitOverride = !!(env.AILIANCE_GATEWAY || env.AGENT_KIKI_GATEWAY)

	if (explicitOverride) {
		// In-memory override only; do not pollute persisted config so the
		// user can rotate AILIANCE_GATEWAY freely between runs.
		stateManager.setSessionOverride("actModeApiProvider", "openai")
		stateManager.setSessionOverride("planModeApiProvider", "openai")
		stateManager.setSessionOverride("actModeOpenAiModelId", AILIANCE_DEFAULT_MODEL)
		stateManager.setSessionOverride("planModeOpenAiModelId", AILIANCE_DEFAULT_MODEL)
		stateManager.setSessionOverride("openAiBaseUrl", gatewayUrl)
		// Secrets cannot be session-overridden; mirror them in cache via
		// setSecret so the API handler can build a client. We only do this
		// if the cache slot is empty so we never clobber a real key.
		const cachedKey = stateManager.getSecretKey("openAiApiKey")
		if (!cachedKey) {
			stateManager.setSecret("openAiApiKey", AILIANCE_DEFAULT_API_KEY)
		}
		const cachedCompatKey = stateManager.getSecretKey("openAiCompatibleCustomApiKey")
		if (!cachedCompatKey) {
			stateManager.setSecret("openAiCompatibleCustomApiKey", AILIANCE_DEFAULT_API_KEY)
		}
		return { applied: true, reason: "applied-from-env", gatewayUrl }
	}

	const welcomeViewCompleted = stateManager.getGlobalStateKey("welcomeViewCompleted")
	const existingProvider = stateManager.getGlobalSettingsKey("actModeApiProvider")
	if (welcomeViewCompleted === true && existingProvider) {
		// Stale-default migration: prior CLI versions persisted broken
		// baseUrls (http://studio:9300, http://electron-server:9300
		// without /v1 — gateway only matches /v1/* and 404s otherwise).
		// Detect those and silently fix without forcing a re-onboard.
		const persisted = stateManager.getGlobalSettingsKey("openAiBaseUrl") as string | undefined
		if (persisted && needsStaleDefaultMigration(persisted)) {
			stateManager.setGlobalState("openAiBaseUrl", gatewayUrl)
			return { applied: true, reason: "migrated-stale-default", gatewayUrl }
		}
		return { applied: false, reason: "auth-already-configured" }
	}

	// First-run fallback: persist so subsequent invocations still work.
	stateManager.setGlobalState("actModeApiProvider", "openai")
	stateManager.setGlobalState("planModeApiProvider", "openai")
	stateManager.setGlobalState("actModeOpenAiModelId", AILIANCE_DEFAULT_MODEL)
	stateManager.setGlobalState("planModeOpenAiModelId", AILIANCE_DEFAULT_MODEL)
	stateManager.setGlobalState("openAiBaseUrl", gatewayUrl)
	stateManager.setSecret("openAiApiKey", AILIANCE_DEFAULT_API_KEY)
	stateManager.setSecret("openAiCompatibleCustomApiKey", AILIANCE_DEFAULT_API_KEY)
	stateManager.setGlobalState("welcomeViewCompleted", true)

	return { applied: true, reason: "applied-fallback", gatewayUrl }
}
