# agent-kiki

Coding agent (fork de Dirac/Cline) — extension VS Code + CLI Ink, orchestrateur multi-LLM.
Branding "aki" / kiki, packaging `agent-kiki-0.x.0.vsix`.

## Workspaces

| Path | Rôle |
|------|------|
| `src/` | Extension VS Code + core agent (TS) |
| `cli/` | CLI Ink (binaire `aki`) |
| `webview-ui/` | Frontend React (Vite + Storybook) |
| `proto/` | Protobuf (gRPC entre host/webview/CLI) |
| `evals/`, `agent-registry/`, `walkthrough/`, `locales/` | Assets non-code |

## Dev Flow

```bash
npm run install:all     # bootstrap monorepo (root + cli + webview-ui)
npm run protos          # REQUIS avant build (génère src/generated/, src/shared/proto/)
npm run build
npm test                # mocha (root) — voir cli/, webview-ui/ pour leurs tests
npm run lint            # biome
```

## Where to Look

| Tâche | Location |
|------|---------|
| Boucle d'exécution agent / state | `src/core/task/` |
| Provider LLM (anthropic, openai, …) | `src/core/api/providers/` |
| Tracing JSONL (.agent-kiki/runs/) | `src/core/tracing/` |
| Persistence disque (~/.dirac, globalStorage) | `src/core/storage/` |
| Tool handlers | `src/core/task/tools/handlers/` |
| Slash commands | `src/core/slash-commands/` |
| Prompts système | `src/core/prompts/` |
| CLI Ink (TUI) | `cli/src/` |
| UI React (panel webview) | `webview-ui/src/` |
| Notes acceptance MVP | `docs/` |

## Search Hygiene

NE PAS grep dans : `node_modules/`, `dist/`, `build/`, `out/`, `src/generated/`, `src/shared/proto/` — fichiers binaires/générés.

## Conventions Globales

- Langue conversation : FR. Code/commits/docs : EN.
- Commit subject ≤ 50 chars, body ≤ 72/ligne, pas d'attribution AI, pas de `--no-verify`.
- TS strict, biome pour format/lint (config `biome.jsonc`).
- Branding actuel : `branding` (master = upstream).

## Agent Workflow

Explore trouve → librarian lit → tu planifies → general-purpose implémente → validator vérifie.
Ne réimplémente pas, **délègue**. Contexte conducteur = raisonnement, pas stockage.

## Guidance

Les CLAUDE.md imbriqués (`src/core/task/`, `src/core/api/`, `cli/`, `webview-ui/`, …) chargent
automatiquement quand tu travailles dans ces arbres. **Closest wins** : un CLAUDE.md proche
écrase une règle homonyme du root.
