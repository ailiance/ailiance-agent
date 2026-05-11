# MVP Acceptance — ailiance-agent v0.2.0 (end-to-end unblocked)

**Date:** 2026-05-05 (09:42-09:51 UTC+02)
**Branch:** branding (ailiance-agent) + main (ailiance)
**ailiance-agent HEAD:** `35fb213` (v0.1.0) — no fork-side changes for v0.2
**ailiance HEAD:** `fd03f00` (function-calling shim + SSE proxy + tool-turn normalize)

## Summary

**v0.1.0 backend gap closed.** End-to-end SCRATCH-Rust task convergence
demonstrated against the default ailiance backend. The fix was entirely
on the ailiance side; the ailiance-agent fork code is unchanged.

## ailiance commits this iteration

```
fd03f00 fix(worker): normalize tool turns for template
e30f9ce feat(worker): parse mistral and xml tool calls
d71f372 feat(gateway): proxy SSE stream to clients
1e344c1 test(worker): function-calling integration
573fa58 feat(worker): wire tools and stream in chat
a74dba4 feat(worker): add function-calling shim module
```

## Live test (canonical Phase 14 Step 2)

`aki task --yolo --model ailiance-devstral "Create a minimal TOML parser
in Rust with one unit test"` against `http://100.116.92.12:9300/v1`.

**Outcome:**
- 8 plan turns + 7 tool executions (2 write_to_file, 1 read_file,
  2 edit_file, 2 execute_command) over 8m17s wall.
- `Cargo.toml`, `src/main.rs` (140-line TOML parser with Integer / Float /
  String / Boolean / Array / Table variants), `Cargo.lock`, `target/`
  produced.
- `cargo test` → `test result: ok. 1 passed; 0 failed`.
- Final tool: `completion_result` ("Created a minimal TOML parser in
  Rust with one unit test...").
- Tokens: 45,562 in / 456 out.
- Trace: 15 lines in `trace.jsonl`, valid `meta.json` with non-null
  `ended_at`.

## What this proves end-to-end

| Capability | Status |
|------------|--------|
| OpenAI tool spec → ailiance worker (gateway pass-through) | ✅ |
| Worker injects tool spec into Mistral chat template | ✅ |
| Devstral emits `[TOOL_CALLS]name[ARGS]json` natively | ✅ |
| Worker parses Mistral / XML / JSON tool-call formats | ✅ |
| Worker emits OpenAI SSE `tool_calls` chunks | ✅ |
| Gateway proxies SSE without buffering | ✅ |
| Dirac receives `tool_calls` and dispatches to tool handlers | ✅ |
| Tool result (`role: "tool"`) round-trips back to worker via normalized prompt | ✅ |
| Conversation history with tool_calls passes Mistral chat template | ✅ |
| ReAct loop converges to `attempt_completion` | ✅ |
| EU AI Act JSONL trace captures every plan + tool turn | ✅ |
| `cargo test` validates produced code | ✅ |

## What blocks v0.3 (carry-overs)

- **Token usage placeholder**: worker reports word-count split, not real
  tokens. Cosmetic; doesn't block agent function.
- **Single-domain hot-swap**: `apply()` swaps LoRA per request; rapid
  domain rotation will be slow. V1 follow-up: parallel-domain workers
  or merged adapter sets.
- **Steps 3-7 of the canonical Phase 14 acceptance** (EDIT life-core,
  KiCad SCRATCH, trace round-trip script, hard-deny `rm -rf`,
  `aki-export-dataset`) — can be exercised on demand; Step 2 is the
  load-bearing one (planner + coder + tool dispatch + tracing all
  active in one task).

## Decision

**Tag `ailiance-agent v0.2.0` GO.**

Rationale: the function-calling gap that gated v0.1.0 is closed
upstream. ailiance-agent itself ships unchanged from v0.1.0 — its caveats
README section can drop the "ailiance backend lacks native
function-calling" bullet in a follow-up commit. End-to-end is verifiably
working with the default backend.
