import { exit } from "node:process"
import type { CliContext } from "../types"
import { telemetryDisposed, setTelemetryDisposed } from "./state"

export async function disposeTelemetryServices(): Promise<void> {
	if (telemetryDisposed) {
		return
	}

	setTelemetryDisposed(true)
	const { telemetryService } = await import("@/services/telemetry")
	await Promise.allSettled([telemetryService.dispose()])
}

export async function disposeCliContext(ctx: CliContext | null): Promise<void> {
	// Best-effort stop of webui static server (detached child, non-blocking)
	try {
		const { webuiServer } = await import("@/services/webui/WebuiServer")
		await webuiServer.stop()
	} catch {
		// WebuiServer may not be initialized
	}

	if (!ctx) {
		try {
			const { SymbolIndexService } = await import("@/services/symbol-index/SymbolIndexService")
			SymbolIndexService.getInstance().dispose()
		} catch {
			// Best effort
		}
		await disposeTelemetryServices()
		return
	}

	const { ErrorService } = await import("@/services/error/ErrorService")
	await ctx.controller.stateManager.flushPendingState()
	await ctx.controller.dispose()
	await ErrorService.get().dispose()
	try {
		const { SymbolIndexService } = await import("@/services/symbol-index/SymbolIndexService")
		SymbolIndexService.getInstance().dispose()
	} catch {
		// Best effort
	}

	await disposeTelemetryServices()
}

/**
 * Create the standard cleanup function for Ink apps.
 */
export function createInkCleanup(ctx: CliContext, onTaskError?: () => boolean): () => Promise<void> {
	return async () => {
		await disposeCliContext(ctx)
		if (onTaskError?.()) {
			const { printWarning } = await import("./display")
			printWarning("Task ended with errors.")
			exit(1)
		}
		exit(0)
	}
}

/**
 * Wait for stdout to fully drain before exiting.
 * Critical for piping - ensures data is flushed to the next command in the pipe.
 */
export async function drainStdout(): Promise<void> {
	return new Promise<void>((resolve) => {
		// Check if stdout needs draining
		if (process.stdout.writableNeedDrain) {
			process.stdout.once("drain", resolve)
		} else {
			// Give a small delay to ensure any pending writes complete
			setImmediate(resolve)
		}
	})
}
