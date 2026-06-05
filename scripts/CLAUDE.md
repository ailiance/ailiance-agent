# Scripts

Build, packaging, génération de code (proto/stubs) et setup. Mélange `.sh` / `.mjs` /
`.ts` / `.js` ; lancés via les scripts npm racine (voir `package.json`) ou à la main.

## Setup (cross-platform)

Entry-point canonique = **`../setup.sh`** (racine du repo) pour macOS/Linux/WSL ;
ce dossier n'héberge que la variante Windows.

| Fichier | Rôle |
|---------|------|
| `setup.ps1` | Setup Windows (PowerShell 7+, params `-Ext`/`-All`/`-DepsOnly`/`-NoLink`). Le `../setup.sh` racine y route quand un shell Windows (MINGW/MSYS/Cygwin) est détecté. Avertit pour VS Build Tools (natifs) |

## Génération de code (proto / hostbridge)

| Fichier | Rôle |
|---------|------|
| `build-proto.mjs` | `npm run protos`. Génère `src/generated/` + `src/shared/proto/` depuis `proto/`. OBLIGATOIRE avant tout build |
| `generate-host-bridge-client.mjs`, `generate-protobus-setup.mjs`, `generate-state-proto.mjs` | Sous-générateurs invoqués par le pipeline proto |
| `build-python-proto.mjs`, `generate-stubs.js`, `vscode-mock.cjs` | Stubs Python / tests / mock `vscode` |
| `proto-lint.sh`, `proto-utils.mjs`, `proto-shared-utils.mjs` | Lint + helpers proto |

## Build & packaging

| Fichier | Rôle |
|---------|------|
| `package-standalone.mjs`, `copy-source.mjs` | Bundle standalone (core hors extension) |
| `package-npm.mjs`, `package-cli.sh` | Tarball CLI par plateforme (`package-cli.sh` produit `isaac-*.tar.gz`, binaire `isaac`) |
| `build-cli-artifact.sh` | Déclenche le workflow GH `pack-cli.yml` (release assets `isaac-<platform>.tar.gz` sur `ailiance/isaac-cli`) |
| `download-ripgrep.mjs` | Récupère `@vscode/ripgrep` par plateforme |
| `add-endpoints-to-{npm,vsix,jetbrains}.sh`, `test-bundled-endpoints.sh` | Injection/tests des endpoints bundlés |
| `publish-nightly.mjs` | Publication nightly |

## Dev / run / tests

| Fichier | Rôle |
|---------|------|
| `run-extension-host.sh`, `rundiraccore.sh` | Lancent l'Extension Host / le core standalone |
| `build-tests.js`, `test-hostbridge-server.ts`, `test-standalone-core-api-server.ts`, `testing-platform-orchestrator.ts`, `interactive-playwright.ts` | Harnais de tests |
| `extract-definition.ts`, `find-references.ts`, `read-lines.ts`, `list-tools.ts`, `print-prompt.ts`, `report-issue.js`, `api-secrets-parser.mjs` | Outils dev ponctuels |
| `get-vscode-usages.sh` | Liste les imports `vscode` directs (cf boundary host-agnostic, `src/CLAUDE.md`) |
| `jina-router/` | Assets du service jina-router |

## Gotchas

- **`install.sh` = résidu Dirac mort** : télécharge un binaire pré-buildé `dirac` depuis
  `dirac-run/dirac` (release inexistante côté ailiance), branding 100 % Dirac, mac/linux only,
  aucun check node. **Ne pas l'utiliser** pour isaac — préférer `setup.sh`/`setup.ps1`.
  `test-install.sh` ne fait que valider sa syntaxe.
- **Branding** : `package-cli.sh`, `build-cli-artifact.sh`, `package-npm.mjs`,
  `report-issue.js`, `test-bundled-endpoints.sh`, `run-extension-host.sh` rebrandés
  `isaac`/`ailiance`. Reste `install.sh` (mort, voir ci-dessus) non rebrandé.
- **Ordre proto** : `build-proto.mjs` doit tourner avant `compile`/`cli:build`. Les `.ts`
  générés sont gitignorés → `Cannot find module '@/shared/proto/...'` = protos manquants.
- **Pas de `build` racine** : extension = `protos` + `compile` ; CLI = `cli:build` (inclut protos).
- **Natifs** : `better-sqlite3` + ripgrep résolus à l'install (optionalDependency par plateforme) ;
  sur Windows, build node-gyp → VS Build Tools requis.
