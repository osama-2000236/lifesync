# LifeSync BERT NLP Service

Local, self-hosted NLP engine that powers LifeSync's **chat** and **dashboard
insights** — no external API keys, runs on **CPU or GPU**.

It implements the NLP module from the LifeSync design document (§3.4.5):

| Stage | Component | How |
|-------|-----------|-----|
| Intent Detection | BERT (DistilBERT) | fine-tuned classifier, or zero-shot NLI fallback |
| Text Classification (health vs finance) | BERT | domain derived from intent + extracted entities |
| Entity Extraction | rule layer | amounts, durations, units, currency (deterministic) |

## Quick start

```bash
cd bert_service
python -m pip install -r requirements.txt

# (optional but recommended) train the LifeSync intent model — ~2 min on CPU, faster on GPU
python train.py                 # builds the dataset, fine-tunes DistilBERT, saves to models/

python app.py                   # serves on http://127.0.0.1:8088
```

The service auto-detects `models/intent-distilbert/`:
- **present**  → uses your fine-tuned DistilBERT (`mode: fine-tuned`)
- **absent**   → downloads `typeform/distilbert-base-uncased-mnli` for zero-shot (`mode: zero-shot`)

Then point the Node backend at it (already the default in `.env.example`):

```env
CHAT_AI_PROVIDER=bert
INSIGHTS_AI_PROVIDER=bert
BERT_SERVICE_URL=http://127.0.0.1:8088
```

## GPU

Install the CUDA build of torch and the service picks the GPU up automatically
(`device: cuda` in `/health`):

```bash
pip install torch --index-url https://download.pytorch.org/whl/cu124
```

## Endpoints

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET  | `/health` | – | status + loaded model info |
| POST | `/warmup` | – | forces model load |
| POST | `/nlp/parse` | `{ "message": "spent $20 on lunch" }` | intent, domain, entities, response, confidence |
| POST | `/nlp/insights` | `{ "health": [...], "finance": [...], "prev": {...}, "notes": [...] }` | weekly summary, sentiment, scores, recommendations |

Example:

```bash
curl -s localhost:8088/nlp/parse -H 'content-type: application/json' \
  -d '{"message":"I slept 7 hours and spent $15 on breakfast"}'
```

## Tests

```bash
# rule layer — fast, offline (no model download)
BERT_DISABLE_MODEL=1 python -m pytest test_nlp_engine.py -q
```

## Files

- `nlp_engine.py` — intent/domain classification + entity extraction
- `insights_engine.py` — BERT sentiment + scored weekly narrative
- `app.py` — FastAPI server
- `data/build_dataset.py` — generates the labelled intent dataset
- `train.py` — fine-tunes DistilBERT and saves `models/intent-distilbert/`
