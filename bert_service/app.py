"""
LifeSync BERT NLP service (FastAPI).

Local, self-hosted NLP engine for LifeSync — runs on CPU or GPU. Exposes the
endpoints the Node backend's `bert` provider calls:

    GET  /                 service info
    GET  /health           liveness + model info
    POST /warmup           force model load (returns model info)
    POST /nlp/parse        { "message": "..." }  -> structured NLP result
    POST /nlp/insights     { "health": [...], "finance": [...] } -> insights

Run:
    uvicorn app:app --host 0.0.0.0 --port 8088
or simply:
    python app.py
"""

from __future__ import annotations

import os
import time

from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel, Field

import nlp_engine
import insights_engine

PORT = int(os.getenv("BERT_SERVICE_PORT", "8088"))
EAGER_LOAD = os.getenv("BERT_EAGER_LOAD", "0").strip().lower() in {"1", "true", "yes", "on"}


@asynccontextmanager
async def lifespan(_app: "FastAPI"):
    if EAGER_LOAD:
        try:
            nlp_engine.warmup()
        except Exception as exc:  # pragma: no cover
            print(f"[bert] eager warmup failed: {exc}")
    yield


app = FastAPI(title="LifeSync BERT NLP", version="1.0.0", lifespan=lifespan)


class ParseRequest(BaseModel):
    message: str = Field(default="", description="User chat message to parse")
    use_model: bool = True
    context: dict = Field(default_factory=dict, description="Optional recent-stats context for advice")


class InsightsRequest(BaseModel):
    health: list[dict] = Field(default_factory=list)
    finance: list[dict] = Field(default_factory=list)
    prev: dict = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)
    use_model: bool = True


@app.get("/")
def root() -> dict:
    return {
        "service": "LifeSync BERT NLP",
        "version": "1.0.0",
        "endpoints": ["/health", "/warmup", "/nlp/parse", "/nlp/insights"],
        "model": nlp_engine.model_info(),
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": nlp_engine.model_info()}


@app.post("/warmup")
def warmup() -> dict:
    info = nlp_engine.warmup()
    return {"status": "ready", "model": info}


@app.post("/nlp/parse")
def parse(req: ParseRequest) -> dict:
    started = time.time()
    result = nlp_engine.parse(req.message, use_model=req.use_model, context=req.context or None)
    result["processing_time_ms"] = round((time.time() - started) * 1000)
    result["model"] = nlp_engine.model_info().get("mode")
    return result


@app.post("/nlp/insights")
def insights(req: InsightsRequest) -> dict:
    started = time.time()
    result = insights_engine.generate(req.model_dump(), use_model=req.use_model)
    result["processing_time_ms"] = round((time.time() - started) * 1000)
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
