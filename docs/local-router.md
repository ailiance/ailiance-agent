# LocalRouter

In-process Node.js LLM router that bypasses HTTP proxies for direct
worker access. Provides:

- **Response cache** (LRU, 100 entries, 1h TTL)
- **Health monitoring** (ping every 30s, skip down workers)
- **Context-aware routing** (`ctxMax` skip for undersized workers)
- **Heuristic prompt classification** (code / fr / reason / general)
- **SSE streaming** (token-by-token output preserved)

## Activation

In your aki settings (e.g. `~/.dirac/data/globalState.json`):

```json
{
  "useLocalRouter": true
}
```

(default: `true` since 2026-05-06)

Wired into 3 providers: `litellm`, `openai`, `openrouter`. The handler
short-circuits the HTTP fetch and calls `LocalRouter.chatStream()`
directly when text-only messages are detected.

## Default workers

```ts
[
  { id: "tower-gemma",     url: "http://100.78.6.122:9304/v1",   modelId: "eu-kiki-gemma",  capabilities: ["general", "code"], priority: 10, ctxMax: 32768 },
  { id: "studio-apertus",  url: "http://100.116.92.12:9301/v1",  modelId: "apertus-70b",    capabilities: ["reason", "general"], priority: 7,  ctxMax: 8192  },
  { id: "studio-eurollm",  url: "http://100.116.92.12:9303/v1",  modelId: "eurollm-22b",    capabilities: ["fr"],                priority: 6,  ctxMax: 4096  },
]
```

Override via setting `localRouterWorkers: WorkerEndpoint[]`.

## Routing flow

1. **Classify**: regex/keywords on the last user message → category
2. **Filter**: workers matching the category (capabilities) AND with
   `ctxMax >= estimateTokens(req)` AND with health=`up`
3. **Pick**: highest priority candidate
4. **Fallback** 1: any up worker with sufficient ctx (no capability check)
5. **Fallback** 2: largest-ctx up worker (warning logged about likely
   "context exceeded" error)
6. **Cache lookup**: SHA-256 of (workerId, modelId, params, messages).
   Hit → return cached, skip fetch.
7. **Stream**: parse SSE chunks from worker, yield each delta.

## Routing display

When a request is routed, a `RoutingEvent` is emitted with:
- `category`: code/fr/reason/general
- `workerId`: chosen worker id
- `cacheHit`: true/false
- `estTokens`: estimated input+output tokens

The CLI Ink statusline subscribes via `routingObserver.subscribe()` and
shows `→ tower-gemma · code · ~3500 tok` (with `· cache` if cache hit).

## Why LocalRouter vs LiteLLM proxy

| Property | LocalRouter (in-process) | LiteLLM proxy (Python) |
|---|---|---|
| RAM overhead | ~10 MB | ~300 MB |
| Latency overhead | <5 ms | +50-150 ms |
| Cold start | 0 (embedded) | `aki proxy install/start` (~30s) |
| Failure modes | None (in-process) | Proxy crash → aki cascading failure |
| Provider list | hand-maintained, EU workers focus | 100+ from upstream |

LocalRouter = "fast path for trusted EU workers".
LiteLLM proxy = "broad provider coverage with full features (retry, fallback, cost tracking)".

## Tool emulation

When a request includes `tools[]`, LocalRouter can emulate function calling for
workers that do not natively support OpenAI tool_call format. Five response
formats are parsed:

| Format | Example |
|--------|---------|
| XML `<tool_call>` | `<tool_call>{"name":"read_file","arguments":{"path":"foo.ts"}}</tool_call>` |
| Fenced ` ```tool ` | ` ```tool\n{"name":"write_to_file",...}\n``` ` |
| Fenced ` ```json ` | ` ```json\n{"tool":"execute_command","args":{...}}\n``` ` |
| Fenced ` ```bash ` | ` ```bash\nexecute_command("npm test")\n``` ` |
| Gemma ` ```tool_code ` | ` ```tool_code\nread_file("src/index.ts")\n``` ` |
| Plain call | `read_file("src/index.ts")` |

The emulation layer normalizes all formats into the OpenAI `tool_calls` schema
before returning to the agent loop.

### Few-shot emulation prompt

Workers that require emulation receive a few-shot system prefix with three
concrete examples (`write_to_file`, `execute_command`, `list_files`) using the
`<tool_call>` format. The prompt is injected **only** when `tools[]` is present
in the request — zero overhead for non-agentic requests.

## Force-route

When `tools[]` is present in the request, LocalRouter bypasses the normal
capability/priority ranking and pre-filters workers by `supportsTools: true`.
Only if no such worker is healthy does it fall back to the standard routing
flow (with emulation as safety net).

Worker config example:

```ts
{ id: "kxkm-qwen32b", url: "http://...:8000/v1", modelId: "qwen32b-awq",
  capabilities: ["code", "reason", "general"],
  supportsTools: true,   // native vLLM function calling
  priority: 9, ctxMax: 196608 }
```

### Server-side force-route (eu-kiki gateway)

The eu-kiki gateway performs an additional server-side force-route: any request
with a non-empty `tools[]` array is redirected to Qwen 32B AWQ (vLLM, kxkm-ai)
regardless of the worker selected by LocalRouter. This ensures agentic tasks
always hit the most reliable native FC worker. This patch lives in the gateway
repo (`eu-kiki`), not in this repo.

> Qwen3-Next 80B-A3B (kxkm-ai, llama-server `:18888` → gateway `:8002`) is
> configured with a **192k context window** (`--ctx-size 196608`, ~8 GB VRAM,
> 16 GB free on RTX 4090 24 GB). Combined with `useAutoCondense: true` on the
> client, agentic sessions can run hundreds of file edits without hitting the
> context limit.

## See also

- [`docs/local-stack.md`](./local-stack.md) — full Python stack alternative
- [`src/services/local-router/`](../src/services/local-router/) — source
