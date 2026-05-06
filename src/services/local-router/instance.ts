import { DEFAULT_WORKERS } from "./defaults"
import { LocalRouter } from "./LocalRouter"
import type { WorkerEndpoint } from "./types"

let instance: LocalRouter | null = null

export function getLocalRouter(workers?: WorkerEndpoint[]): LocalRouter {
	if (!instance) {
		instance = new LocalRouter(workers ?? DEFAULT_WORKERS)
		instance.start()
	}
	return instance
}

export function disposeLocalRouter(): void {
	if (instance) {
		instance.dispose()
		instance = null
	}
}

/**
 * For tests: reset the singleton.
 */
export function __resetLocalRouterForTest(): void {
	if (instance) instance.dispose()
	instance = null
}
