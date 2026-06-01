export interface RetrievalConfig {
	baseK: number
	findK: number
	threshold: number
}

const DEFAULTS: RetrievalConfig = { baseK: 8, findK: 5, threshold: 0.3 }

function numEnv(name: string, fallback: number): number {
	const raw = process.env[name]
	if (raw === undefined) {
		return fallback
	}
	const n = Number(raw)
	return Number.isFinite(n) ? n : fallback
}

export function getRetrievalConfig(): RetrievalConfig {
	return {
		baseK: numEnv("AILIANCE_MCP_TOP_K", DEFAULTS.baseK),
		findK: numEnv("AILIANCE_MCP_FIND_K", DEFAULTS.findK),
		threshold: numEnv("AILIANCE_MCP_THRESHOLD", DEFAULTS.threshold),
	}
}
