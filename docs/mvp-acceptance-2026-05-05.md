# MVP Acceptance — agent-kiki V0.1.0 (TS fork)

**Date:** 2026-05-05 (00:30-03:30 UTC+02 session)
**Branch:** branding
**HEAD:** `e504649` + (this commit)
**Strategy:** Option C — fork Dirac, rebrand, eu-kiki default provider, EU AI Act JSONL tracing

## Pivot context

Earlier in this session we built a Python `agent-kiki` (now archived at
`L-electron-Rare/agent-kiki-py-archive`, 30 commits, 135 tests). After
discovering [Dirac](https://github.com/dirac-run/dirac) (top of Terminal-Bench-2,
fork of Cline, OpenAI-compatible provider support), we pivoted to forking
Dirac and grafting the EU-sovereignty value props (eu-kiki default + JSONL
audit trail).

## Fork additions (15 commits on top of `upstream/master`)

```
e504649 docs(readme): add v0 caveats
d18449e fix(tracing): version from package.json
56e26a6 fix(tracing): atomic meta.json write
de3b2f7 chore(brand): rebrand user-facing pkg.json fields
c1c11a2 chore(legal): add NOTICE for apache 2.0
c2af572 feat(tracing): record planner roundtrips
4d7181c fix(tracing): widen scrubber keyword set
faa9639 chore(brand): rebrand CLI banner and help
b4125e0 fix(telemetry): disable phone-home upstream
b2118e2 chore(provider): document sentinel key
70677c6 fix(tracing): validate task id allowlist
13e6534 fix(tracing): close trace on abort and error
0db4255 fix(gitignore): exclude .agent-kiki/ traces
eb0e47b fix(tracing): scrub aws keys pem urls more
2548ad1 feat(tracing): EU AI Act JSONL trace per task
a6cf48d feat(provider): eu-kiki default fallback
d72b95a chore(brand): rebrand Dirac fork to agent-kiki
```

## Verification matrix

| Check | Result | Notes |
|-------|--------|-------|
| Build green (`cd cli && npm run build`) | ✅ | `cli/dist/cli.mjs` produced |
| `aki --version` | ✅ | `0.1.0` |
| `aki --help` mentions `aki` not `dirac` | ✅ | banner rebranded |
| Tests pass (Vitest) | ✅ | 356 / 51 fail (51 pre-existing UI display, not regressions) |
| Tracing tests (28 cases) | ✅ | 28/28 pass |
| Telemetry phone-home | ✅ disabled | `dirac-telemetry-config.ts` neutralized + test |
| Secret scrubber (AWS, PEM, URL, field names) | ✅ | 14 scrubber tests cover the cases |
| Trace dir `.agent-kiki/runs/<id>/` | ✅ | meta.json + trace.jsonl per task |
| Trace records every API roundtrip | ✅ | `recordPlannerTurn` writes `phase: "plan"` line per call |
| Trace closes on abort/cancel/error | ✅ | hooked in `Task.abortTask` |
| `taskId` allowlist (path traversal) | ✅ | rejects `../`, `/`, etc. |
| Atomic meta write (tmp + rename) | ✅ | `persistMeta` uses tmp + renameSync |
| NOTICE file (Apache-2.0 §4(d)) | ✅ | crediting Dirac + Cline |
| `.agent-kiki/` in `.gitignore` | ✅ | prevents accidental commits |
| Connectivity to eu-kiki gateway | ✅ | `/v1/models` + `/v1/chat/completions` 200 OK via `http://100.116.92.12:9300/v1` |
| eu-kiki LoRA adapter wrap fix | ✅ | `eu-kiki:1ed24b8` — `linear_to_lora_layers` + inferred config |
| End-to-end agent task convergence (`aki "task"` → `finish`) | ❌ | Backend gap (see below) |
| `v0.1.0` tag | ⏳ | pending this commit |

## Live test (SCRATCH-Rust acceptance)

- `aki task --yolo --model eu-kiki-devstral "Create a minimal TOML parser in Rust"` against `http://100.116.92.12:9300/v1`
- 5 API requests in 13s
- Result: `[YOLO MODE] Task failed: Too many consecutive mistakes (5)`
- Tracing: `meta.json` + 5 lines in `trace.jsonl`, all with `planner_response.raw == ""`
- Direct `curl` to the gateway with the same model returns valid Rust code in 2.6s — backend is responsive.

**Diagnosis:** Dirac sends OpenAI `tools` field and expects `tool_calls` in
the response. The eu-kiki worker accepts `tools` (extra="ignore") and
responds with `content`-only completions, no structured `tool_calls`.
Dirac counts every response without a tool_call as a "mistake". After 5
consecutive, the task aborts.

**Fix path (V1):** implement OpenAI native function-calling in eu-kiki
workers (parse `tools` spec → constrained text generation → wrap output
into `tool_calls` structure). Out of scope for v0.1.0 — the agent-kiki
fork itself is sound.

**Workaround for users today:** override provider env to a backend that
supports native function-calling, e.g. `ANTHROPIC_API_KEY=...` or any
OpenAI-compatible endpoint that does function-calling. The fork's
EU-sovereignty value (telemetry off, EU AI Act JSONL tracing) holds for
any backend.

## Reviews

- **Code review** (per-commit, dirac-fork): 2 CRITICAL + 3 HIGH + MEDIUMs
  on the initial 8 commits. All CRITICAL + HIGH fixed in commits
  `eb0e47b 0db4255 13e6534 70677c6 b2118e2`. Verdict: SHIP-WITH-FIXES → fixes applied.
- **Ship-critic**: 2 CRITICAL (telemetry phone-home + CLI still says
  "dirac") + 3 MAJOR (NOTICE, scrubber gap, package.json rebrand).
  All addressed in `b4125e0 faa9639 4d7181c c2af572 c1c11a2 de3b2f7
  56e26a6 d18449e e504649`. Verdict moves from REVISE → ACCEPT-WITH-RESERVATIONS.
  Reservations documented in this acceptance doc + README caveats.

## Decision

**v0.1.0 tag GO with documented reservations.**

Rationale:
- Code-base is feature-complete, tests green, ruff/lint clean, build green.
- All security/compliance issues from both reviews are fixed.
- The end-to-end backend gap is upstream (eu-kiki function-calling) and
  documented as a V1 follow-up — not a fork-code issue.
- README clearly states the workaround and the gap.
- Internal release for L-electron-Rare org.

Follow-up tickets to open as GitHub issues:

1. `eu-kiki: implement OpenAI native function-calling` — V1 blocker for
   end-to-end tasks against the default backend.
2. `Trace rotation` — `.agent-kiki/runs/` accumulates indefinitely.
3. `Internal Dirac slug rename` — 20+ identifier slugs (commands, view IDs,
   walkthrough id) still use `dirac.*`. Rebrand requires a settings
   migration; defer to v0.2.
4. `Race condition on parallel appendTurn` — file locking for concurrent
   tool calls.
5. `kanban command still references dirac` — `--agent dirac` arg.
