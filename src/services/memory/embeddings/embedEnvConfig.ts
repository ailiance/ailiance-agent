// src/services/memory/embeddings/embedEnvConfig.ts
import type { EmbedConfig } from "./embedClient"

/** Returns an EmbedConfig from env, or null when embeddings are disabled or unconfigured.
 *  Gated: only active when ISAAC_MEM_EMBEDDINGS === "1". Default OFF ⇒ null ⇒ callers no-op.
 *
 *  Resolution order when enabled:
 *   1. Explicit embeddings env (ISAAC_EMBEDDINGS_BASE_URL/_API_KEY/_MODEL) wins.
 *   2. Otherwise, if the ailiance gateway is configured (AILIANCE_GATEWAY), derive the
 *      embeddings endpoint from it so embeddings are wired to the sovereign gateway
 *      without separate setup. The gateway accepts any bearer token, so the key falls
 *      back to the "unused" sentinel, and the model defaults to the gateway's embedding
 *      model (ailiance-rust-emb) rather than the OpenAI default. */
export function embedConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EmbedConfig | null {
	if (env.ISAAC_MEM_EMBEDDINGS !== "1") {
		return null
	}

	let baseUrl = env.ISAAC_EMBEDDINGS_BASE_URL
	let apiKey = env.ISAAC_EMBEDDINGS_API_KEY
	let model = env.ISAAC_EMBEDDINGS_MODEL

	// Derive from the ailiance gateway only when no explicit embeddings base URL is set.
	if (!baseUrl && env.AILIANCE_GATEWAY) {
		baseUrl = env.AILIANCE_GATEWAY
		apiKey = apiKey || "unused"
		model = model || "ailiance-rust-emb"
	}

	if (!baseUrl || !apiKey) {
		return null
	}
	return { baseUrl, apiKey, model: model || "text-embedding-3-small" }
}
