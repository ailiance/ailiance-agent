import { Logger } from "@shared/services/Logger"
import { HealthMonitor } from "./HealthMonitor"
import { PromptClassifier } from "./PromptClassifier"
import { ResponseCache } from "./ResponseCache"
import type { ChatRequest, ChatResponse, WorkerEndpoint } from "./types"

export class LocalRouter {
	private workers = new Map<string, WorkerEndpoint>()
	private cache = new ResponseCache()
	private classifier = new PromptClassifier()
	private health: HealthMonitor

	constructor(endpoints: WorkerEndpoint[]) {
		for (const e of endpoints) this.workers.set(e.id, e)
		this.health = new HealthMonitor(this.workers)
	}

	start(): void {
		this.health.start()
	}

	dispose(): void {
		this.health.stop()
		this.cache.clear()
	}

	/**
	 * Pick the best worker for a request based on capability classification
	 * and current health. Returns null if no suitable worker is up.
	 */
	pickWorker(req: ChatRequest): WorkerEndpoint | null {
		const cap = this.classifier.classify(req.messages)
		const candidates = [...this.workers.values()]
			.filter((w) => this.health.isUp(w.id) || this.health.getHealth(w.id) === "unknown")
			.filter((w) => w.capabilities.includes(cap))
			.sort((a, b) => b.priority - a.priority)
		if (candidates.length > 0) return candidates[0]
		// Fallback: any up worker, ignoring capability
		const fallback = [...this.workers.values()]
			.filter((w) => this.health.isUp(w.id))
			.sort((a, b) => b.priority - a.priority)
		return fallback[0] ?? null
	}

	async chat(req: ChatRequest): Promise<ChatResponse> {
		const worker = this.pickWorker(req)
		if (!worker) throw new Error("LocalRouter: no worker available")

		const cacheKey = ResponseCache.keyOf(req, worker.id)
		const cached = this.cache.get(cacheKey)
		if (cached) {
			Logger.info(`[LocalRouter] cache hit for ${worker.id}`)
			return cached
		}

		const url = worker.url.replace(/\/$/, "")
		const body = { ...req, model: worker.modelId, stream: false }
		const res = await fetch(`${url}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		})
		if (!res.ok) {
			const text = await res.text().catch(() => "")
			throw new Error(`[LocalRouter] worker ${worker.id} returned ${res.status}: ${text.slice(0, 200)}`)
		}
		const data = (await res.json()) as ChatResponse
		this.cache.set(cacheKey, data)
		return data
	}
}
