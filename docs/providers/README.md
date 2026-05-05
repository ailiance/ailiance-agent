# Provider-Specific Settings

This document details the environment variables and configuration options for specific AI providers in Dirac.

## AWS Bedrock

Use Bedrock by setting AWS credentials and region. When `AWS_ACCESS_KEY_ID` or `AWS_BEDROCK_MODEL` is present, Dirac automatically switches to the Bedrock provider.

### Environment Variables

- `AWS_ACCESS_KEY_ID` — AWS access key
- `AWS_SECRET_ACCESS_KEY` — AWS secret key
- `AWS_SESSION_TOKEN` — session token (for temporary credentials)
- `AWS_REGION` — AWS region (e.g. `us-east-1`). Note: `AWS_REGION` alone will not trigger an automatic switch to Bedrock.
- `AWS_BEDROCK_MODEL` — model ID for both act and plan modes (e.g. `us.anthropic.claude-sonnet-4-6`)
- `AWS_BEDROCK_MODEL_ACT` — model ID for act mode only
- `AWS_BEDROCK_MODEL_PLAN` — model ID for plan mode only

### Usage Example

Works seamlessly with [aws-vault](https://github.com/99designs/aws-vault):

```bash
AWS_REGION=us-east-1 AWS_BEDROCK_MODEL=us.anthropic.claude-sonnet-4-6 \
  aws-vault exec my-profile -- dirac "your task"
```

> **Note:** Newer Claude models on Bedrock (Sonnet 4.6+) require a cross-region inference profile prefix (`us.`, `eu.`, `ap.`). See the [AWS docs](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html) for supported model IDs.

## Google Cloud Vertex AI

Use Vertex AI by setting the following environment variables. When `GOOGLE_CLOUD_PROJECT` or `GCP_PROJECT` is present, Dirac automatically switches to the Vertex provider.

### Environment Variables

- `GOOGLE_CLOUD_PROJECT` or `GCP_PROJECT` — Your Google Cloud project ID.
- `GOOGLE_CLOUD_LOCATION` or `GOOGLE_CLOUD_REGION` — The region for Vertex AI (e.g. `us-central1`).

### Authentication

Dirac uses the default Google Cloud authentication chain. Ensure you have authenticated using the Google Cloud CLI:

```bash
gcloud auth application-default login
```

## Local MLX (Apple Silicon, mlx_lm.server)

Dirac connects to any OpenAI-compatible local server through the **`openai`** provider. `mlx_lm.server` (from [mlx-lm](https://github.com/ml-explore/mlx-lm)) exposes the standard `/v1/chat/completions` endpoint, so no extra code is needed — just configure the base URL.

### Prerequisites

```bash
# 1. Install mlx-lm globally
uv tool install mlx-lm

# 2. Download a model (example: Qwen 3.6 35B-A3B 4-bit, ~20 GB)
uv tool install --upgrade huggingface-hub --with hf-transfer
HF_HUB_ENABLE_HF_TRANSFER=1 hf download mlx-community/Qwen3.6-35B-A3B-4bit \
  --local-dir ~/models/Qwen3.6-35B-A3B-4bit

# 3. Launch the server (port 8080, no reasoning trace for fastest replies)
mlx_lm.server \
  --model ~/models/Qwen3.6-35B-A3B-4bit \
  --host 127.0.0.1 \
  --port 8080 \
  --chat-template-args '{"enable_thinking": false}'
```

### Configuration

In Dirac (UI or `dirac config`), select the **`openai`** provider with:

| Field | Value |
|---|---|
| Provider | `openai` (OpenAI Compatible) |
| Base URL | `http://127.0.0.1:8080/v1` |
| API Key | `noop` (any non-empty string — server does not validate) |
| Model ID | full path, e.g. `/Users/you/models/Qwen3.6-35B-A3B-4bit` (use `GET /v1/models` to confirm) |

### Smoke test

```bash
curl -s http://127.0.0.1:8080/v1/models | jq .data[].id
curl -s -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"<full-path-from-above>","messages":[{"role":"user","content":"reply ok"}],"max_tokens":10}'
```

### Notes

- **M1 Max 32 GB** runs Qwen 3.6 35B-A3B 4-bit (~20 GB peak) at ~67 tok/s with `enable_thinking: false`.
  Avoid thinking mode + long generations on this hardware: activations + KV cache exceed 32 GB and Metal will OOM.
- `mlx_lm.server` returns OpenAI-compatible streaming when `stream: true`, so Dirac's `OpenAiHandler` works as-is.
- Tool calling: requires the model to natively support OpenAI tool format. Qwen 3+ and Mistral 3+ are good defaults.

## eu-kiki Gateway (EU-Sovereign Stack)

The [eu-kiki](https://github.com/L-electron-Rare/eu-kiki) gateway routes prompts to one of three EU/Swiss foundation models (Apertus 70B / Devstral 24B / EuroLLM 22B) via a Jina v3 domain classifier and exposes an OpenAI-compatible API. Connecting Dirac to it gives a fully on-premise, EU-sovereign coding agent.

### Prerequisites

The gateway must be running on a machine with enough memory to hold the EU-KIKI worker stack (~200+ GB unified memory recommended for BF16; quantized variants are smaller). Default ports:

| Service | Port |
|---|---|
| Gateway (OpenAI surface) | `9300` |
| Apertus worker | `9301` |
| Devstral worker | `9302` |
| EuroLLM worker | `9303` |

```bash
# On the gateway host (Mac Studio, Linux server, etc.)
cd eu-kiki
bash scripts/start.sh   # or your own launcher
curl -s http://localhost:9300/health
# {"status":"ok","router_loaded":true,"uptime_s":...,"domains":40}
```

### Configuration

| Field | Value |
|---|---|
| Provider | `openai` (OpenAI Compatible) |
| Base URL | `http://<gateway-host>:9300/v1` |
| API Key | `noop` (gateway does not validate; protect with a reverse proxy if exposed) |
| Model ID | one of `eu-kiki`, `eu-kiki-apertus`, `eu-kiki-devstral`, `eu-kiki-eurollm` |

The bare `eu-kiki` model id triggers the Jina classifier, which dispatches to the most relevant adapter for the prompt. The three explicit names bypass the router and target a specific worker.

### Smoke test

```bash
curl -s http://<host>:9300/v1/models | jq .data[].id
# eu-kiki, eu-kiki-apertus, eu-kiki-devstral, eu-kiki-eurollm

curl -s -X POST http://<host>:9300/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"eu-kiki-devstral","messages":[{"role":"user","content":"reply ok"}],"max_tokens":10}'
```

### Notes

- Use `eu-kiki-devstral` for code, `eu-kiki-apertus` for hardware/embedded reasoning, `eu-kiki-eurollm` for multilingual chat. The `eu-kiki` umbrella id picks one automatically.
- All three workers expose the same `/v1/chat/completions` shape; the gateway forwards `req.model_dump()` straight through and adds an `X-Lora-Domain` header so the worker can swap LoRA adapters.
- For multi-machine setups, reach the gateway over Tailscale (`http://<tailscale-name>:9300/v1`).
