# LifeSync BERT NLP service
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HF_HOME=/models/hf \
    BERT_SERVICE_PORT=8088

WORKDIR /app

# Install CPU torch + deps first (better layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY . .

# If a fine-tuned model has been trained into ./models it is used automatically,
# otherwise the service downloads the zero-shot model on first boot.
EXPOSE 8088
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8088"]
