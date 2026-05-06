# Local LLM Stack: LiteLLM proxy + Jina semantic router

agent-kiki can run a local stack that routes LLM requests intelligently:

```
aki  →  Jina router (:5050)  →  LiteLLM proxy (:4000)  →  endpoints
```

## Quick start

```bash
# 1. Install (creates Python venvs in ~/.aki/)
aki stack install

# 2. Start
aki stack start

# 3. Configure aki to use the local stack
# Edit your aki settings (or pass via VS Code config):
#   apiProvider: "litellm"
#   liteLlmBaseUrl: "http://127.0.0.1:5050"
#   liteLlmApiKey: "sk-aki-local-master-key"
#   liteLlmModelId: "auto"   # let the router pick

# 4. Verify
aki stack status

# 5. Stop when done
aki stack stop
```

## Architecture

### LiteLLM proxy (port 4000)

- Multiplexing across providers (Anthropic, OpenAI, Ollama, eu-kiki workers)
- Native fallback, retry, cost tracking, response cache
- Config: `~/.aki/litellm/config.yaml`
- RAM: ~300 MB
- Edit the config to add/remove models. Required env vars: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.

### Jina semantic router (port 5050)

- Embeds incoming queries via `jinaai/jina-embeddings-v2-small-en` (~80 MB model, ~150 MB RAM)
- Classifies intent into: `code`, `chat`, `search`, `agent`
- Picks the preferred model per category (configurable)
- Forwards to LiteLLM with the chosen model
- Routes config: `~/.aki/jina-router/routes.json`
- RAM: ~150 MB

Total local RAM: **~450 MB**.

## Custom routes

Edit `~/.aki/jina-router/routes.json`:

```json
{
  "code": {
    "examples": ["refactor this", "fix the bug"],
    "preferred_model": "claude-sonnet-4-5"
  },
  "embedded": {
    "examples": ["esp32 code", "kicad schematic"],
    "preferred_model": "qwen-coder-32b"
  }
}
```

The router computes the centroid embedding per category and picks the closest one to the user query.

## Bypass the router (use proxy directly)

If you don't want semantic routing:

```bash
aki proxy start                    # only the LiteLLM proxy
# liteLlmBaseUrl: "http://127.0.0.1:4000"
```

## Filtering MCP servers and tools

Edit your aki `settings.json` (workspace or global):

```json
{
  "enabledMcpServers": ["claude-mem", "context7"],
  "mcpToolDenylist": ["mcp__some_plugin__dangerous_tool"]
}
```

- `enabledMcpServers`: only these MCP servers from plugins will be loaded. Omit or set `null` to load all (default).
- `mcpToolDenylist`: qualified tool names (`mcp__plugin_server__tool`) to exclude even if the server is enabled.
- `mcpToolAllowlist`: if set, only these tools are exposed — overrides `mcpToolDenylist`.

All three settings are optional. Without them, all plugin MCP servers and all their tools are available.

## Auto-detect (zero-config)

Once you've started the stack with `aki stack start`, enable auto-detect in your settings:

```json
{
  "useLocalStack": true
}
```

Now whenever the LiteLLM provider is used, aki will:
1. Check if the local stack is running
2. If yes → route via the Jina router (port 5050) automatically
3. If no → fall back to your `liteLlmBaseUrl` setting

You don't need to update `liteLlmBaseUrl` to switch between local stack mode and remote LiteLLM mode.

To disable, set `useLocalStack: false` (or omit) and aki uses `liteLlmBaseUrl` as before.

> Detection results are cached for 30 seconds — no per-request port scan overhead.

## Mode "speed" : LocalRouter natif

Au lieu de passer par le stack Python (LiteLLM proxy + Jina router), aki
embed un mini-routeur in-process qui :
- Cache les réponses LLM (LRU 100 entries, TTL 1h)
- Ping les workers en arrière-plan toutes les 30s (skip ceux DOWN)
- Classifie les prompts par heuristic (code/fr/reason/general) et choisit
  le meilleur worker dispo

Activation :

```json
{
  "useLocalRouter": true
}
```

Pas besoin de `aki stack install/start` — le LocalRouter est embarqué.

Pour configurer tes propres workers :

```json
{
  "useLocalRouter": true,
  "localRouterWorkers": [
    {
      "id": "my-mlx",
      "url": "http://my-mac.tailscale.ts.net:8080/v1",
      "modelId": "qwen-coder-32b",
      "capabilities": ["code", "general"],
      "priority": 10
    }
  ]
}
```

**Limitations PR2** : le LocalRouter ne prend en charge que les messages texte
(pas d'images, pas de tool_calls). Les messages avec blocs non-texte
et le streaming passent automatiquement par le proxy HTTP classique.
PR3 ajoutera le streaming via LocalRouter si demandé.

## Troubleshooting

- **`aki stack install` fails on Python**: install via `brew install uv` (recommended) or `brew install python@3.11`
- **Slow first start of router**: it downloads the embeddings model from Hugging Face (~80 MB). Subsequent starts are instant.
- **Provider returns 401**: set `liteLlmApiKey` in aki to match the master key in `~/.aki/litellm/config.yaml`
- **Logs**: `~/.aki/litellm.log` and `~/.aki/jina-router.log`

## Alternative: in-process LocalRouter

For most users, `aki` ships with an **in-process LocalRouter** that
provides similar features (multi-worker dispatch, cache, health monitoring)
without requiring Python sub-processes. See [docs/local-router.md](./local-router.md)
for details.

| Use the local stack when... | Use LocalRouter when... |
|---|---|
| You want LiteLLM's 100+ provider list | You target EU-kiki workers (Gemma/Apertus/EuroLLM) |
| You need cost tracking, retries, complex fallback | You need lowest latency overhead |
| You prefer external services to monitor independently | You want zero install (no Python) |

## Qwen3-Next 80B-A3B (kxkm-ai, port 18888 → gateway :8002)

Primary tool-capable worker for agentic requests. Launched manually via
llama-server (no systemd unit). Tunnel: autossh `electron-server:8002` →
`kxkm-ai:18888`. Exposed by the eu-kiki gateway on `:9300` when `tools[]`
is present.

```bash
cd /home/kxkm
./llama.cpp/build/bin/llama-server \
  -m models/Qwen3-Next-80B-A3B-Instruct-Q4_K_M.gguf \
  -ngl 99 \
  --override-tensor "ffn_(up|gate|down)_exps\.weight=CPU" \
  --ctx-size 196608 \
  -fa on -b 512 -ub 256 \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  -np 1 --reasoning-format none \
  --host 0.0.0.0 --port 18888 \
  --api-key <key> --alias qwen-32b-awq \
  --jinja --metrics
```

| Ctx | KV cache | VRAM used | Free margin (24 GB RTX 4090) |
|-----|----------|-----------|------------------------------|
| 32k | ~3-4 GB | ~7 GB | 17 GB |
| 65k | ~7 GB | ~9 GB | 15 GB |
| 128k | ~14 GB | ~14 GB | 10 GB |
| **192k (current)** | ~17 GB | ~8 GB | 16 GB |
| 256k | OOM | — | — |

With MoE A3B + `--override-tensor FFN→CPU`, only attention layers remain in
VRAM. KV cache is also compressed to q8, so VRAM stays low (~8 GB) even at
192k. Throughput: ~31 tok/s output, ~92 tok/s prompt.

`useAutoCondense: true` (default) triggers a conversation history summary
when approaching the context limit, so practical usage fits well within 192k.
