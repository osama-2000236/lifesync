"""Local HTTP runtime for LifeSync BERT intent classification."""

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

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer


class IntentRuntime:
    def __init__(self, model_dir: Path, onnx_path: Path, provider: str):
        self.model_dir = model_dir.resolve()
        self.onnx_path = onnx_path.resolve()
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_dir, local_files_only=True)
        self.config = json.loads((self.model_dir / "config.json").read_text(encoding="utf-8"))
        self.id2label = {int(k): v for k, v in self.config["id2label"].items()}
        self.started_at = time.time()
        self.latencies = deque(maxlen=1000)
        self.requests = 0
        self.lock = threading.Lock()
        self.sha256 = self._sha256(self.model_dir / "model.safetensors")
        self.session, self.provider = self._create_session(provider)
        input_shape = self.session.get_inputs()[0].shape
        self.sequence_length = int(input_shape[1]) if len(input_shape) > 1 and isinstance(input_shape[1], int) else 128
        self.chunk_stride = min(
            max(0, int(os.getenv("BERT_CHUNK_STRIDE", "32"))),
            max(0, self.sequence_length - 2),
        )
        self.max_chunks = max(1, int(os.getenv("BERT_MAX_CHUNKS", "16")))
        self.multi_label_threshold = min(
            0.95,
            max(0.35, float(os.getenv("BERT_MULTI_LABEL_THRESHOLD", "0.60"))),
        )
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

    def _options(self) -> ort.SessionOptions:
        options = ort.SessionOptions()
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.enable_mem_pattern = False
        options.intra_op_num_threads = int(os.getenv("BERT_CPU_THREADS", "6"))
        options.inter_op_num_threads = 1
        return options

    def _session_for(self, provider: str) -> ort.InferenceSession:
        providers = (
            [("DmlExecutionProvider", {"device_id": 0}), "CPUExecutionProvider"]
            if provider == "directml"
            else ["CPUExecutionProvider"]
        )
        return ort.InferenceSession(str(self.onnx_path), sess_options=self._options(), providers=providers)

    def _create_session(self, requested: str):
        if requested not in {"auto", "directml", "cpu"}:
            raise ValueError("provider must be auto, directml, or cpu")
        candidates = ["directml", "cpu"] if requested == "auto" else [requested]
        last_error = None
        for candidate in candidates:
            if candidate == "directml" and "DmlExecutionProvider" not in ort.get_available_providers():
                last_error = RuntimeError("DmlExecutionProvider unavailable")
                continue
            try:
                session = self._session_for(candidate)
                # Force first graph execution so auto mode can fall back cleanly.
                probe_shape = session.get_inputs()[0].shape
                probe_length = int(probe_shape[1]) if len(probe_shape) > 1 and isinstance(probe_shape[1], int) else 128
                encoded = self.tokenizer(
                    "provider probe", return_tensors="np", padding="max_length",
                    truncation=True, max_length=probe_length,
                )
                session.run(["logits"], {
                    "input_ids": encoded["input_ids"].astype(np.int64),
                    "attention_mask": encoded["attention_mask"].astype(np.int64),
                    "token_type_ids": encoded["token_type_ids"].astype(np.int64),
                })
                return session, candidate
            except Exception as error:  # provider-specific runtime failure
                last_error = error
        raise RuntimeError(f"No usable execution provider: {last_error}")

    def classify(self, text: str) -> dict:
        started = time.perf_counter()
        encoded = self.tokenizer(
            text,
            return_tensors="np",
            padding="max_length",
            truncation=True,
            max_length=self.sequence_length,
            stride=self.chunk_stride,
            return_overflowing_tokens=True,
        )
        chunk_count = min(len(encoded["input_ids"]), self.max_chunks)
        chunk_probabilities = []
        chunk_results = []
        session_input_names = {item.name for item in self.session.get_inputs()}

        # Run one fixed-shape chunk at a time. This works with the DirectML
        # artifact even when its exported batch dimension is static at one.
        for chunk_index in range(chunk_count):
            inputs = {
                "input_ids": encoded["input_ids"][chunk_index:chunk_index + 1].astype(np.int64),
                "attention_mask": encoded["attention_mask"][chunk_index:chunk_index + 1].astype(np.int64),
            }
            if "token_type_ids" in session_input_names:
                inputs["token_type_ids"] = encoded["token_type_ids"][chunk_index:chunk_index + 1].astype(np.int64)
            logits = self.session.run(["logits"], inputs)[0][0]
            shifted = logits - np.max(logits)
            probabilities = np.exp(shifted) / np.exp(shifted).sum()
            chunk_probabilities.append(probabilities)
            chunk_label_id = int(np.argmax(probabilities))
            chunk_results.append({
                "index": chunk_index,
                "label": self.id2label[chunk_label_id],
                "confidence": round(float(probabilities[chunk_label_id]), 6),
            })

        stacked = np.stack(chunk_probabilities)
        max_scores = np.max(stacked, axis=0)
        mean_scores = np.mean(stacked, axis=0)
        # Max pooling preserves a strong intent found in one part of a long
        # message; mean pooling reduces isolated noise. Hybrid keeps both.
        combined_scores = (0.75 * max_scores) + (0.25 * mean_scores)
        index = int(np.argmax(combined_scores))
        detected_label_ids = [
            i for i in np.argsort(-max_scores)
            if max_scores[i] >= self.multi_label_threshold
        ][:4]
        if index not in detected_label_ids:
            detected_label_ids.insert(0, index)
        latency_ms = (time.perf_counter() - started) * 1000
        with self.lock:
            self.requests += 1
            self.latencies.append(latency_ms)
        return {
            "label": self.id2label[index],
            "label_id": index,
            "confidence": round(float(combined_scores[index]), 6),
            "scores": {
                self.id2label[i]: round(float(score), 6)
                for i, score in enumerate(combined_scores)
            },
            "detected_labels": [self.id2label[i] for i in detected_label_ids],
            "chunk_count": chunk_count,
            "truncated_chunks": max(0, len(encoded["input_ids"]) - chunk_count),
            "chunk_results": chunk_results,
            "latency_ms": round(latency_ms, 3),
            "provider": self.provider,
            "model": self.model_dir.name,
        }

    def status(self) -> dict:
        with self.lock:
            values = list(self.latencies)
            requests = self.requests
        values.sort()
        p95 = values[min(len(values) - 1, max(0, int(np.ceil(len(values) * 0.95)) - 1))] if values else None
        return {
            "status": "ready",
            "model": self.model_dir.name,
            "architecture": self.config["architectures"][0],
            "task": self.config.get("problem_type"),
            "labels": [self.id2label[i] for i in sorted(self.id2label)],
            "provider": self.provider,
            "available_providers": ort.get_available_providers(),
            "sequence_length": self.sequence_length,
            "chunk_stride": self.chunk_stride,
            "max_chunks": self.max_chunks,
            "multi_label_threshold": self.multi_label_threshold,
            "long_context_strategy": "overlapping_chunks_hybrid_pooling",
            "artifact_sha256": self.sha256,
            "requests": requests,
            "mean_latency_ms": round(statistics.mean(values), 3) if values else None,
            "p95_latency_ms": round(p95, 3) if p95 is not None else None,
            "uptime_seconds": round(time.time() - self.started_at, 1),
        }


class Handler(BaseHTTPRequestHandler):
    runtime: IntentRuntime

    def _json(self, status: int, body: dict):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path in {"/health", "/v1/status"}:
            self._json(HTTPStatus.OK, self.runtime.status())
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/v1/classify":
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
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
            self._json(HTTPStatus.OK, self.runtime.classify(text.strip()))
        except (ValueError, json.JSONDecodeError) as error:
            self._json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception as error:
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": type(error).__name__})

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("bert_best_model_10pct"))
    parser.add_argument("--onnx", type=Path, default=Path("model_runtime/artifacts/bert_intent_directml.onnx"))
    parser.add_argument("--provider", choices=["auto", "directml", "cpu"], default=os.getenv("BERT_RUNTIME_PROVIDER", "auto"))
    parser.add_argument("--host", default=os.getenv("BERT_RUNTIME_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("BERT_RUNTIME_PORT", "1235")))
    args = parser.parse_args()

    runtime = IntentRuntime(args.model, args.onnx, args.provider)
    Handler.runtime = runtime
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(json.dumps(runtime.status(), indent=2))
    print(f"Listening: http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
