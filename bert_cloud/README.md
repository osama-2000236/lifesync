# LifeSync BERT — cloud CPU inference service

Self-hosted, always-on BERT intent classifier. No PC, no Hugging Face Space.
The Node backend calls this over HTTP (`BERT_RUNTIME_BASE_URL`).

## Endpoints
- `GET /health`, `GET /v1/status` — readiness + model metadata
- `POST /v1/classify` `{ "text": "spent 20 on lunch" }` → `{ label, confidence, scores, ... }`

## Contents
- `server.py` — stdlib HTTP server, onnxruntime CPU + tokenizer
- `bert_intent.onnx` — ONNX graph (~1.2 MB)
- `model/` — tokenizer + config (no PyTorch weights needed)
- `requirements.txt` — `onnxruntime`, `transformers`, `numpy` (no torch, no DirectML)
- `Dockerfile` — fetches the ~438 MB ONNX weights (`bert_intent.onnx.data`) from a
  GitHub Release at build time, then runs on `0.0.0.0:$PORT`

## Weights
The ONNX external weights are too large for git. Host them once as a Release asset:
```bash
gh release create bert-weights-v1 \
  "model_runtime/artifacts/bert_intent.onnx.data" \
  -R osama-2000236/lifesync -t "BERT ONNX weights" -n "FP32 weights for bert_intent.onnx"
```
The Dockerfile `WEIGHTS_URL` points at
`releases/download/bert-weights-v1/bert_intent.onnx.data`.

## Deploy on Railway (2nd service, same project)
1. New service → Deploy from repo → set **Root Directory** = `bert_cloud`.
2. Railway builds the Dockerfile, injects `$PORT`. No env needed.
3. Note the internal URL (e.g. `http://bert.railway.internal:8080`).
4. On the **Node** service set `BERT_RUNTIME_BASE_URL` to that internal URL,
   plus `CHAT_AI_PROVIDER=bert_local`, `AI_PROVIDER=bert_local`.

Private networking keeps the classifier off the public internet.
Local docker test: `docker build -t bert bert_cloud && docker run -p 8080:8080 bert`.
