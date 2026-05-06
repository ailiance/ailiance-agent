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
	 *
	 * When req.tools is non-empty, workers with supportsTools:true are
	 * preferred. If no tool-capable worker is available, the router falls
	 * back to emulated workers with a warning.
	 */
	pickWorker(req: ChatRequest): WorkerEndpoint | null {
		const cap = this.classifier.classify(req.messages)
		const estTokens = estimateTokens(req)

		let candidates = [...this.workers.values()]
			.filter((w) => this.health.isUp(w.id) || this.health.getHealth(w.id) === "unknown")
			.filter((w) => w.capabilities.includes(cap))
			.filter((w) => w.ctxMax >= estTokens)
			.sort((a, b) => b.priority - a.priority)

		// When tools are requested, prefer native tool-capable workers.
		if (req.tools && req.tools.length > 0 && candidates.length > 0) {
			const native = candidates.filter((w) => w.supportsTools)
			if (native.length > 0) {
				candidates = native
			} else {
				Logger.warn("[LocalRouter] No tool-capable worker available; falling back to emulation")
			}
		}

		if (candidates.length > 0) return candidates[0]

		// Fallback: any up worker with sufficient ctx, ignoring capability
		let fallback = [...this.workers.values()]
			.filter((w) => this.health.isUp(w.id))
			.filter((w) => w.ctxMax >= estTokens)
			.sort((a, b) => b.priority - a.priority)

		if (req.tools && req.tools.length > 0 && fallback.length > 0) {
			const native = fallback.filter((w) => w.supportsTools)
			if (native.length > 0) {
				fallback = native
			} else {
				Logger.warn("[LocalRouter] No tool-capable worker available in fallback; falling back to emulation")
			}
		}

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
	 * Try to extract a tool call from the accumulated text buffer.
	 * Accepts three formats in priority order:
	 *   1. <tool_call>{...}</tool_call>
	 *   2. ```json\n{...}\n```  (JSON fence with a "name" field)
	 *   3. ```bash|sh|shell\n<cmd>\n```  → execute_command (only when listed in tools)
	 */
	private static tryExtract(
		buf: string,
		tools: ChatTool[],
	): { match: RegExpMatchArray; toolCall: { name: string; arguments: object } } | null {
		const xmlRegex = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/
		const jsonFenceRegex = /```json\s*(\{[\s\S]*?\})\s*```/
		const bashFenceRegex = /```(?:bash|sh|shell)\s*([\s\S]*?)```/

		const x = buf.match(xmlRegex)
		if (x) {
			try {
				const parsed = JSON.parse(x[1]) as { name?: string; arguments?: unknown; args?: unknown }
				if (parsed.name) {
					return { match: x, toolCall: { name: parsed.name, arguments: (parsed.arguments ?? parsed.args ?? {}) as object } }
				}
			} catch {
				// malformed JSON — fall through
			}
		}

		const j = buf.match(jsonFenceRegex)
		if (j) {
			try {
				const parsed = JSON.parse(j[1]) as { name?: string; arguments?: unknown; args?: unknown }
				if (parsed.name) {
					return { match: j, toolCall: { name: parsed.name, arguments: (parsed.arguments ?? parsed.args ?? {}) as object } }
				}
			} catch {
				// malformed JSON — fall through
			}
		}

		const b = buf.match(bashFenceRegex)
		if (b && tools.some((t) => t.function.name === "execute_command")) {
			const command = b[1].trim()
			if (command) {
				return {
					match: b,
					toolCall: { name: "execute_command", arguments: { command, requires_approval: false } },
				}
			}
		}

		return null
	}

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
				const emulationPreamble = `\n\n${toolDescriptions}\n\nYou have access to tools. To call one, output a code block in this exact format:\n\n\`\`\`json\n{"name": "tool_name", "arguments": {"key": "value"}}\n\`\`\`\n\nDo NOT use bash code blocks for shell commands - always use the JSON format above with name="execute_command" and arguments.command="<your command>".\n\nWait for the tool result before continuing. Do not call the same tool twice in a row.\n`
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
						if (textBuffer && !needsEmulation) {
							yield { type: "text", text: textBuffer }
						} else if (textBuffer && needsEmulation) {
							// Emulation: try one last parse, then flush remaining as text
							const extracted = LocalRouter.tryExtract(textBuffer, req.tools ?? [])
							if (extracted) {
								const { match, toolCall } = extracted
								const before = textBuffer.slice(0, match.index!)
								if (before.trim()) yield { type: "text", text: before }
								yield {
									type: "tool_call",
									id: `call_${Date.now()}_done`,
									name: toolCall.name,
									argumentsRaw: JSON.stringify(toolCall.arguments),
								}
							} else if (textBuffer.trim()) {
								yield { type: "text", text: textBuffer }
							}
						}
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
								// Extract complete tool call blocks (XML, json fence, bash fence)
								for (;;) {
									const extracted = LocalRouter.tryExtract(textBuffer, req.tools ?? [])
									if (!extracted) break
									const { match, toolCall } = extracted
									const before = textBuffer.slice(0, match.index!)
									if (before.trim()) yield { type: "text", text: before }
									yield {
										type: "tool_call",
										id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
										name: toolCall.name,
										argumentsRaw: JSON.stringify(toolCall.arguments),
									}
									textBuffer = textBuffer.slice(match.index! + match[0].length)
								}
								// Yield text before any partial marker; hold the rest.
								// "```" alone is a prefix of all fence markers — hold it too.
								const partialMarkers = ["<tool_call", "```json", "```bash", "```sh", "```shell", "```"]
								let earliestPartial = -1
								for (const marker of partialMarkers) {
									const i = textBuffer.indexOf(marker)
									if (i !== -1 && (earliestPartial === -1 || i < earliestPartial)) earliestPartial = i
								}
								if (earliestPartial > 0) {
									yield { type: "text", text: textBuffer.slice(0, earliestPartial) }
									textBuffer = textBuffer.slice(earliestPartial)
								} else if (earliestPartial === -1) {
									// No partial marker — flush all accumulated text
									if (textBuffer) {
										yield { type: "text", text: textBuffer }
										textBuffer = ""
									}
								}
								// else earliestPartial === 0 — wait for more data
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
				const extracted = LocalRouter.tryExtract(textBuffer, req.tools ?? [])
				if (extracted) {
					const { match, toolCall } = extracted
					const before = textBuffer.slice(0, match.index!)
					if (before.trim()) yield { type: "text", text: before }
					yield {
						type: "tool_call",
						id: `call_${Date.now()}_final`,
						name: toolCall.name,
						argumentsRaw: JSON.stringify(toolCall.arguments),
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
