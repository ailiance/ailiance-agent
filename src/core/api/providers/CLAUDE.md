# API Providers

~40 handlers concrets implémentant `ApiHandler`. Un fichier par provider.

## Liste

`anthropic`, `openai`, `openai-native`, `openai-codex`, `openai-responses-compatible`, `openrouter`, `bedrock`, `vertex`, `gemini`, `vscode-lm`, `github-copilot`, `claude-code`, `deepseek`, `mistral`, `qwen`, `qwen-code`, `doubao`, `moonshot`, `groq`, `cerebras`, `fireworks`, `together`, `sambanova`, `baseten`, `nebius`, `xai`, `zai`, `litellm`, `lmstudio`, `huggingface`, `requesty`, `vercel-ai-gateway`, `aihubmix`, `dify`, `huawei-cloud-maas`, `minimax`, `nousresearch`, `wandb`.

## Conventional shape

Voir `anthropic.ts:36-64`, `openai.ts:28-43` :

```ts
interface XxxHandlerOptions extends CommonApiHandlerOptions { /* fields */ }

class XxxHandler implements ApiHandler {
  private client: SdkClient | undefined  // lazy
  private options: XxxHandlerOptions

  private ensureClient(): SdkClient { /* lazy init */ }

  @withRetry()
  async *createMessage(systemPrompt, messages, tools?): ApiStream {
    const client = this.ensureClient()
    // … yield ApiStreamChunk[]
  }

  getModel() { return { id, info } }
}
```

## How to add a provider

1. Créer `<name>.ts` avec `XxxHandlerOptions extends CommonApiHandlerOptions` + classe `implements ApiHandler` + `ensureClient()` + `@withRetry() createMessage` + `getModel()`
2. Si shape API différente, ajouter converter dans `../transform/`
3. Enregistrer `case "<name>":` dans `../index.ts:77` switch (mapping plan/act)
4. Ajouter les champs à `ApiConfiguration` (`@shared/api`) en variantes `planMode*` ET `actMode*`
5. Tests sous `__tests__/` (mock pattern : `gemini-mock.test.ts`)

## Cache

Provider-specific :
- Anthropic : betas `1m-context` / `fast-mode` (`anthropic.ts:26,75-78`)
- AWS Bedrock : `awsBedrockUsePromptCache`
- LiteLLM : `liteLlmUsePromptCache`

## Gotchas

- **Lazy client** obligatoire — `buildApiHandler` peut instancier 2× pour clamper thinking budget
- Émettre TOUJOURS un chunk `usage` final (sinon coût/UI cassés)
- Aggregation tool-calls : utiliser `ToolCallProcessor` + `getOpenAIToolParams` (`../transform/tool-call-processor.ts`), ne pas réinventer
- Stocker les options sur `this.options` (sinon `@withRetry` perd `onRetryAttempt`)
- Reasoning : préserver `signature` (Gemini) / `redacted_data` (Anthropic) sinon round-trip casse
- Plan/Act : oublier `planMode*` = bug silencieux (handler reçoit act fields en plan mode)
