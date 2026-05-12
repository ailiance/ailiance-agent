## [0.6.1-beta] — 2026-05-12

### Changed
- Default gateway URL `http://electron-server:9300/v1` → `https://gateway.ailiance.fr/v1`. The Cloudflare Tunnel now exposes the FastAPI gateway publicly with auto-terminated TLS, so the CLI no longer requires Tailscale to reach the backend. On-tailnet users can override with `AILIANCE_GATEWAY=http://electron-server:9300/v1` for lower latency and no CF hop.

### Added
- Silent migration extended to promote v0.6.0 Tailscale-internal defaults to the new public endpoint on upgrade: `http://electron-server:9300[/v1]`, `http://electron-server.tail*.ts.net:9300[/v1]`, and `http://100.78.191.52:9300[/v1]` are all rewritten to `https://gateway.ailiance.fr/v1` without forcing a re-onboard.

### Tests
- 4 new cases in `cli/src/utils/__tests__/ailiance-default.test.ts` cover the v0.6.0 → public migration paths and confirm user-supplied URLs (`https://api.openai.com/v1`, `http://my-custom-proxy/v1`) stay untouched.

---

## [0.6.0-beta] — 2026-05-12

### Fixed
- Source file `cli/src/utils/eu-kiki-default.ts` renamed to `ailiance-default.ts` to match `init.ts` and test imports left by PR #7. The build was broken on a clean clone.
- Default gateway URL `http://studio:9300` → `http://electron-server:9300/v1`. Studio is not the gateway host (it runs MLX workers); the gateway is FastAPI on electron-server, and the OpenAI-compatible SDK requires the `/v1` suffix to avoid 404s.
- `cli/package.json` `unlink` script targeted the obsolete `dirac-cli` package; now correctly unlinks `ailiance-agent-cli`.

### Added
- `AILIANCE_GATEWAY` env var as the primary gateway override. `AGENT_KIKI_GATEWAY` retained as a deprecated alias so existing shell configs keep working; `AILIANCE_GATEWAY` takes precedence when both are set.
- Boot-time gateway prewarm (`cli/src/utils/ailiance-prewarm.ts`): GET `/v1/models` with a 5 s timeout, surfaced on success with `ailiance gateway ready: N models in Mms via URL`, on failure with a stderr line carrying an `AILIANCE_GATEWAY=...` override hint. Failure is non-fatal so the user can recover via config commands.
- Module-local cache for the prewarmed model list, available to command handlers via `getAilianceGatewayCache()`. Avoids a second `/v1/models` round-trip on the first prompt.
- Silent migration of stale persisted gateway URLs (`http://studio:9300*`, `http://electron-server:9300` without `/v1`, direct worker ports `:9301..9309` on studio) — `applyEuKikiDefault` now heals them transparently for already-onboarded users instead of skipping at the `auth-already-configured` gate.

### Tests
- 47 unit tests pass on `cli/src/utils/__tests__/{ailiance-default,ailiance-prewarm,parse-hallucinated-tool-xml}.test.ts` covering precedence, deprecation alias, `/v1` normalisation, HTTP and network failure paths, empty baseUrl, stale-default migration, log formatting, and the new XML tool-call parser.

### Infrastructure (deferred integration)
- New module `cli/src/utils/parse-hallucinated-tool-xml.ts` parses the `<function=NAME>...<parameter=KEY>VALUE</parameter>...</function>` shape that Mistral-Medium-128B (and other MLX workers without native function calling) emit when the gateway leaks a `tools[]` request onto a non-FC-capable backend. The parser handles `<function=...>`, `<invoke=...>`, attribute-style `<parameter name="...">`, multi-block streams, and preserves residual prose. Integration into `ResponseProcessor.ts` text-block path is deferred to v0.7 because synthesising `ToolUse` blocks mid-stream needs `StreamChunkCoordinator` state coordination — see TODO comment at `src/core/task/ResponseProcessor.ts:211`. The root cause is gateway-side (auto-router `ailiance` model must force-route to Qwen 32B vLLM when `tools[]` is present) and is tracked in the `ailiance/ailiance` gateway repo.

---

## [0.5.0-beta] — 2026-05-06

### Added
- Universal tool emulation in LocalRouter (5 formats: `<tool_call>`, ` ```tool `, ` ```json `, ` ```bash `, ` ```tool_code `, plain `read_file("...")`)
- Few-shot emulation prompt with concrete examples for write_to_file/execute_command/list_files
- Force-route logic in LocalRouter: tool-bearing requests prioritize `supportsTools:true` workers
- `aki timeline` CLI command — Ink view of task history grouped by day with emoji classification
- "TOOL CONSTRAINTS" section in system prompt forbidding hallucinated tool names
- Imperative verb detection in AutoModeSelector (fais/fait/écris/ajoute/réalise/génère/construis/implémente → ACT)

### Fixed
- Tool calls now propagate `function.id` so the toolUseIdMap maps call_id correctly across multi-turn conversations (was breaking tool_result → fell back to plain text → broke OpenAI tool protocol)
- Worker max_tokens default bumped 2048→8192 to avoid truncation mid-tool-call (server-side ailiance)
- Auto-mode soft-action verb cap raised 80→120 chars

### Server-side (ailiance gateway, not in this repo)
- Gateway forces Qwen 32B (vLLM native FC) for any request with `tools[]` — most reliable agentic worker
- Gemma `:9304` (llama.cpp pure) gets full tool emulation via gateway
- Anti-hallucination guard in `_INJECT_TEMPLATE`
- Qwen3-Next 80B-A3B (kxkm-ai) `--ctx-size` bumped 32k → 192k for long agentic sessions (~8 GB VRAM, 16 GB free margin)

### Workers status
| Worker | Tool calling |
|--------|--------------|
| Qwen 32B AWQ (vLLM, kxkm-ai) | native FC, primary route for agentic |
| Eurollm 22B (studio) | native FC via worker shim |
| Apertus 70B (studio) | via worker emulation |
| Devstral 24B (macm1) | Mistral [TOOL_CALLS] format |
| Gemma 3 4B (tower) | via gateway emulation |

---

## [0.4.0] — 2026-05-03

- Plugin marketplace: `aki plugin install <github-url>`
- MCP integration: discover and use MCP servers from installed plugins
- LocalRouter (in-process LLM router): cache, health monitoring, ctx-aware skip, SSE streaming
- Local stack (`aki stack {start,stop,status}`): managed LiteLLM proxy + Jina semantic router
- Auto plan/act mode (opt-in): `autoModeFromPrompt: true`
- Web UI at `http://127.0.0.1:25463` with worker status dashboard
- Task class reduced from 1970 → 592 lines (-70%)
- +170 tests (1047 → 1238), 0 regressions
