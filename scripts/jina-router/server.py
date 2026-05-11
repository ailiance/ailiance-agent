"""
Jina semantic router for ailiance-agent.
Embeds incoming queries, classifies intent, forwards to LiteLLM proxy.
"""
import os
import json
import asyncio
import httpx
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
import numpy as np
from sentence_transformers import SentenceTransformer

LITELLM_URL = os.environ.get("LITELLM_URL", "http://127.0.0.1:4000")
LITELLM_API_KEY = os.environ.get("LITELLM_API_KEY", "sk-aki-local-master-key")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "jinaai/jina-embeddings-v2-small-en")
ROUTES_FILE = os.environ.get("ROUTES_FILE", os.path.expanduser("~/.aki/jina-router/routes.json"))

# Categories with example queries — embedded once at startup
DEFAULT_ROUTES = {
    "code": {
        "examples": [
            "refactor this function",
            "fix the bug in this code",
            "implement a new feature",
            "explain this algorithm",
            "write unit tests",
        ],
        "preferred_model": "claude-sonnet-4-5",
    },
    "chat": {
        "examples": [
            "hello",
            "how are you",
            "tell me a joke",
            "explain quantum physics",
        ],
        "preferred_model": "claude-haiku-4-5",
    },
    "search": {
        "examples": [
            "find documentation about",
            "search for examples of",
            "look up the API for",
        ],
        "preferred_model": "gpt-4o",
    },
    "agent": {
        "examples": [
            "use the read_file tool",
            "execute this command",
            "browse this URL",
            "list files in directory",
        ],
        "preferred_model": "claude-opus-4-5",
    },
}

class RouterState:
    def __init__(self):
        self.embed_model: Optional[SentenceTransformer] = None
        self.route_centroids: dict[str, np.ndarray] = {}
        self.routes: dict[str, dict] = DEFAULT_ROUTES

state = RouterState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load embeddings model
    state.embed_model = SentenceTransformer(EMBED_MODEL, trust_remote_code=True)
    # Load custom routes if present
    if os.path.exists(ROUTES_FILE):
        with open(ROUTES_FILE) as f:
            state.routes = json.load(f)
    # Compute centroids per category
    for name, route in state.routes.items():
        embeds = state.embed_model.encode(route["examples"])
        state.route_centroids[name] = embeds.mean(axis=0)
    yield

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    return {"status": "ok", "model": EMBED_MODEL, "routes": list(state.routes.keys())}

def classify(query: str) -> tuple[str, float, str]:
    """Return (category, score, preferred_model)."""
    if not state.embed_model or not state.route_centroids:
        return ("chat", 0.0, list(DEFAULT_ROUTES.values())[0]["preferred_model"])
    query_embed = state.embed_model.encode(query)
    best_name = "chat"
    best_score = -1.0
    for name, centroid in state.route_centroids.items():
        sim = float(np.dot(query_embed, centroid) / (np.linalg.norm(query_embed) * np.linalg.norm(centroid)))
        if sim > best_score:
            best_score = sim
            best_name = name
    return (best_name, best_score, state.routes[best_name]["preferred_model"])

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    last_user = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    if isinstance(last_user, list):
        last_user = " ".join(p.get("text", "") for p in last_user if p.get("type") == "text")

    category, score, picked_model = classify(last_user or "")
    # Override only if no model explicitly set or if "auto"
    if not body.get("model") or body.get("model") == "auto":
        body["model"] = picked_model

    headers = {
        "Authorization": f"Bearer {LITELLM_API_KEY}",
        "Content-Type": "application/json",
        "X-Aki-Router-Category": category,
        "X-Aki-Router-Score": f"{score:.3f}",
        "X-Aki-Router-Picked": picked_model,
    }

    # Stream-aware forwarding
    async with httpx.AsyncClient(timeout=600.0) as client:
        if body.get("stream"):
            async def gen():
                async with client.stream("POST", f"{LITELLM_URL}/v1/chat/completions", json=body, headers=headers) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk
            return StreamingResponse(gen(), media_type="text/event-stream", headers={
                "X-Aki-Router-Category": category,
                "X-Aki-Router-Picked": picked_model,
            })
        else:
            resp = await client.post(f"{LITELLM_URL}/v1/chat/completions", json=body, headers=headers)
            return JSONResponse(content=resp.json(), status_code=resp.status_code, headers={
                "X-Aki-Router-Category": category,
                "X-Aki-Router-Picked": picked_model,
            })

@app.get("/v1/models")
async def list_models():
    """Forward LiteLLM model list."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{LITELLM_URL}/v1/models", headers={"Authorization": f"Bearer {LITELLM_API_KEY}"})
        return JSONResponse(content=resp.json(), status_code=resp.status_code)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "5050"))
    uvicorn.run(app, host="127.0.0.1", port=port)
