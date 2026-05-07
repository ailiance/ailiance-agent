import type { WorkerEndpoint } from "./types"

/**
 * Default eu-kiki worker endpoints.
 * Users can override via setting `localRouterWorkers` (array of WorkerEndpoint).
 *
 * ctxMax reflects the runtime context window of each worker (mesured live).
 * Values that are too small for aki's ~8k system prompt will be skipped by
 * LocalRouter.pickWorker() to avoid "context exceeded" errors.
 */
export const DEFAULT_WORKERS: WorkerEndpoint[] = [
	{
		id: "tower-gemma",
		url: "http://100.78.6.122:9304/v1",
		modelId: "eu-kiki-gemma",
		capabilities: ["general", "code"],
		priority: 10,
		ctxMax: 32768, // llama-server -c 32768 (Gemma 3 native 128k)
		supportsTools: false, // emulation needed (markdown_fence)
	},
	{
		id: "macm1-devstral",
		url: "http://100.112.121.126:9302/v1",
		modelId: "devstral-24b",
		capabilities: ["code", "general"],
		priority: 9,
		ctxMax: 32768, // Devstral 24B 4-bit MLX
		supportsTools: false, // emulation needed (xml format)
	},
	{
		id: "kxkm-qwen3-next",
		url: "http://100.78.191.52:8002/v1", // autossh tunnel electron-server:8002 → kxkm-ai:18888
		modelId: "qwen3-next-80b",
		capabilities: ["reason", "code", "general"],
		priority: 8,
		ctxMax: 196608, // Qwen3-Next supports 192k context
		supportsTools: false, // emulation needed (xml format)
	},
	{
		id: "studio-mistral-medium",
		url: "http://100.116.92.12:9301/v1",
		modelId: "mistral-medium-3.5-128b",
		capabilities: ["reason", "general", "fr"],
		priority: 7,
		ctxMax: 262144, // Mistral Medium 3.5 native 262k
		supportsTools: true, // native function calling (mistral-medium variant)
	},
	{
		id: "studio-eurollm",
		url: "http://100.116.92.12:9303/v1",
		modelId: "eurollm-22b",
		capabilities: ["fr"], // dropped "general" — too small for aki system prompt
		priority: 6,
		ctxMax: 4096, // EuroLLM 22B native — TOO SMALL for aki system prompt typically
		supportsTools: true, // native function calling
	},
]
