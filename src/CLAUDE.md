# CLAUDE.md

Guidance Claude Code pour cet arbre.

Scope : extension VS Code d'ailiance-agent (`ailiance-agent-0.x.0.vsix`,
`main = ./dist/extension.js`, engines `vscode ^1.84.0`). Le core agent multi-LLM
vit ici mais est **partagé** avec le standalone (CLI) — voir `hosts/` pour la
frontière plateforme.

## Build & Run

```bash
npm run protos          # OBLIGATOIRE en premier (génère src/generated/, src/shared/proto/)
npm run compile         # check-types + biome + esbuild → dist/extension.js
npm run dev             # protos puis watch (tsc + esbuild)
npm run package         # bundle prod + webview (vsce)
npx vsce package        # produit .vsix à la racine
```

Lancer : `F5` → Extension Development Host (`.vscode/launch.json`, configs
*production*/*staging*). Itérer sans relancer : `npm run watch` + *Reload Window*.

## Tests

```bash
npm run test:unit        # mocha (TS_NODE_PROJECT=tsconfig.unit-test.json, .mocharc.json)
npm run test:integration # @vscode/test-cli — VS Code headless, src/test/
npm run test:coverage    # idem + couverture
npm run test:e2e         # playwright sur le .vsix (build via test:e2e:build)
```

Unit : co-localisés (`__tests__/`). Pas de framework d'assertion imposé — voir
l'existant avant d'ajouter une dépendance.

## Architecture — bicouche host / core

Le TS sert deux runtimes : extension VS Code + standalone (CLI/serveur).

- `extension.ts` — entry-point VS Code. `activate()` : `createStorageContext` →
  `setupHostProvider` → migrations legacy → export storage → `initialize()` →
  enregistrement commands/views.
- `common.ts` — init partagée tous platforms (StateManager, ErrorService,
  telemetry, SymbolIndex, syncWorker, webview provider).
- `hosts/` — adapters plateforme. `HostProvider` (singleton) abstrait
  `window`/`workspace`/`env`/`diff`/`webview`. `hosts/vscode/` = impl VS Code ;
  `hosts/external/` = impl standalone.

**Règle** : préférer `HostProvider` à `import * as vscode` dans
`core/`/`services/`/`integrations/` (casse le build standalone). Exceptions
tolérées : `core/api/providers/vscode-lm.ts`, `core/api/transform/vscode-lm-format.ts`,
`core/controller/models/getVsCodeLmModels.ts`, `core/controller/ui/openWalkthrough.ts`,
`core/storage/state-migrations.ts`. Nouveau besoin VS Code-only → étendre
`host-provider-types.ts` + impl dans `hosts/vscode/`.

### Manifest & webview

- `activationEvents` quasi-systématiques ; 21 commandes `dirac.*` (legacy —
  produit = "ailiance-agent"), câblées `extension.ts` → `core/controller/`.
- Vue webview unique `dirac.SidebarProvider` (container `dirac-ActivityBar`),
  impl `hosts/vscode/VscodeWebviewProvider.ts`. URI handler : `SharedUriHandler`.
- UI React dans `../webview-ui/`, comm gRPC (protobuf `../proto/`) via
  `hostbridge`. Events `subscribeTo*` → webview ; RPC entrants → `controller/` → `core/task/`.

### Path aliases

`@/*` → `src/*`, plus `@api @core @generated @hosts @integrations @packages
@services @shared @utils`. Préférer aux chemins relatifs profonds.

## Where to Look

| Question | Fichier |
|----------|---------|
| Activation / désactivation | `extension.ts` (`activate`, `deactivate`) |
| Init partagée core | `common.ts` (`initialize`, `tearDown`) |
| Contributions VS Code | `package.json` → `contributes` |
| Provider webview latéral | `hosts/vscode/VscodeWebviewProvider.ts` |
| Diff inline éditeur | `hosts/vscode/VscodeDiffViewProvider.ts` |
| Génération commit msg | `hosts/vscode/commit-message-generator.ts` |
| Code actions (Add to chat/Fix/…) | `core/controller/commands/` |
| Migrations storage → ~/.dirac | `core/storage/state-migrations.ts` + `hosts/vscode/vscode-to-file-migration.ts` |
| Terminal intégré | `hosts/vscode/terminal/VscodeTerminalManager.ts` |
| Boucle agent (cross-platform) | `core/task/` |

## Gotchas

- `Cannot find module '@/shared/proto/...'` → relancer `npm run protos` (générés gitignorés).
- `noImplicitOverride` strict + `useUnknownInCatchVariables: false`. Biome bloque
  `console.*` → utiliser `Logger` (`@/shared/services/Logger`).
- Migrations storage tournent à chaque activate ; idempotentes mais ordre
  important — ne pas réordonner sans relire `extension.ts:60-90`.
- Id legacy `dirac` conservé pour compat installations existantes — ne pas
  renommer en `ailiance-agent` sans plan de migration.
- Tests d'intégration ouvrent une vraie instance VS Code (lents) — préférer
  `test:unit` (mocke `HostProvider`) pour du TDD.
