# LifeSync BERT intent classifier — cloud CPU service.
# Serves POST /v1/classify, GET /v1/status, GET /health.
# Build context = this folder. Deploy on Railway/Render/Fly/Cloud Run.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    BERT_RUNTIME_HOST=:: \
    BERT_RUNTIME_PROVIDER=cpu

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY bert_intent.onnx .
COPY model/ ./model/

# ONNX external weights (~438MB) are too large for git, so they are fetched at
# build time from a GitHub Release asset. Override with --build-arg WEIGHTS_URL=...
ARG WEIGHTS_URL=https://github.com/osama-2000236/lifesync/releases/download/bert-weights-v1/bert_intent.onnx.data
ADD ${WEIGHTS_URL} ./bert_intent.onnx.data

# Railway/Cloud Run inject $PORT; default 8080 for local docker run.
EXPOSE 8080
# Bind IPv6 dual-stack (::) so Railway private networking (bert.railway.internal)
# works; it also accepts IPv4, so a public domain works too.
CMD ["sh", "-c", "python server.py --provider cpu --onnx bert_intent.onnx --model model --host :: --port ${PORT:-8080}"]
