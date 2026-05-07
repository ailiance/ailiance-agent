# Changelog

All notable changes to agent-kiki are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.6.0-beta] — 2026-05-07

Tools, file edits, async execution.

### Added
- **Diff `+`/`−` rendering** across CLI, webview, and host. Shared
  `DiffComputer` extracted to `src/shared/utils/diff/`. Proto
  `DiffStructure` / `DiffBlock` / `DiffLine`. CLI header
  `+X line(s), -Y line(s)` colored. Webview `DiffEditRow`
  consumes structured hunks with legacy fallback.
- **Async tools** for long-running operations (`execute_command`,
  `search_files`, `list_files` recursive). 500 ms fast-path race
  preserves v0.5 sync UX; slower work returns
  `{task_id, status:running}` placeholder. New `get_tool_result`
  tool with optional `wait` and `timeout_ms`. `PendingToolRegistry`
  tracks state; `AsyncToolNotifier` pushes a single say that
  transitions from running to completed/failed/cancelled.
- **read_file** pagination: `offset` / `limit` (0-based) alongside
  `start_line` / `end_line` (1-based), mutually exclusive.
  Configurable cap via `readFileMaxSize` setting (default 50 KB,
  hard cap 5 MB), actionable oversize error with line estimate.
- **write_to_file** hardening: `mkdir -p` parents (depth-guarded),
  atomic tmp+rename on the CLI/standalone path, configurable
  `writeToFileMaxSize` setting (default 1 MB, hard cap 50 MB).
- **edit_file** matching: `normalized` mode by default
  (trim + drop CR), strict mode kept for tests. Fuzzy fallback
  via Levenshtein with per-anchor approval at threshold 0.85.
  Stale-anchor detection compares the file hash against the last
  read; on drift the edit aborts with a re-read suggestion.
- **Model registry** (`src/services/local-router/ModelRegistry.ts`)
  maps each model id to a `ToolCallFormat` (openai_native,
  anthropic_native, markdown_fence, xml, json_inline,
  plain_function). Per-format emulation prompts. Parser is
  priority-aware: the expected format is tried first.
- **LocalRouter timeouts**: configurable
  `localRouterTimeoutMs` (default 60 s) and
  `localRouterIdleTimeoutMs` (default 20 s) with
  `LocalRouterTimeoutError`. AbortController on fetch, cleanup
  in finally. Settings propagated through openai, openrouter, and
  litellm providers via shared `readLocalRouterTimeouts()` util.
- **Runtime tool name validation**
  (`validateToolName`): rejects empty names, names containing
  `:` or `.`, and names absent from the whitelist. Telemetry
  event `task.invalid_tool_name`. Dual filter at the LocalRouter
  parser and the ToolExecutor dispatcher; mistake counter
  incremented on dispatch.
- `ASYNCHRONOUS TOOLS` block in the system prompt template
  explaining the placeholder contract and `get_tool_result`.

### Changed
- `DEFAULT_WORKERS` extended to cover the cluster: macm1-devstral
  (`100.112.121.126:9302`, xml emulation), kxkm-qwen3-next
  (`100.78.191.52:8002` autossh tunnel, xml, 192k context),
  studio-mistral-medium (`100.116.92.12:9301`, native function
  calling, 262k context). Apertus dropped from defaults but
  reachable via the gateway or a custom `localRouterWorkers`
  override.
- Tool kind mapping fixed: `fileDeleted` → `delete`,
  `searchFiles` → `search` (were `other` and `read`).
- Subtle behavior change: a worker advertising `supportsTools:true`
  with a `modelId` unknown to the registry now goes through
  emulation by default. Configure the worker `modelId` or extend
  `ModelRegistry` to opt back into native tool calls.

### Fixed
- 46 stale CLI test expectations brought in line with current
  behavior (`Tool Call`, `Use tool?`, view routing). Production
  code unchanged.

## [0.3.1] — 2026-05-06

### Changed
- Default eu-kiki gateway now exposes 5 production workers — added
  `eu-kiki/gemma3-4b` (tower / NVIDIA Quadro P2000) and restored
  `eu-kiki/qwen3-next-80b-a3b-instruct` (kxkm-ai / RTX 4090, MoE
  expert offload via llama.cpp, reached over an `autossh` tunnel
  from electron-server:8002).
- Auto-router metadata refreshed to reflect router-v6: 32 domains
  (down from 34), top-1 87.7 % / top-3 98 % on the AI-Act-traceable
  clean corpus.

### Fixed
- Provider README + cockpit /about page clarify backend portability:
  the eu-kiki HTTP contract is not tied to Apple Silicon (also runs
  on CUDA, ROCm, x86 CPU, ARM CPU).

## [0.3.0] — 2026-05-06

### Added
- CLI: 2-row statusline in chat footer (cwd + branch + model + ctx %
  + time) inspired by Claude Code.
- Local stack auto-detect routing (Jina router :5050 → LiteLLM :4000
  → fallback) gated by `useLocalStack` setting.
- Plugin hooks runtime wiring (PreToolUse / PostToolUse).
- MCP server + tool filtering settings: `enabledMcpServers`,
  `mcpToolDenylist`, `mcpToolAllowlist`.
- Provider: aihubmix.
- `docs/CLAUDE.md` navigation guide (and nested CLAUDE.md across
  `cli/`, `webview-ui/`, `src/core/{api,storage,task,tracing}/`).

### Changed
- `ChatFooter` enhanced with statusline rows above the existing
  instructions / model / repo rows.
- biome reformatting on stack PR2 files.

### Removed
- Dead code: `cli/src/components/StatusBar.tsx` (never imported,
  replaced by ChatFooter statusline).

## [0.2.0] — 2026-05-05

- End-to-end agent task convergence over the eu-kiki gateway with
  Mistral-style tool-call wrapping (Devstral 24B). See
  `docs/mvp-acceptance-2026-05-05-v0.2.md`.
- Atomic `meta.json` write in tracer.
- Tracer `agent_version` sourced from `package.json`.

## [0.1.0] — 2026-05-05

- Initial fork from Dirac/Cline.
- EU AI Act-compliant JSONL tracing under `<cwd>/.agent-kiki/runs/`.
- All upstream telemetry disabled.
- Default provider: eu-kiki gateway at `http://studio:9300/v1`.
