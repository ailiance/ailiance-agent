import type { WorkerEndpoint } from "./types"

/**
 * Default eu-kiki worker endpoints.
 * Users can override via setting `localRouterWorkers` (array of WorkerEndpoint).
 */
export const DEFAULT_WORKERS: WorkerEndpoint[] = [
	{
		id: "studio-eurollm",
		url: "http://100.116.92.12:9303/v1",
		modelId: "eurollm-22b",
		capabilities: ["fr", "general"],
		priority: 10,
	},
	{
		id: "studio-apertus",
		url: "http://100.116.92.12:9301/v1",
		modelId: "apertus-70b",
		capabilities: ["reason", "general"],
		priority: 9,
	},
	{
		id: "tower-gemma",
		url: "http://100.78.6.122:9304/v1",
		modelId: "eu-kiki-gemma",
		capabilities: ["general", "code"],
		priority: 5,
	},
]
