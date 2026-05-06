import { Logger } from "@shared/services/Logger"
import { estimateTokens } from "./estimateTokens"
import { HealthMonitor } from "./HealthMonitor"
import { PromptClassifier } from "./PromptClassifier"
import { ResponseCache } from "./ResponseCache"
import { routingObserver } from "./RoutingObserver"
import type { ChatRequest, ChatResponse, ChatTool, WorkerEndpoint } from "./types"

export type ChatStreamChunk =
	| { type: "text"; text: string }
	| { type: "tool_call"; id: string; name: string; argumentsRaw: string }

function formatToolsAsPromptText(tools: ChatTool[]): string {
	let out = "## Available tools\n\n"
	for (const t of tools) {
		out += `### \`${t.function.name}\`\n${t.function.description ?? ""}\n\nParameters:\n\`\`\`json\n${JSON.stringify(t.function.parameters, null, 2)}\n\`\`\`\n\n`
	}
	return out.trim()
}

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
		const estTokens = estimateTokens(req)

		const candidates = [...this.workers.values()]
			.filter((w) => this.health.isUp(w.id) || this.health.getHealth(w.id) === "unknown")
			.filter((w) => w.capabilities.includes(cap))
			.filter((w) => w.ctxMax >= estTokens)
			.sort((a, b) => b.priority - a.priority)
		if (candidates.length > 0) return candidates[0]

		// Fallback: any up worker with sufficient ctx, ignoring capability
		const fallback = [...this.workers.values()]
			.filter((w) => this.health.isUp(w.id))
			.filter((w) => w.ctxMax >= estTokens)
			.sort((a, b) => b.priority - a.priority)
		if (fallback[0]) return fallback[0]

		// Last-resort: largest-ctx up worker even if undersized — let the
		// worker fail explicitly rather than throwing "no worker" silently.
		const lastResort = [...this.workers.values()].filter((w) => this.health.isUp(w.id)).sort((a, b) => b.ctxMax - a.ctxMax)
		if (lastResort[0]) {
			Logger.warn(
				`[LocalRouter] Request ~${estTokens} tokens, largest worker ${lastResort[0].id} has ctxMax=${lastResort[0].ctxMax}. Expect "context exceeded".`,
			)
		}
		return lastResort[0] ?? null
	}

	async chat(req: ChatRequest): Promise<ChatResponse> {
		const worker = this.pickWorker(req)
		if (!worker) throw new Error("LocalRouter: no worker available")

		const category = this.classifier.classify(req.messages)
		const estTokens = estimateTokens(req)

		const cacheKey = ResponseCache.keyOf(req, worker.id)
		const cached = this.cache.get(cacheKey)
		if (cached) {
			Logger.info(`[LocalRouter] cache hit for ${worker.id}`)
			routingObserver.emit({ ts: Date.now(), category, workerId: worker.id, cacheHit: true, estTokens })
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
		routingObserver.emit({ ts: Date.now(), category, workerId: worker.id, cacheHit: false, estTokens })
		return data
	}

	/**
	 * Streaming version of chat(). Yields incremental text chunks as they
	 * arrive from the worker via SSE. Cache is bypassed (streaming responses
	 * aren't cacheable). Routing event is emitted before the first chunk.
	 *
	 * When tools are requested and the worker does not support native function
	 * calling (supportsTools === false), the tools are injected into the system
	 * prompt and the response text is parsed for <tool_call>...</tool_call>
	 * patterns, which are yielded as tool_call chunks.
	 *
	 * @throws Error if no suitable worker is available
	 */
	async *chatStream(req: ChatRequest): AsyncGenerator<ChatStreamChunk> {
		const worker = this.pickWorker(req)
		if (!worker) throw new Error("LocalRouter: no worker available")

		const cap = this.classifier.classify(req.messages)
		const estTokens = estimateTokens(req)

		routingObserver.emit({
			ts: Date.now(),
			category: cap,
			workerId: worker.id,
			cacheHit: false,
			estTokens,
		})

		// biome-ignore lint/suspicious/noExplicitAny: dynamic body assembly
		const body: any = { ...req, model: worker.modelId, stream: true }
		let needsEmulation = false

		if (req.tools && req.tools.length > 0) {
			if (worker.supportsTools) {
				// Pass tools natively to the worker
				body.tools = req.tools
				body.tool_choice = "auto"
			} else {
				// Emulate via system prompt injection
				needsEmulation = true
				const toolDescriptions = formatToolsAsPromptText(req.tools)
				const emulationPreamble = `\n\n${toolDescriptions}\n\nTo call a tool, output EXACTLY:\n<tool_call>\n{"name": "tool_name", "arguments": {...}}\n</tool_call>\n\nDo not output the same tool call twice. Wait for the tool result before continuing.\n`
				const sysIdx = body.messages.findIndex((m: { role: string }) => m.role === "system")
				if (sysIdx >= 0) {
					body.messages[sysIdx] = {
						...body.messages[sysIdx],
						content: body.messages[sysIdx].content + emulationPreamble,
					}
				} else {
					body.messages.unshift({ role: "system", content: emulationPreamble })
				}
				delete body.tools
			}
		}

		const url = worker.url.replace(/\/$/, "")
		const res = await fetch(`${url}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			},
			body: JSON.stringify(body),
		})
		if (!res.ok) {
			const errText = await res.text().catch(() => "")
			throw new Error(`[LocalRouter] worker ${worker.id} returned ${res.status}: ${errText.slice(0, 200)}`)
		}
		if (!res.body) {
			throw new Error("[LocalRouter] worker did not return a body for streaming")
		}

		// Parse SSE: "data: {...}\n\n" lines
		const reader = (res.body as ReadableStream<Uint8Array>).getReader()
		const decoder = new TextDecoder("utf-8")
		let lineBuffer = ""
		// For emulation: accumulate text to detect <tool_call>...</tool_call>
		let textBuffer = ""

		try {
			while (true) {
				const { value, done } = await reader.read()
				if (done) break
				lineBuffer += decoder.decode(value, { stream: true })
				let nl: number
				// biome-ignore lint/suspicious/noAssignInExpressions: SSE parser idiom
				while ((nl = lineBuffer.indexOf("\n")) !== -1) {
					const line = lineBuffer.slice(0, nl).trim()
					lineBuffer = lineBuffer.slice(nl + 1)
					if (!line.startsWith("data:")) continue
					const data = line.slice(5).trim()
					if (data === "[DONE]") {
						// Flush any pending text on DONE
						if (textBuffer && !needsEmulation) yield { type: "text", text: textBuffer }
						return
					}
					try {
						const chunk = JSON.parse(data) as {
							choices?: Array<{ delta?: { content?: string; tool_calls?: any[] } }>
						}
						const delta = chunk.choices?.[0]?.delta
						if (!delta) continue

						// Native tool_calls from a supportsTools worker (eurollm streaming)
						if (delta.tool_calls) {
							for (const tc of delta.tool_calls) {
								yield {
									type: "tool_call",
									id: tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
									name: tc.function?.name ?? "",
									argumentsRaw: tc.function?.arguments ?? "{}",
								}
							}
						}

						if (delta.content) {
							if (needsEmulation) {
								textBuffer += delta.content
								// Extract complete <tool_call>...</tool_call> blocks
								for (;;) {
									const m = textBuffer.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/)
									if (!m) break
									const before = textBuffer.slice(0, m.index!)
									if (before.trim()) yield { type: "text", text: before }
									try {
										const parsed = JSON.parse(m[1]) as {
											name?: string
											arguments?: unknown
											args?: unknown
										}
										yield {
											type: "tool_call",
											id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
											name: parsed.name ?? "",
											argumentsRaw: JSON.stringify(parsed.arguments ?? parsed.args ?? {}),
										}
									} catch {
										// malformed JSON inside tool_call — skip
									}
									textBuffer = textBuffer.slice(m.index! + m[0].length)
								}
								// Yield any text before a partial <tool_call> tag
								const partialIdx = textBuffer.indexOf("<tool_call")
								if (partialIdx > 0) {
									yield { type: "text", text: textBuffer.slice(0, partialIdx) }
									textBuffer = textBuffer.slice(partialIdx)
								} else if (partialIdx === -1) {
									// No partial — flush all accumulated text
									if (textBuffer) {
										yield { type: "text", text: textBuffer }
										textBuffer = ""
									}
								}
								// else partialIdx === 0 — wait for more data
							} else {
								yield { type: "text", text: delta.content }
							}
						}
					} catch {
						// ignore malformed SSE chunks
					}
				}
			}
			// Final flush of any remaining buffered text
			if (textBuffer) {
				const m = textBuffer.match(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/)
				if (m) {
					const before = textBuffer.slice(0, m.index!)
					if (before.trim()) yield { type: "text", text: before }
					try {
						const parsed = JSON.parse(m[1]) as { name?: string; arguments?: unknown; args?: unknown }
						yield {
							type: "tool_call",
							id: `call_${Date.now()}_final`,
							name: parsed.name ?? "",
							argumentsRaw: JSON.stringify(parsed.arguments ?? parsed.args ?? {}),
						}
					} catch {
						// malformed — ignore
					}
				} else if (!needsEmulation) {
					yield { type: "text", text: textBuffer }
				} else if (textBuffer.trim()) {
					// Emulation mode but no tool_call pattern — yield as plain text
					yield { type: "text", text: textBuffer }
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				// ignore
			}
		}
	}
}
