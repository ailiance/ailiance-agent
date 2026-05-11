# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Scope : extension VS Code d'ailiance-agent (publishée en `ailiance-agent-0.x.0.vsix`,
`main = ./dist/extension.js`, engines `vscode ^1.84.0`). Le core agent multi-LLM
vit aussi dans cet arbre mais est partagé avec le mode standalone (CLI) — voir
`hosts/` pour la frontière plateforme.

## Build & Run

```bash
npm run protos          # OBLIGATOIRE en premier (génère src/generated/, src/shared/proto/)
npm run compile         # check-types + biome lint + esbuild (dev bundle → dist/extension.js)
npm run dev             # protos puts watch (tsc + esbuild en parallèle)
npm run package         # bundle prod + webview (utilisé par vsce)
npx vsce package        # produit .vsix à la racine
```

Lancer l'extension : `F5` dans VS Code ouvre une Extension Development Host
(`.vscode/launch.json`, configs *production* / *staging*). Le `preLaunchTask`
déclenche le build automatiquement ; pour itérer sans relancer la fenêtre,
laisser `npm run watch` tourner et utiliser *Reload Window* dans l'host.

## Tests

```bash
npm run test:unit       # mocha (TS_NODE_PROJECT=tsconfig.unit-test.json), pattern défini par .mocharc.json
npm run test:integration # @vscode/test-cli — lance VS Code headless et exécute src/test/
npm run test:coverage   # idem avec couverture
npm run test:e2e        # playwright sur le .vsix packagé (build via test:e2e:build)
```

Tests unitaires : co-localisés (`__tests__/` à côté du code). Pas de framework
d'assertion imposé — voir fichiers existants avant d'ajouter une dépendance.

## Architecture

### Bicouche host / core

Le code TS sert deux runtimes : l'extension VS Code et le standalone (CLI / serveur).
La séparation est explicite :

- `extension.ts` — entry-point VS Code uniquement. `activate()` séquence :
  `createStorageContext` → `setupHostProvider` → migrations legacy storage →
  export storage → `initialize()` (common) → enregistrement commands/views VS Code.
- `common.ts` — initialisation partagée tous platforms (StateManager,
  ErrorService, telemetry, SymbolIndex, syncWorker, webview provider).
- `hosts/` — adapters plateforme. `HostProvider` (singleton) abstrait
  `window`/`workspace`/`env`/`diff`/`webview` pour que le core appelle
  `HostProvider.window.showMessage(...)` indépendamment du runtime.
  - `hosts/vscode/` — implémentation VS Code (terminal, diff view, webview,
    commit-message-generator, review controller, hostbridge gRPC).
  - `hosts/external/` — implémentation pour standalone.

**Règle** : préférer `HostProvider` à un `import * as vscode from "vscode"`
direct dans `core/`, `services/`, `integrations/` — ça casse le build standalone.
Exceptions tolérées (déjà en place) : `core/api/providers/vscode-lm.ts` +
`core/api/transform/vscode-lm-format.ts` (provider VS Code LM API natif),
`core/controller/models/getVsCodeLmModels.ts`,
`core/controller/ui/openWalkthrough.ts`, `core/storage/state-migrations.ts`.
Pour un nouveau besoin VS Code-only, étendre plutôt `host-provider-types.ts`
et l'implémenter dans `hosts/vscode/`.

### Manifest VS Code (package.json)

- `activationEvents` : `onLanguage`, `onUri`, `onStartupFinished`,
  `workspaceContains:evals.env`. L'activation est quasi-systématique.
- 21 commandes namespacées `dirac.*` (legacy — branding produit = "ailiance-agent",
  préfixe id = `dirac.`). Câblage dans `extension.ts` puis dispatch vers
  `core/controller/commands/` et `core/controller/ui/subscribeTo*`.
- Une vue webview unique `dirac.SidebarProvider` dans le container activitybar
  `dirac-ActivityBar`. Implémentée par `VscodeDiracWebviewProvider`
  (`hosts/vscode/VscodeWebviewProvider.ts`).
- URI handler : `SharedUriHandler` (`vscode://...` → tâche).

### Webview ↔ extension

UI React vit dans `../webview-ui/`. Communication via gRPC (protobuf dans
`../proto/`) sérialisé par `hostbridge`. Les events UI (`subscribeTo*`)
publient vers le webview ; les RPC entrants sont routés par
`controller/` vers `core/task/`.

### Path aliases (tsconfig + esbuild)

`@/*` → `src/*`, plus `@api`, `@core`, `@generated`, `@hosts`,
`@integrations`, `@packages`, `@services`, `@shared`, `@utils`. Préférer
les alias aux chemins relatifs profonds.

## Where to Look

| Question | Fichier |
|----------|---------|
| Activation / désactivation extension | `extension.ts` (`activate`, `deactivate`) |
| Init partagée core | `common.ts` (`initialize`, `tearDown`) |
| Liste des contributions VS Code | `package.json` → `contributes` |
| Provider webview latéral | `hosts/vscode/VscodeWebviewProvider.ts` |
| Diff inline éditeur | `hosts/vscode/VscodeDiffViewProvider.ts` |
| Génération commit msg (`dirac.generateGitCommitMessage`) | `hosts/vscode/commit-message-generator.ts` |
| Code actions (Add to chat / Fix / Explain / Improve) | `core/controller/commands/` |
| Migrations storage VS Code → ~/.dirac | `core/storage/state-migrations.ts` + `hosts/vscode/vscode-to-file-migration.ts` |
| Terminal intégré | `hosts/vscode/terminal/VscodeTerminalManager.ts` |
| Boucle agent (cross-platform) | `core/task/` |

## Gotchas

- Si build échoue avec `Cannot find module '@/shared/proto/...'` → relancer
  `npm run protos`. Les `.ts` générés sont gitignorés.
- `noImplicitOverride` strict + `useUnknownInCatchVariables: false`. Lint biome
  bloque `console.*` (utiliser `Logger` de `@/shared/services/Logger`).
- Migrations storage tournent à chaque activate ; idempotentes mais ordre
  important — ne pas réordonner sans relire `extension.ts:60-90`.
- L'id de commande/config legacy `dirac` reste pour compat ascendante des
  installations existantes ; ne pas renommer en `ailiance-agent` sans plan de migration.
- Tests d'intégration ouvrent une vraie instance VS Code → lents, à éviter pour
  du TDD ; préférer `test:unit` qui mocke `HostProvider`.
