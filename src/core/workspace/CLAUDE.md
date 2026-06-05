# Workspace

Résolution multi-root core : workspace roots, chemins relatifs/absolus, working dir agent.

## Files

| Fichier | Rôle |
|---------|------|
| `WorkspaceRootManager.ts` | Manager central des roots. `fromLegacyCwd` (33), `resolvePathToRoot` (longest-match nested, 100), `getRelativePathFromRoot` (137), `buildWorkspacesJson` pour env details (226), `toJSON`/`fromJSON` persistence (160-171) |
| `WorkspaceResolver.ts` | Tracer Phase 0 → résolution Phase 1+. `resolveWorkspacePath` dispatch string vs roots[] (58), `resolveAbsolutePath`/`resolveRelativePath` (120/138), `selectBestRoot` disambig (162). Singleton `workspaceResolver` (254), export `resolveWorkspacePath(config)` (282) |
| `WorkspacePathAdapter.ts` | Interface unifiée single/multi. `resolvePath` + hint (31), `getAllPossiblePaths` (95), `getRelativePath` (144), `getWorkspaceForPath` (112) |
| `setup.ts` | `setupWorkspaceManager` : init + persist + télémétrie + fallback (20). `detectRoots` injecté (découplage Controller) |
| `detection.ts` | `detectVcs` (Git only, 11), `detectWorkspaceRoots` via `HostProvider.workspace` avec fallback cwd (24) |
| `multi-root-utils.ts` | `isMultiRootEnabled(stateManager)` lit `multiRootEnabled` global state (11) |
| `MigrationReporter.ts` | Formatage rapports usage Phase 0 (txt/JSON/CSV). Hors hot path |
| `index.ts` | Barrel exports module (`@core/workspace`) |

## Subdirs

| Path | Rôle |
|------|------|
| `utils/parseWorkspaceInlinePath.ts` | Syntaxe hint `@workspace:path` → `{workspaceHint, relPath}` (33). Regex `^@([^:]+):(.*)$` (43) |
| `utils/workspace-detection.ts` | `isMultiRootWorkspace` : compte brut des folders host (>1), indép. du feature flag (20) |
| `__tests__/` | Mocha co-localisé : Resolver, Adapter, parse, setup |

## Pattern

- **Root detection** : `HostProvider.workspace.getWorkspacePaths()` ; si vide → fallback `getCwd(getDesktopDir())`. VCS détecté par root (Git via `isGitRepository`).
- **Primary root** : index (def 0), clampé constructeur (23). Resolver multi-root retombe sur `roots[0]` si aucun match.
- **Relatif → absolu** : single = `path.resolve(cwd, rel)`. Multi = `path.join(root.path, rel)` après sélection. Absolu déjà résolu, juste mappé à son root (`startsWith`).
- **Nested roots** : `resolvePathToRoot` trie par longueur de path décroissante (longest wins) pour roots imbriqués.
- **Hint** : `@name:path` ciblage explicite ; résolu par nom, sinon par path partiel, sinon primary.
- **Activation** : single-root par défaut. Multi gated par `isMultiRootEnabled` (global state `multiRootEnabled`). Persist `workspaceRoots` + `primaryRootIndex`.

## Gotchas

- **Phase 0** : `resolveRelativePath` ajoute TOUS les roots comme candidats (check d'existence non implémenté, 144-149) → disambig effective = primary-or-first. Pas de vraie résolution par présence fichier.
- `setup.ts` : bloc single-root depuis `historyItem`/state sauvegardé commenté (55-76) — restore inactif, toujours `fromLegacyCwd`.
- Deux `detectVcs` : statique privé `WorkspaceRootManager` (execa git+hg, 47) vs `detection.ts` (Git only). Le manager teste hg, `detection.ts` non.
- `resolvePathToRoot` utilise `startsWith` brut — pas de garde séparateur (`/foo` vs `/foobar`). Pas de normalisation casse/trailing-slash.
- `MULTI_ROOT_TRACE=true` ou `NODE_ENV=development` active le tracing Resolver.
- Détection des folders = côté plateforme (`HostProvider.workspace`) ; ce module n'énumère pas le FS lui-même.
