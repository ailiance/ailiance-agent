# Eval — `aki` (eu-kiki + Qwen 32B AWQ) vs Claude Code (Opus 4.7)

**Date:** 2026-05-05
**aki version:** v0.3.0 (`70b4e91 + branding HEAD`)
**Claude Code version:** Opus 4.7 sub-agent (general-purpose), invoked from this session
**eu-kiki backend:** kxkm-ai Qwen 32B AWQ via SSH tunnel `:8002`, gateway `100.78.191.52:9300`
**Methodology:** identical task to both, fresh tmp dir, measure wall + tool calls + tokens + correctness.

## Tasks

| # | Task | Difficulty | Repo |
|---|------|-----------|------|
| 1 | Add `/healthz` endpoint to `life_core/api.py` | medium (large repo, FastAPI) | life-core copy |
| 2 | Fix 2 typos in README.md (`plateform`, `Architectue`) | easy | greenfield with seeded README |
| 3 | Greenfield: `utils/string_utils.py snake_case()` + 3 unittest cases | easy-medium | empty dir |

## Results

| Metric | Task 1 (healthz) | Task 2 (typos) | Task 3 (snake_case) |
|---|---|---|---|
| **aki wall** | 60s | 8s | 17s |
| **Claude wall** | **30s** | 9s | 15s |
| aki tool calls | 23 (12 plan + 11 acts) | 7 (4 plan + 3 acts) | 15 (8 plan + 7 acts) |
| Claude tool calls | **5** | **5** | **4** |
| aki tokens in / out | 288,774 / 1,274 | 34,786 / 519 | 75,136 / 1,475 |
| Claude tokens in / out | ~30K / ~38K (incl skill catalog) | ~25K / ~17K | ~25K / ~24K |
| Correctness | endpoint @ L462, diagnostics clean ✓ | both typos fixed ✓ | 3 unittests pass ✓ |
| aki cache hit (cumulative) | 90% (262K/288K) | 74% (25K/34K) | 86% (64K/75K) |
| Claude cost estimate | ~$2 (large input) | ~$0.50 | ~$0.75 |
| aki cost (eu-kiki self-hosted) | $0 | $0 | $0 |

**Claude Code is ~2× faster on the medium task, equivalent on easy tasks, and uses 3-4× fewer tool calls across the board.**

## Observations

### Where aki shines
- **Cost zero** — eu-kiki + Qwen 32B AWQ is local-only, no per-token billing.
- **EU-sovereign** — no data leaves the Tailscale fleet (gateway → workers → back). Telemetry off (#commit b4125e0 in v0.1).
- **Auditable** — every turn captured in `<cwd>/.agent-kiki/runs/<id>/{meta.json, trace.jsonl}` with schema 1.0.0. Cross-language validated (Python ↔ TS).
- **Cache reuse** — 75-90% prompt cache hit rate observed. Subsequent turns are very cheap (eu-kiki has built-in prompt caching across the session).
- **Tools breadth** — search_files, diagnostics_scan, replace_symbol, edit_file, execute_command all working.

### Where Claude Code shines
- **Faster wall** on medium-complexity tasks (Task 1: 30s vs 60s = 2×).
- **Fewer tool calls** — 5 vs 15-23. Suggests Claude's planning is more decisive: it gloms the right context in fewer reads + emits the right edit in one shot.
- **Lower input token count** — ~25-30K per task vs aki's 35-290K. Claude's context-curation discipline shows.
- **Idioms** — Claude added `__init__.py` files in Task 3 (Python package convention); aki didn't.
- **Reasoning visibility** — Claude prints concise rationale per step.

### Surprising findings
- aki's **289K input tokens on Task 1** is huge (life-core's 600+ files in the workdir). The Dirac/Cline file-discovery loop is greedy without targeted RAG. Claude trims via Glob/Grep early.
- aki Task 1 took **38 min the first time** (Devstral 24B + vague prompt) → **1 min** with Qwen 32B + directive prompt. **Model + prompt engineering matter more than raw architecture.**
- For simple edits (Task 2-3), the gap closes: aki 8-17s vs Claude 9-15s. Self-hosted is competitive.

## Recommendation

| Use case | Recommended agent |
|---|---|
| Daily quick edits, refactors, single-file fixes | **aki+eu-kiki+Qwen** (free, audit-ready, fast enough) |
| Large unfamiliar repo navigation | **Claude Code** (Opus's planning > Devstral's exploration) |
| Sensitive code (HIPAA, GDPR, EU AI Act audit) | **aki+eu-kiki** (sovereign + JSONL trace) |
| Long sessions / multi-hour debugging | aki+Qwen if cost-sensitive; Claude Code if velocity-sensitive |
| Greenfield project bootstrap | either, comparable on small projects; Claude Code on large ones |

## Decision

**GO for aki+eu-kiki as default daily-driver** for:
- Code quick-fixes, refactors, README typos, helper module creation, tests.
- Anything that fits in a tight context window or where eu-kiki cache pays off.

**Keep Claude Code in toolbox** for:
- Repo-wide refactors needing strong cross-file reasoning.
- Tasks where wall-clock matters more than $.
- High-stakes correctness tasks where Opus 4.7 reasoning > Qwen 32B.

The two are complementary; the fork's value is exactly that it gives a free + sovereign baseline that handles 60-80% of typical work, leaving Claude Code as the premium tool when the task demands it.

## Caveats

- **3 tasks is a small N**. A real eval needs 20+ tasks across difficulty levels. This is V1 of an ongoing benchmark.
- **Claude Code measured here is a sub-agent**, not the standalone CLI. The standalone CLI carries less system-prompt overhead — its real input tokens would be ~30-50% lower than reported here.
- **Tower's Qwen routing** went through an SSH tunnel — the actual inference happens on `kxkm-ai`'s GPU (rtx-class? unclear from inventory). Latency may vary on a different host.
- **Step 4 KiCad** of the Phase 14 plan was *not* tested here (deferred V1+ on both sides — neither agent has a KiCad-aware tool layer).

## Reproducibility

All test repos under `/tmp/eval-aki/` and `/tmp/eval-cc/`. aki traces at `<task-dir>/.agent-kiki/runs/`. Claude Code traces don't persist — only the metrics reported in the agent dispatch transcripts.

To re-run aki side:
```bash
for task in task1-healthz task2 task3; do
  cd /tmp/eval-aki/$task
  rm -rf .agent-kiki
  aki task --yolo --model eu-kiki-qwen "<the prompt>"
done
```
