# Auto Plan/Act Mode

When `autoModeFromPrompt: true` is set in aki settings, the mode (Plan or
Act) is automatically chosen based on the user prompt at each task start.

## Activation

```json
{
  "autoModeFromPrompt": true
}
```

(default: `false` — opt-in)

## Heuristics

The first user message is classified by `AutoModeSelector.classify()`:

### Plan triggers

Strong signals that suggest reflection/analysis is needed:
- Keywords: `plan`, `architecte`, `architecture`, `design`, `conçois`,
  `propose`, `roadmap`, `redesign`
- Reflection: `réfléchis`, `réflexion`
- Review: `audit`, `review`, `passe en revue`
- Refactor: `refactor`, `refacto`
- Multi-file: `tous les fichiers`, `chaque test`, `dans tout le projet`
- Question: `comment ferais-tu`

### Act triggers — imperative verbs (no length limit)

Strong action intent words that always switch to Act mode regardless of prompt length:
- `fais`, `fait`, `écris`, `ajoute`, `réalise`, `génère`, `construis`, `implémente`

Example: `"fais la structure de dossier complète pour ce projet en esp-idf et kicad"` → **ACT**
(Previously ≤80 chars would have been required; imperative verbs bypass this cap.)

### Act triggers — soft action (must be ≤120 chars)

Quick conversational/action prompts (cap raised from 80 → 120 chars in v0.5):
- Greetings: `bonjour`, `salut`, `hello`, `hi`, `merci`, `thanks`
- Actions: `liste`, `montre`, `affiche`, `lis`, `ouvre`, `crée`,
  `lance`, `exécute`, `read`, `list`, `show`, `open`, `run`

### No signal

If neither plan nor act heuristics match, the current mode is preserved.

## Behavior

- Applied **only at task start** (not at each turn)
- Manual Tab toggle is respected for the rest of the session
- Logged to `~/.dirac/data/logs/dirac.*.log` with `[AutoMode] switching to <mode>`

## See also

- [`src/core/task/AutoModeSelector.ts`](../src/core/task/AutoModeSelector.ts) — heuristic source
