# Changelog

All notable changes to agent-kiki are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
