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

## Troubleshooting

- **`aki stack install` fails on Python**: install via `brew install uv` (recommended) or `brew install python@3.11`
- **Slow first start of router**: it downloads the embeddings model from Hugging Face (~80 MB). Subsequent starts are instant.
- **Provider returns 401**: set `liteLlmApiKey` in aki to match the master key in `~/.aki/litellm/config.yaml`
- **Logs**: `~/.aki/litellm.log` and `~/.aki/jina-router.log`
