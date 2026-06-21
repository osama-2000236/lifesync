"""CPU fallback HTTP runtime for LifeSync BERT intent classifier."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import statistics
import threading
import time
from collections import deque
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


class Runtime:
    def __init__(self, model_dir: Path, threads: int):
        self.model_dir = model_dir.resolve()
        torch.set_num_threads(threads)
        torch.set_num_interop_threads(1)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir, local_files_only=True)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_dir, local_files_only=True).eval()
        self.started_at = time.time()
        self.latencies = deque(maxlen=1000)
        self.requests = 0
        self.metrics_lock = threading.Lock()
        self.inference_lock = threading.Lock()
        self.sha256 = self._sha256(self.model_dir / "model.safetensors")
        self.classify("runtime warmup")
        self.requests = 0
        self.latencies.clear()

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def classify(self, text: str) -> dict:
        encoded = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        started = time.perf_counter()
        with self.inference_lock, torch.inference_mode():
            logits = self.model(**encoded).logits[0]
        probabilities = torch.softmax(logits, dim=-1)
        index = int(probabilities.argmax())
        latency_ms = (time.perf_counter() - started) * 1000
        with self.metrics_lock:
            self.requests += 1
            self.latencies.append(latency_ms)
        return {
            "label": self.model.config.id2label[index],
            "label_id": index,
            "confidence": round(float(probabilities[index]), 6),
            "scores": {
                self.model.config.id2label[i]: round(float(probability), 6)
                for i, probability in enumerate(probabilities)
            },
            "latency_ms": round(latency_ms, 3),
            "provider": "pytorch_cpu",
            "model": self.model_dir.name,
        }

    def status(self) -> dict:
        with self.metrics_lock:
            values = sorted(self.latencies)
            requests = self.requests
        p95_index = min(len(values) - 1, max(0, int(len(values) * 0.95 + 0.999) - 1)) if values else None
        return {
            "status": "ready",
            "model": self.model_dir.name,
            "architecture": self.model.config.architectures[0],
            "task": self.model.config.problem_type,
            "labels": [self.model.config.id2label[i] for i in sorted(self.model.config.id2label)],
            "provider": "pytorch_cpu",
            "available_providers": ["pytorch_cpu"],
            "artifact_sha256": self.sha256,
            "parameter_count": sum(parameter.numel() for parameter in self.model.parameters()),
            "threads": torch.get_num_threads(),
            "requests": requests,
            "mean_latency_ms": round(statistics.mean(values), 3) if values else None,
            "p95_latency_ms": round(values[p95_index], 3) if p95_index is not None else None,
            "uptime_seconds": round(time.time() - self.started_at, 1),
        }


class Handler(BaseHTTPRequestHandler):
    runtime: Runtime

    def send_json(self, status: int, body: dict):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path in {"/health", "/v1/status"}:
            self.send_json(HTTPStatus.OK, self.runtime.status())
        else:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/v1/classify":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 16_384:
                raise ValueError("invalid_content_length")
            body = json.loads(self.rfile.read(length))
            text = body.get("text")
            if not isinstance(text, str) or not text.strip():
                raise ValueError("text_required")
            if len(text) > 2000:
                raise ValueError("text_too_long")
            self.send_json(HTTPStatus.OK, self.runtime.classify(text.strip()))
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception as error:
            print(f"Inference error: {error}")
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": type(error).__name__})

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("bert_best_model_10pct"))
    parser.add_argument("--host", default=os.getenv("BERT_RUNTIME_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("BERT_RUNTIME_PORT", "1235")))
    parser.add_argument("--threads", type=int, default=int(os.getenv("BERT_CPU_THREADS", "6")))
    args = parser.parse_args()
    runtime = Runtime(args.model, args.threads)
    Handler.runtime = runtime
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(json.dumps(runtime.status(), indent=2))
    print(f"Listening: http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
