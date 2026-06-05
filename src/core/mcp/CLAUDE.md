# MCP Integration
Découverte + connexion des serveurs MCP des plugins, exposition de leurs tools au LLM, retrieval adaptatif par pertinence.

## Files
| Fichier | Rôle |
|---------|------|
| `McpClientManager.ts` | Singleton `mcpClientManager` (L374). `loadFromPlugins` (L101), `connect` (L113, stdio/http), `fetchTools` (L235), `listAllTools` (L278, concurrence bornée), `callTool` (L349, lazy-spawn), cache disque `~/.isaac/mcp-tools-cache.json` (L37) + `configHash` (L55), `withTimeout` (L63), `mapWithConcurrency` (L79) |
| `bootstrap.ts` | `initializeMcpForTask` (L132) : load → list → `registerMcpTool`/`registerSpec` → build index retrieval. `mcpToolToSpec` (L69, `contextRequirements` L78 = la gate), `convertJsonSchemaToParams` (L35), `readMcpSettings` (L97) |
| `McpServerConfigLoader.ts` | `loadMcpConfigsFromPlugins` (L68) : lit `.mcp.json` de chaque plugin, dédup par id (L75), expand `${CLAUDE_PLUGIN_ROOT}`/`${ENV}`, `resolveHttpHeaders` (L44, bearer token-gate) |
| `McpToolHandler.ts` | `McpToolHandler` (L36, `IFullyManagedTool`) : `execute` (L53) délègue à `callTool`. `formatMcpContent` (L13) |
| `types.ts` | `McpServerConfig` (stdio\|http, L24), `McpToolMetadata` (L33), `makeQualifiedToolName` (L48 → `mcp__<plugin>_<server>__<tool>`) |
| `urlSecurity.ts` | `assertMcpUrlAllowed` (L120, SSRF guard cloud-metadata), `shouldSendBearer` (L103, token-gate https/privé), `normalizeHost` (L38) |

## Subdirs
| `retrieval/` | Retrieval adaptatif relevance-gated. `ActiveMcpToolSet` (set actif par session : `seed`/`expand`/`snapshot`), `Embedder` (all-MiniLM-L6-v2 ONNX via transformers.js, lazy), `ToolVectorIndex` (cache `~/.dirac/mcp-tool-vectors.json`), `cosine.ts` (`selectTopK`), `config.ts` (`getRetrievalConfig` : baseK 8 / findK 5 / threshold 0.3), `session.ts` (singleton process-wide `get/set/clearActiveMcpToolSet`) |

## Pattern
1. **Boot** : `initializeMcpForTask` → `loadFromPlugins` (configs `.mcp.json`) → `listAllTools` (cache disque chaud = 0 spawn ; froid = connexions concurrentes time-boxées). Chaque tool → `registerMcpTool` (handler) + `registerSpec` (exposé au LLM).
2. **Transport** : stdio (`StdioClientTransport`, subprocess, env `CLAUDE_PLUGIN_ROOT`) ou http (`StreamableHTTPClientTransport`, import dynamique). Serveurs spawnés **lazy** : `callTool` → `connect` à la première invocation.
3. **Retrieval gate** : à la création de tâche, `ActiveMcpToolSet.seed(prompt)` embed le prompt et active les top-K tools pertinents. La gate vit dans `contextRequirements` (bootstrap L78) ; `ApiRequestHandler` passe `activeMcpTools: snapshot()`. Le LLM appelle l'outil `find_tools` (`FindToolsToolHandler`) → `expand(query)` pour activer plus de tools à la demande.

## Gotchas
- `find_tools` / la gate vivent HORS de ce dossier (`core/task/`, `core/prompts/system-prompt/tools/`) ; ici on ne fait que publier le set via `session.ts`. `clearActiveMcpToolSet` publie un set VIDE entre tâches — `undefined` ferait émettre TOUS les tools.
- Deux caches DISTINCTS : tools metadata (`~/.isaac/`, TTL 24h, clé configHash) vs vecteurs embeddings (`~/.dirac/`, clé hashText). `invalidateToolCache` purge aussi le disque sinon no-op pendant 24h.
- Embedder indisponible (modèle absent / `--no-mcp`) ⇒ fallback "native-only" : set dead-embedder ⇒ `seed`/`expand` échouent silencieusement, `embedderOk=false`. Ne crashe jamais le boot.
- Token bearer : fail-closed. `resolveHttpHeaders` refuse d'envoyer `Authorization` sur http public (skip le serveur). `ISAAC_MCP_<ID>_TOKEN` injecté, jamais persisté.
- Dédup serveurs par id (premier plugin gagne) : context7/sequential-thinking shippés par plusieurs plugins.
- Caches désactivés sous tests (`MOCHA`/`VITEST`/`TS_NODE_PROJECT`). Env : `AILIANCE_MCP_SERVERS`, `AILIANCE_NO_MCP`, `ISAAC_MCP_REFRESH`, `AILIANCE_MCP_TOP_K`/`FIND_K`/`THRESHOLD`, `AILIANCE_EMBED_MODEL`/`_OFFLINE`.
