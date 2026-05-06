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
- Worker max_tokens default bumped 2048→8192 to avoid truncation mid-tool-call (server-side eu-kiki)
- Auto-mode soft-action verb cap raised 80→120 chars

### Server-side (eu-kiki gateway, not in this repo)
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
