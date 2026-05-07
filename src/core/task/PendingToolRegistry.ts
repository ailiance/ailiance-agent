import { EventEmitter } from "events"
import { ulid } from "ulid"

/**
 * Status of a pending (asynchronously executing) tool invocation.
 */
export type ToolPendingStatus = "running" | "completed" | "failed" | "cancelled"

/**
 * Single entry tracked by {@link PendingToolRegistry}.
 *
 * Foundation for Sprint 2 async tool execution (S2-A → S2-G of the v0.6 roadmap).
 * One entry per tool invocation; lifetime spans from `register()` to terminal
 * status (completed/failed/cancelled) and is later garbage-collected by
 * `prune()`.
 */
export interface PendingToolEntry {
	/** Unique id for this pending invocation (ulid). Used as registry key. */
	taskId: string
	/** Canonical tool name (e.g. "execute_command", "search_files"). */
	toolName: string
	/** Optional id of the originating tool block from the LLM message. */
	blockId?: string
	status: ToolPendingStatus
	/** Wall-clock start time, ms since epoch. */
	startedAt: number
	/** Wall-clock finish time, ms since epoch. Set on terminal status. */
	finishedAt?: number
	/**
	 * Per-entry abort controller. Callers should pass `entry.abortController.signal`
	 * to whatever cancellable I/O the tool performs.
	 */
	abortController: AbortController
	/**
	 * Final result payload. Loose type to accommodate the heterogeneous
	 * ToolResponse union. Populated on `completed`; may also be set with
	 * partial info on `failed`/`cancelled` if useful.
	 */
	result?: unknown
	/** Human-readable error string, set when status === "failed". */
	error?: string
}

export interface RegisterOptions {
	toolName: string
	blockId?: string
}

export interface ListFilter {
	status?: ToolPendingStatus
	toolName?: string
}

/**
 * Per-Task in-memory registry of asynchronously executing tool invocations.
 *
 * Not a global singleton: each {@link TaskState} owns one. Callers register
 * a tool when it kicks off, then transition it to a terminal status when
 * it finishes (`complete`/`fail`/`cancel`). The registry emits an `"updated"`
 * event on every state change so observers (e.g. the agent loop, `/trace`)
 * can react without polling.
 */
export class PendingToolRegistry {
	private readonly entries = new Map<string, PendingToolEntry>()
	public readonly events = new EventEmitter()

	/**
	 * Register a new running tool invocation.
	 *
	 * @returns the freshly-created entry. Caller should hand `entry.abortController.signal`
	 * to the underlying tool implementation if it supports cancellation.
	 */
	register(opts: RegisterOptions): PendingToolEntry {
		const entry: PendingToolEntry = {
			taskId: ulid(),
			toolName: opts.toolName,
			blockId: opts.blockId,
			status: "running",
			startedAt: Date.now(),
			abortController: new AbortController(),
		}
		this.entries.set(entry.taskId, entry)
		this.events.emit("updated", entry)
		return entry
	}

	get(taskId: string): PendingToolEntry | undefined {
		return this.entries.get(taskId)
	}

	/**
	 * Mark an entry as completed and store the result. No-op if the entry
	 * does not exist or has already reached a terminal status.
	 */
	complete(taskId: string, result: unknown): void {
		const entry = this.entries.get(taskId)
		if (!entry || entry.status !== "running") {
			return
		}
		entry.status = "completed"
		entry.finishedAt = Date.now()
		entry.result = result
		this.events.emit("updated", entry)
	}

	/**
	 * Mark an entry as failed with a human-readable error. No-op if missing
	 * or already terminal.
	 */
	fail(taskId: string, error: string): void {
		const entry = this.entries.get(taskId)
		if (!entry || entry.status !== "running") {
			return
		}
		entry.status = "failed"
		entry.finishedAt = Date.now()
		entry.error = error
		this.events.emit("updated", entry)
	}

	/**
	 * Abort a running tool. Calls `abortController.abort()` (so any consumers
	 * of `signal` see the cancellation) and transitions to "cancelled".
	 *
	 * @returns true if the entry existed and was running prior to this call.
	 */
	cancel(taskId: string): boolean {
		const entry = this.entries.get(taskId)
		if (!entry || entry.status !== "running") {
			return false
		}
		entry.abortController.abort()
		entry.status = "cancelled"
		entry.finishedAt = Date.now()
		this.events.emit("updated", entry)
		return true
	}

	/**
	 * Cancel every currently-running tool. Used at task teardown to avoid
	 * orphan background work.
	 *
	 * @returns the number of entries that transitioned from running → cancelled.
	 */
	cancelAll(): number {
		let count = 0
		for (const entry of this.entries.values()) {
			if (entry.status === "running") {
				if (this.cancel(entry.taskId)) {
					count++
				}
			}
		}
		return count
	}

	/**
	 * List entries, optionally filtered by status and/or toolName.
	 * Returned array is a snapshot; mutating it does not affect the registry.
	 */
	list(filter?: ListFilter): PendingToolEntry[] {
		const all = Array.from(this.entries.values())
		if (!filter) {
			return all
		}
		return all.filter((e) => {
			if (filter.status && e.status !== filter.status) {
				return false
			}
			if (filter.toolName && e.toolName !== filter.toolName) {
				return false
			}
			return true
		})
	}

	/**
	 * Drop entries whose terminal status was reached more than `maxAgeMs` ago.
	 * Running entries are always kept regardless of age.
	 *
	 * @returns the number of entries removed.
	 */
	prune(maxAgeMs = 60_000): number {
		const cutoff = Date.now() - maxAgeMs
		let removed = 0
		for (const [id, entry] of this.entries) {
			if (entry.status === "running") {
				continue
			}
			if (entry.finishedAt !== undefined && entry.finishedAt < cutoff) {
				this.entries.delete(id)
				removed++
			}
		}
		return removed
	}
}
