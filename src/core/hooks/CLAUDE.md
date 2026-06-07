# Agent Hooks

Hooks de cycle de vie de l'agent (≠ React hooks Ink de `cli/src/hooks`). Scripts user/plugin exécutés à des points clés de la task loop — fail-open, advisory.

## Files

| Fichier | Rôle |
|---------|------|
| `hook-factory.ts` (1196 L) | Cœur. `Hooks` (L104, les 9 events typés), `HookRunner` abstrait (L167), `StdioHookRunner` (L277, spawn + parse JSON stdout), `NoOpRunner` (L232, null-object), `CombinedHookRunner` (L653, multi-script parallèle + merge), `PluginHookRunner` (L735), `HookFactory` (L829). `findHookScripts` + registre plugin statique (`registerPluginHooks` L849, `getPluginHooksForEvent` L866) |
| `hook-executor.ts` | `executeHook()` (L58) — wrapper standard : `hasHook` → `say("hook_status")` → run → update status (running/completed/cancelled/failed) → `fromHookOutput`. `reorderHookAndToolMessages` (L286, UI hook au-dessus du tool) |
| `HookProcess.ts` (456 L) | `HookProcess` (L89) child-process streaming (events `line`). `getHookLaunchConfig` (L44, shell unix / PowerShell win). Timeout 30 s, output cap 1 MB (L9) |
| `HookProcessRegistry.ts` | `HookProcessRegistry` (L17) statique — track/kill des process en vol |
| `HookDiscoveryCache.ts` | `HookDiscoveryCache` singleton (L49) — cache `hookName → scriptPaths` + file-watchers, invalidation auto |
| `hook-model-context.ts` | `getHookModelContext()` (L12) — résout provider/slug pour le payload |
| `precompact-executor.ts` | `executePreCompactHookWithCleanup()` (L187) — écrit context files, exécute PreCompact, gère cancel/cleanup. `HookExecution` type + `HookCancellationError` (L24) |
| `HookError.ts` | `HookExecutionError` (L38) + factories `timeout`/`validation`/`execution`/`cancellation`. `HookErrorType` enum (L4) |
| `templates.ts` | `getHookTemplate()` (L8) — scaffold de script par event (bash + PowerShell) |
| `utils.ts` / `hooks-utils.ts` | `VALID_HOOK_TYPES`/`isValidHookType` (L11/L34) ; `getHooksEnabledSafe()` (défaut = true) |
| `shell-escape.ts` | `escapeShellPath()` (L65) |
| `PreToolUseHookCancellationError.ts` | erreur dédiée jetée par le path PreToolUse |

## Subdirs

- `__tests__/` — un test par event (taskstart, taskcancel, user-prompt-submit, …) + HookProcess/factory/shell-escape. Tests co-localisés ici, pas mocha root.

## Pattern

9 events (`Hooks`, hook-factory.ts:104) : **UserPromptSubmit, TaskStart, TaskResume, TaskCancel, TaskComplete, PreToolUse, PostToolUse, Notification, PreCompact**. Orchestration via `src/core/task/HookManager.ts` + appels directs depuis la task loop :

| Event | Déclencheur (call site) |
|-------|------|
| UserPromptSubmit | `HookManager.runUserPromptSubmitHook` (L131) |
| TaskStart / TaskResume / TaskCancel | `task/LifecycleManager.ts:136 / 269 / 469` |
| PreToolUse | `task/tools/utils/ToolHookUtils.ts:61` (avant exec tool) |
| PostToolUse | `task/ToolExecutor.ts:578` |
| TaskComplete / Notification | `task/tools/handlers/AttemptCompletionHandler.ts:504 / 548` ; aussi `TaskMessenger.ts:198` |
| PreCompact | `precompact-executor.ts` (Task + SummarizeTaskHandler) |

Flux `executeHook` : `HookFactory.hasHook` (filesystem OU plugin) → discovery via `HookDiscoveryCache` → un `StdioHookRunner` par script (global `~/Documents/Dirac/Hooks` + workspace `.diracrules/hooks`, dirs résolus par `getAllHooksDirs` disk.ts:515) → ≥2 scripts ⇒ `CombinedHookRunner` (parallèle). Payload = JSON via stdin (`completeParams` enrichit diracVersion/userId/timestamp/workspaceRoots/model). Réponse = JSON sur stdout : `{ cancel?, contextModification?, errorMessage? }`. `cancel:true` annule la tâche ; `contextModification` injecté dans le contexte (cap 50 KB, hook-factory.ts:32).

## How to add a hook (event type)

1. Ajouter `<Name>Data` au proto `shared/proto/dirac/hooks` + regénérer (`npm run protos`).
2. Étendre `Hooks` (hook-factory.ts:104) et `VALID_HOOK_TYPES` (utils.ts:11).
3. Ajouter un template dans `templates.ts` (map de `getHookTemplate`).
4. Appeler `executeHook({ hookName: "<Name>", hookInput: {...}, hooksEnabled, ... })` au bon point de la task loop ; gérer `result.cancel` / `contextModification`.

(Pour ajouter un *script* hook utilisateur : déposer un exécutable dans un hooks dir — le cache le découvre, pas de code.)

## Gotchas

- **Fail-open** : exit non-zéro ou erreur ⇒ no-op, ne bloque pas le tool. Seul un JSON `{cancel:true}` valide annule (hook-factory.ts:271). `validateHookOutput` rejette l'ancien champ `shouldContinue` (migrer vers `cancel`).
- Timeout : `HOOK_EXECUTION_TIMEOUT_MS = 10000` (factory) mais `HookProcess` défaut = 30 s — la valeur passée par le factory gouverne.
- `HookDiscoveryCache` est un singleton avec watchers : en test, attention au state partagé (voir `resetHookLaunchConfigCacheForTesting`).
- Global vs workspace : détection par regex sur le dir (`isGlobalHooksDir`, cherche `Cline/Hooks` — legacy branding). Le `cwd` du script diffère selon source (global = primary root).
- `setActiveHookExecution` requis pour qu'un hook soit annulable par l'utilisateur ; sinon non-cancellable. PreToolUse réordonne les messages UI (hook au-dessus du tool) avant de run.
- Plugin hooks : registre **statique** sur `HookFactory`, peuplé une fois au boot (`registerPluginHooks`). Events non supportés (Stop/SessionStart/PermissionRequest) filtrés en amont par `PluginHookLoader`.
- Tests : ici (`__tests__/`), pas dans le mocha root.
