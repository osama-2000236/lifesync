#!/usr/bin/env bash
# ==============================================================================
# Script to pull the Gemma model into the local Ollama docker container
# ==============================================================================

set -e

MODEL_NAME=${1:-gemma}

echo "Looking for ollama container..."

# Check if docker is running the ollama container
if ! docker compose ps | grep -q "ollama"; then
  echo "Error: The ollama container is not running."
  echo "Please start the stack first using: docker compose up -d"
  exit 1
fi

echo "Pulling '$MODEL_NAME' into the local Ollama instance..."
echo "This might take a few minutes depending on your internet connection (1.7GB - 5.5GB)."

# Exec into the container and pull the model
docker compose exec ollama ollama pull "$MODEL_NAME"

echo ""
echo "✅ Successfully pulled $MODEL_NAME!"
echo "Your backend can now use AI_PROVIDER=ollama to communicate with it natively."
