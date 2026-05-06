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
		supportsTools: false, // emulation needed
	},
	{
		id: "studio-apertus",
		url: "http://100.116.92.12:9301/v1",
		modelId: "apertus-70b",
		capabilities: ["reason", "general"],
		priority: 7,
		ctxMax: 8192, // Apertus 70B native context
		supportsTools: false, // emulation needed
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
