# Context Management

Gestion de la fenêtre de contexte : troncature d'historique, condensation/résumé, tracking des fichiers (staleness), chargement des règles/skills/workflows utilisateur.

## Files

Aucun `.ts` direct dans `context/` — tout vit en sous-dossiers.

## Subdirs

| Dossier | Rôle |
|---------|------|
| `context-management/` | Troncature + compaction de l'historique API |
| `context-tracking/` | Métadonnées par tâche (fichiers, modèle, env) → staleness |
| `instructions/user-instructions/` | Chargement règles (.diracrules / cursor / windsurf / AGENTS.md), skills, workflows, conditionnels frontmatter |

### context-management
| Fichier | Rôle |
|---------|------|
| `ContextManager.ts:137` | `getNewContextMessagesAndMetadata` — entrée principale, calcule la range supprimée + tronque |
| `ContextManager.ts:60` | `shouldCompactContextWindow` — décide compaction selon tokens vs seuil |
| `ContextManager.ts:191` | `getNextTruncationRange` — calcule range à retirer (`half`/`quarter`/`lastTwo`/`none`) |
| `ContextManager.ts:291` | `ensureToolResultsFollowToolUse` — répare paires tool_use/tool_result post-troncature |
| `context-window-utils.ts:9` | `getContextWindowInfo` — contextWindow + `maxAllowedSize` (HARD_LIMIT 1M) |
| `context-error-handling.ts:3` | `checkContextWindowExceededError` — détecte erreurs 400 "context length" multi-provider |

### context-tracking
| Fichier | Rôle |
|---------|------|
| `FileContextTracker.ts:25` | chokidar watchers, staleness `active`/`stale`, warnings restore checkpoint |
| `ModelContextTracker.ts:3` | log changements de modèle (dédupe dernier entry) |
| `EnvironmentContextTracker.ts:4` | log OS/host/version (dédupe si identique) |
| `ContextTrackerTypes.ts:28` | `TaskMetadata` = files_in_context + model_usage + environment_history |

## Pattern

Deux modes (flag global `useAutoCondense`, lu dans `task/ApiConversationManager.ts:84` + `ApiRequestHandler.ts:229`) :

- **Programmatique (legacy)** : si tokens du précédent req ≥ `maxAllowedSize` (`context-window-utils.ts:14` = `min(1M, max(window-40k, window*0.8))`), on supprime une range. `half` par défaut, `quarter` si `totalTokens/2 > maxAllowedSize`. On garde TOUJOURS la 1ʳᵉ paire user/assistant (`rangeStartIndex=2`). Range cumulative via `conversationHistoryDeletedRange`. Post-troncature : `ApiRequestHandler.ts:247` notifie explicitement le modèle que l'historique a été tronqué.
- **Auto-condense** : seuil 0.75 (`ApiConversationManager.ts:85`), `shouldCompactContextWindow(..., 0.75)`. Le résumé est produit par l'outil `task/tools/handlers/SummarizeTaskHandler.ts` (télémétrie via `getContextTelemetryData`).

`new ContextManager()` instancié dans `task/index.ts:242` et `task/tools/subagent/SubagentRunner.ts:313`.

Staleness fichiers : un fichier lu/édité/mentionné est `active` ; édité hors-agent (watcher chokidar) → `stale` + ajouté à `recentlyModifiedFiles`, ce qui force un re-read avant diff. `recentlyEditedByDirac` évite les faux positifs sur les écritures de l'agent. `getAndClearRecentlyModifiedFiles` consommé dans la boucle tâche.

Règles : `RuleContextBuilder.ts:42` collecte ≤100 paths (msg user, tabs ouverts, tools say/ask) → `RuleEvaluationContext`, évalué contre frontmatter YAML `paths:` (globs picomatch) dans `rule-conditionals.ts`. Sources : `.diracrules`, `.cursor/rules`/`.cursorrules`, `.windsurfrules`, `AGENTS.md` (noms dans `storage/disk.ts` `GlobalFileNames`).

## Gotchas

- `getContextWindowInfo` fallback `256_000` si `info.contextWindow` absent — peut sous-estimer le besoin de troncature pour un petit modèle.
- `getNextTruncationRange` recule `rangeEndIndex` d'1 si la dernière supprimée n'est pas `assistant` : préserve la structure user-assistant-user (format Anthropic partout, jamais OpenAI).
- `applyContextHistoryUpdates` filtre les `tool_result` orphelins du 1ᵉʳ message post-troncature ; `ensureToolResultsFollowToolUse` réinsère les manquants (`content: "result missing"`) — sinon l'API rejette pour paire incomplète.
- `getTextFromBlock`/`setTextInBlock` gèrent text brut ET wrapper `tool_result.content[0]` (native tool calling) — ne pas supposer `block.type === "text"`.
- Clés workspace state dynamiques `pendingFileContextWarning_${taskId}` castées `as any` (hors `LocalStateKey`) ; nettoyées au boot par `cleanupOrphanedWarnings`.
- `checkIsAnthropicContextWindowError` matche tout `invalid_request_error` — large, risque de faux positifs.
- Le bloc "active message count" (`ApiConversationManager.ts:100`) évite de résumer un résumé : ne pas le retirer.
