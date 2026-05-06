# docs — Notes & MVP acceptance

Documentation versionnée : notes acceptance MVP, comparaisons providers, journaux de release.

## Convention

- Acceptance MVP : `mvp-acceptance-YYYY-MM-DD[-vX.Y].md`
- Notes provider : `providers/<name>.md`
- Format : Markdown, FR pour conversation/contexte, EN pour outputs techniques (logs, traces).

## Règles

- **Dater toute note** (préfixe ou frontmatter) — les notes non datées sont des règles, pas des acceptance.
- Liens vers commits SHA quand on cite un fix (`commit abc1234`).
- Captures de logs : tronquer secrets, slugs `task_id`, et chemins absolus user.
- Si une note devient obsolète : déplacer vers `docs/_archive/` (ne pas supprimer — historique acceptance).

## Anti-patterns

- Ne pas mettre de procédures projet ici → root `CLAUDE.md` ou `CONTRIBUTING.md`.
- Ne pas dupliquer `README.md` — les docs sont incrémentales / historiques.
- Ne pas commit des outputs eval-harness bruts (gros) — résumer + lien vers `.aki/traces/`.
