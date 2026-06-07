# Local Router — on-device LLM routing

Client-side mirror of the ailiance gateway: dispatches a chat request to one of
several local MLX/Ollama/llama.cpp workers, emulates tool-calling for models that
lack native support, and falls back across workers on timeout/health failure. No
embeddings, no Python — pure TS heuristics. Singleton via `getLocalRouter()`.

## Pieces

| File | Role |
|------|------|
| `LocalRouter.ts` | Orchestrator: pick worker → stream SSE → parse tool calls → fallback. Owns `LocalRouterTimeoutError` (`total` vs `idle`) |
| `PromptClassifier.ts` | Regex/keyword classify into `WorkerCapability` (`code`/`fr`/`reason`/`general`) — last user message only |
| `ModelRegistry.ts` | Maps model-id substrings → `ToolCallFormat` profile (ordered, first hit wins, unknown → `markdown_fence`) |
| `EmulationPrompts.ts` | Renders the tool-call instruction block per format |
| `HealthMonitor.ts` | Polls worker `/health`, marks up/down for routing |
| `ResponseCache.ts` | LRU + TTL (default 100 / 1h), key = sha256(req + workerId) |
| `RoutingObserver.ts` | Emits routing decisions (telemetry/observability) |
| `defaults.ts` / `instance.ts` | `DEFAULT_WORKERS` + singleton lifecycle |

## Tool-call emulation

Workers rarely speak native OpenAI/Anthropic tool calls. `ToolCallFormat` =
`openai_native | anthropic_native | markdown_fence | xml | json_inline | plain_function`.
Router injects the matching emulation prompt, then parses the raw stream back into
`{ type: "tool_call", id, name, argumentsRaw }` chunks. Tool names are validated
via `validateToolName` — invalid ones reported, not silently dropped.

## Abort & timeout

`combineAbortSignals` merges caller signals into one `AbortController` and returns a
`dispose()` that MUST be called (shared signals across many requests leak listeners
otherwise). Two timeout kinds: `total` (wall-clock) and `idle` (no chunk / heartbeat
silence) — callers choose fallback per kind.

## Anti-Patterns

- Do NOT add a new model without a `ModelRegistry` entry — it falls back to
  `markdown_fence` and tool calls may parse wrong for xml/json-native models.
- Do NOT skip `dispose()` from `combineAbortSignals` → listener leak.
- Do NOT cache streaming/tool-call responses naively; the cache key is per-worker —
  a fallback to another worker is a different key (intended).
- Do NOT make the classifier "smarter" with an LLM/embedding call — it is
  deliberately synchronous and zero-dependency (that's why it lives client-side).
- Do NOT confuse this with `core/api/providers/` (single remote provider) — this is
  multi-worker local dispatch; pairs with `services/local-stack` + `core/controller/stack/`.
- Do NOT instantiate `LocalRouter` directly in app code — use `getLocalRouter()`;
  tests reset via `__resetLocalRouterForTest()`.
