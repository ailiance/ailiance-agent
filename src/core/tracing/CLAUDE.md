# tracing

EU AI Act-compliant per-task JSONL traces. Mirrors the Python schema from
`agent-kiki-py-archive` at `schema_version = "1.0.0"`.

Note : pas de `cli/src/core/tracing/` — la CLI Ink ne duplique rien, elle
consomme `JsonlTracer` via `src/core/tracing` (les tests vivent côté `cli/tests/`).

## Files

| File | Rôle |
|------|------|
| `JsonlTracer.ts` | classe principale + `scrubSecrets` + constantes |
| `pruner.ts` | rotation : age (30j) OU taille (1 GiB), policy permissive |
| `index.ts` | barrel export |

## Output layout

`<taskCwd>/.agent-kiki/runs/<taskId>/`
- `meta.json` — `RunMeta` réécrit atomiquement (write tmp + rename) à chaque update
- `trace.jsonl` — append-only, une `TraceLine` par turn

NB : pas `.aki/traces/` — c'est `.agent-kiki/runs/<taskId>/` (constante `TRACING_DIR_NAME`).
`taskId` est strictement validé `^[a-zA-Z0-9_-]+$` (throw sinon — anti path-escape).

## Schema (snake_case sur disque)

`TraceLine` : `schema_version, run_id, turn, timestamp (ISO), phase, context_window?, planner_request?, planner_response?, tool_execution?, errors[]`.

`phase` ∈ `"plan" | "execute" | "summarize" | "abort"`.

`ToolExecutionRecord` : `tool_name, tool_args?, tool_result?, latency_ms, success`.

`RunMeta` : run_id, started_at/ended_at, exit_code/exit_reason, task, cwd, mode,
hint_domain, approval_mode, agent_kiki_version, gateway_url, workers{}, stats{}, limits_hit[].

## When emitted

Émis depuis `src/core/task/ToolExecutor.ts` (PAS depuis `Task` directement) :
- `new JsonlTracer(taskId, cwd)` à l'init (L143)
- `writeMeta({...})` lazy au 1er turn (L163)
- `appendTurn({...})` par tool execute (L193)
- `recordPlannerTurn(raw, latencyMs, errors)` par roundtrip LLM (L215) — capture aussi les échecs de parse
- `close(exitReason, exitCode)` à la fin (L224)

## Redaction

`scrubSecrets()` récursif sur `planner_request`, `planner_response`, `tool_args`, `tool_result`.
- clés sensibles (regex sur `password|token|api_key|secret|bearer|authorization|...`) → `[REDACTED]`
- valeurs : PEM blocks, `sk-…`, `ghp_…`, `xox?-…`, JWT, `AKIA…`, URLs `scheme://user:pass@`, `Authorization: Bearer`, generic `key=value`/`key: value`
- cycles → `[CIRCULAR]`

## Gotchas

- Tracing **ne doit jamais casser une task** : toutes les erreurs IO sont swallowed
- `appendTurn` est sync (`fs.appendFileSync`) mais le turn counter est sérialisé via `writeChain` pour les parallel tool calls — utiliser `flush()` dans les tests
- `meta.json` write est atomique (tmp + rename), `trace.jsonl` est append-only
- Pruner appelé en best-effort à `new JsonlTracer()` (async, non bloquant)

## Tests

`cli/tests/tracing/` : `JsonlTracer.test.ts`, `race.test.ts` (parallel writes), `pruner.test.ts`.
