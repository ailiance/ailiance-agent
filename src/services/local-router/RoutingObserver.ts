export interface RoutingEvent {
	ts: number // Date.now()
	category: string // "code" | "fr" | "reason" | "general"
	workerId: string // "tower-gemma", etc.
	cacheHit: boolean
	estTokens: number // estimate from estimateTokens()
}

type Listener = (e: RoutingEvent) => void

class RoutingObserver {
	private listeners = new Set<Listener>()
	private lastEvent: RoutingEvent | null = null
	private history: RoutingEvent[] = []
	private static readonly MAX_HISTORY = 50

	emit(e: RoutingEvent): void {
		this.lastEvent = e
		this.history.push(e)
		if (this.history.length > RoutingObserver.MAX_HISTORY) {
			this.history.shift()
		}
		for (const l of this.listeners) {
			try {
				l(e)
			} catch {
				/* swallow listener errors */
			}
		}
	}

	subscribe(fn: Listener): () => void {
		this.listeners.add(fn)
		return () => this.listeners.delete(fn)
	}

	last(): RoutingEvent | null {
		return this.lastEvent
	}

	getHistory(): readonly RoutingEvent[] {
		return [...this.history]
	}

	// For tests
	reset(): void {
		this.lastEvent = null
		this.history = []
		this.listeners.clear()
	}
}

export const routingObserver = new RoutingObserver()
