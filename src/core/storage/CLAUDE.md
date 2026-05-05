# Storage

Persistence disque cross-host (VSCode globalStorage / CLI `~/.dirac`). Cache en mémoire + writes via `StorageContext`.

## Layout

Root = `HostProvider.get().globalStorageFsPath` (CLI : `~/.dirac` via `getDiracHomePath`). Subdirs créés à la demande par `getGlobalStorageDir(...subdirs)` :

```
<root>/
  tasks/<taskId>/
    api_conversation_history.json   # historique LLM
    ui_messages.json                # historique UI (renommé depuis claude_messages.json)
    context_history.json
    task_metadata.json              # { files_in_context, model_usage, environment_history }
  settings/
  state/
    taskHistory.json                # auto-recovery sur parse fail
  cache/                            # model caches
```

Tracing JSONL : **PAS ici**. Voir `../tracing/CLAUDE.md` (chemin réel `.agent-kiki/runs/<taskId>/`).

Workspace-side (rules/skills) : `.diracrules/`, `.dirac/skills`, `.claude/skills`, `.agents/skills`, `.ai/skills`, `.cursor/rules`, `.windsurfrules`, `AGENTS.md`.

User Documents (cross-platform via `getDocumentsPath`, XDG/PowerShell aware) : `~/Documents/Dirac/{Rules,Workflows,Hooks}`.

## Files

| Fichier | Rôle |
|---------|------|
| `disk.ts` (660 l) | Free functions : `getSavedApiConversationHistory`, `saveDiracMessages`, `getTaskMetadata`, `readTaskHistoryFromState`. `GlobalFileNames` L43-69. `atomicWriteFile` L29-41 |
| `StateManager.ts` (881 l) | Singleton, caches in-memory : `globalStateCache`, `taskStateCache`, `sessionOverrideCache`, `secretsCache`, `workspaceStateCache`, `modelInfoCache` (1h TTL). chokidar pour watch externe |
| `state-migrations.ts` (602 l) | VSCode-only : migre legacy `workspaceState` keys vers global storage |
| `utils/state-helpers.ts` | `readGlobalStateFromStorage`, `readSecretsFromStorage`, `readWorkspaceStateFromStorage` |

## Patterns

- **Atomic writes** via temp + rename (`atomicWriteFile`). La majorité des saves l'utilisent — **`saveTaskMetadata` (L326) NE l'utilise PAS** (raw `fs.writeFile`) — risque de partial-write
- **Cache-first** : `StateManager.initialize()` charge le disque 1×, puis tout passe par cache. Aucun re-read auto
- **Secrets** : keyspace séparé via `isSecretKey`, persisté par `StorageContext` (VSCode SecretStorage / backend CLI), pas du JSON plain
- **Migration silencieuse** : ancien `claude_messages.json` → `ui_messages.json` (`disk.ts:259-265`)

## Gotchas

- **Pas de file locks** — multi-instance écrivant la même task = last-rename-wins
- **Cache staleness** : Window B ne voit les changements de Window A qu'après restart. `chokidar` existe mais scope d'invalidation à vérifier
- **Recovery silencieuse** : `taskHistory.json` parse fail → `reconstructTaskHistory`, si ça échoue retourne `[]` (history wipé silencieusement)
- **Remote sync** (`syncWorker().enqueue`, disk.ts:243) : fire-and-forget en parallèle du save local, aucune ordering guarantee
- **`saveTaskMetadata` non-atomique** — wrapper avant tout commit critique
- **Schema versioning absent** : migrations pilotées par présence de clés VSCode legacy, pas par version embed
