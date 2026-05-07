# Roadmap v0.6 — Tools, file edits, async execution

**Branch:** `v0.6` (forked from `master` @ d1e33ba)
**Goal:** Make file editing visible (+/− diff), tool execution non-blocking, and tool-calling universal across local & cloud models.

## Context

v0.5.0-beta shipped universal tool calling (5 emulation formats) and anti-hallucination prompts.
v0.6 doubles down on the **file edit experience** and **long-running tool ergonomics** while hardening reliability across all model targets (eu-kiki workers, Ollama, LM Studio, Anthropic, OpenAI).

## Audit findings (2026-05-07)

### File handlers (`src/core/task/tools/handlers/`)
- `EditFileToolHandler` uses **anchor-based matching** (`Name:` hashes via ULID + line number), exact byte-for-byte → fragile to whitespace/CRLF/indent drift.
- Anchor staleness: model reuses stale read → silent "anchor not found".
- `ReadFile` hardcoded **50 KB cap** without range; `WriteToFile` has none, no parent-dir creation.
- `handlePartialBlock()` already streams to UI (diff view, status). Foundation is there.

### Tool-calling (`src/services/local-router/`, providers)
- 5 formats supported, but selection is a binary `supportsTools` flag per worker — no per-model registry.
- **No SSE timeout** → silent worker = indefinite block.
- Anti-hallucination: prompt-level only, no runtime validation of tool-name shape (`:`, `.`).
- Test coverage thin on malformed JSON, stream interruption, partial args.

## Sprints

### Sprint 1 — Diff `+`/`−` rendering (UX foundation)
- **E1.1** Generate unified diff on every `edit_file` / `write_to_file` / `replace_symbol` (use `diff` lib, line-level).
- **E1.2** CLI Ink renderer: full-line coloring (red `−`, green `+`), header `Added X, removed Y`, line numbers.
- **E1.3** Webview React `DiffBlock` component — reuses VS Code diffViewProvider where available.
- **E1.4** Protobuf contract `ToolEditResult { added: int32, removed: int32, hunks: DiffHunk[] }` for host↔CLI↔webview transport.

### Sprint 2 — Async tools for long operations
- **E2.1** Task-ID protocol: `execute_command`, `search_files`, build/test commands return `{task_id, status: "running"}` immediately.
- **E2.2** Background runtime (worker thread or detached Promise pool) with status polling + completion event.
- **E2.3** State machine `pending → running → completed | cancelled | failed` exposed to UI.
- **E2.4** AbortController wiring: user cancellation propagates to running task.
- **E2.5** Tests in `HookFactory.plugin.test.ts` extended for async paths.

### Sprint 3 — Edit reliability
- **E3.1** Whitespace/CRLF normalization in pre-match (`strict | normalized` mode flag).
- **E3.2** Fuzzy fallback (Levenshtein / token-based) with user confirmation when exact match fails.
- **E3.3** `WriteToFile`: `mkdir -p` parents, configurable size limit, atomic write (tmp + rename).
- **E3.4** Pagination on `read_file`: `offset`/`limit` semantics, configurable cap (default 50 KB).
- **E3.5** Anchor refresh: invalidate stale anchors when file mtime/hash changes between read and edit.

### Sprint 4 — Tool-calling universality
- **E4.1** Model registry `model_id → {format, supportsTools, constraints}` covering Gemma, Devstral, EuroLLM, Qwen, Mistral Medium, Apertus, Ollama defaults, LM Studio defaults.
- **E4.2** SSE timeout (configurable, default 60s) + heartbeat detection + AbortController on stream.
- **E4.3** Runtime validation: reject tool names containing `:` or `.`, reject names absent from whitelist (with telemetry).
- **E4.4** Edge-case tests: malformed JSON, truncated stream, partial arguments accumulation, format auto-detect on first response.

## Out of scope (v0.7+)
- New tools (`multi_edit`, `apply_patch`, `semantic_search`) — deferred unless a sprint blocks on them.
- Streaming hunks one-by-one as they're generated.
- Smart truncation (head/tail/grep-around) for huge files.

## Acceptance per sprint
Each sprint lands behind a flag, with:
- Updated tests (unit + at least one e2e or fixture-based scenario)
- Doc note in this file ("Status:" line) when complete
- Manual eval against Gemma 3 4B (tower) + one cloud model (Anthropic Sonnet)

## Tracking
- Sprint 1 status: not started
- Sprint 2 status: not started
- Sprint 3 status: not started
- Sprint 4 status: not started
