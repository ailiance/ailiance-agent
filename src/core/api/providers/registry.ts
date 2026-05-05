import type { ApiConfiguration } from "@shared/api"
import type { Mode } from "@shared/storage/types"
import type { ApiHandler } from "../"

export interface ProviderEntry {
	factory: (options: Omit<ApiConfiguration, "apiProvider">, mode: Mode) => ApiHandler
}

const registry = new Map<string, ProviderEntry>()

export function registerProvider(id: string, entry: ProviderEntry): void {
	if (registry.has(id)) {
		throw new Error(`Provider "${id}" is already registered`)
	}
	registry.set(id, entry)
}

export function resolveProvider(id: string | undefined): ProviderEntry | undefined {
	return id ? registry.get(id) : undefined
}

/**
 * Pick the plan or act variant of an option based on current mode.
 * Eliminates the `mode === "plan" ? options.planModeX : options.actModeX` repetition.
 */
export function pickMode<T>(options: Record<string, unknown>, mode: Mode, planKey: string, actKey: string): T | undefined {
	return (mode === "plan" ? options[planKey] : options[actKey]) as T | undefined
}
