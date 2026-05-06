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

### Act triggers (must be ≤80 chars)

Quick conversational/action prompts:
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
