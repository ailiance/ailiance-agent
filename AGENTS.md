# ISAAC Agent Guide

This is the codebase of our coding agent **ISAAC** (Intelligence Souveraine
Ailiance Agent Codeur). It ships as a VS Code extension and a standalone CLI
(binary `isaac`).

## 🏗️ Codebase Modules
- `src/core/task/`: Task execution loop and state management.
- `src/core/task/tools/`: Tool implementations (handlers).
- `src/core/prompts/`: System and tool prompt templates.
- `src/core/controller/`: High-level extension coordination and state.
- `src/core/context/`: Context gathering and management.
- `src/core/slash-commands/`: Slash command definitions and parsing.
- `src/integrations/`: Terminal, Browser, and Editor API wrappers.
- `src/services/`: Shared services (Logging, Telemetry, Tree-sitter, local-router).
- `src/shared/`: Cross-component types and utilities.
- `webview-ui/`: React-based frontend.
- `cli/`: TypeScript/Ink CLI (binary `isaac`).

## 📂 Important Files
- `src/extension.ts`: Extension entry point.
- `src/core/task/index.ts`: Main task logic.
- `src/shared/tools.ts`: Tool registry.
- `proto/isaac/`: Protocol Buffer definitions (host/webview/CLI gRPC).
- `package.json`: Project dependencies and scripts.

## 🔌 API Providers
The provider surface is intentionally slim: ISAAC routes through a local
gateway (`src/services/local-router/`) plus a small set of direct providers.
- Provider Handlers: `src/core/api/providers/`
  - Implementations: `openai.ts`, `openrouter.ts`, `litellm.ts`, `lmstudio.ts`,
    `vscode-lm.ts` (plus their `*-registry.ts` model lists).
  - Each handler implements the `ApiHandler` interface defined in
    `src/core/api/index.ts`.
- API Factory: `src/core/api/index.ts`
  - `buildApiHandler` / `createHandlerForProvider` instantiate the correct
    handler based on user configuration (falls back to `openai`).
- Model Metadata: `src/shared/api.ts`
  - Central location for model IDs, pricing, and capability flags (e.g.,
    `supportsImages`, `supportsThinking`).
- Stream Handling: `src/core/api/transform/`
  - Logic for transforming various provider stream formats into ISAAC's
    internal `ApiStream`.

## 🛠️ Dev Flow
- Setup: `npm run install:all`
- Protobufs: `npm run protos` (required before any build / type-check)
- Type-check: `npm run check-types`
- Compile extension: `npm run compile`
- Build CLI: `npm run cli:build`
- Test: `npm test` (or `npm run test:unit` for fast unit-only)
- Lint: `npm run lint`

## Note on grep/search
Avoid searching in the following directories as they contain large generated
files or binary data that will result in irrelevant matches:
- `node_modules/`
- `dist/`
- `build/`
- `.git/`
- `out/`
- `src/generated/` (Generated from protos)
- `src/shared/proto/` (Generated from protos)
