"""
LifeSync NLP API — HuggingFace Space (CPU Basic)
==================================================
Hardware : CPU Basic (free — 2 vCPU, 16GB RAM)
Secret   : HF_TOKEN (Space Settings → Secrets)

Loads the GGUF-quantized model (~4GB) and runs inference on CPU.
Exposes a Gradio API endpoint that LifeSync's providerClient.js calls as:
  POST /run/predict
  {"data": [system_msg, user_msg, temperature, max_tokens]}
  Authorization: Bearer <HF_TOKEN>
"""

import os
import gradio as gr
from huggingface_hub import hf_hub_download
from llama_cpp import Llama

HF_TOKEN = os.environ.get("HF_TOKEN")

# Download GGUF model once (cached after first run)
print("Downloading GGUF model...")
model_path = hf_hub_download(
    repo_id="os-1202883/LifeSync",
    filename="lifesync.gguf",
    token=HF_TOKEN,
)
print(f"Model downloaded to: {model_path}")

# Load model on CPU
print("Loading model...")
llm = Llama(
    model_path=model_path,
    n_ctx=2048,
    n_threads=2,  # CPU Basic has 2 vCPU
    verbose=False,
)
print("Model loaded and ready.")


def infer(system_msg: str, user_msg: str, temperature: float, max_tokens: float) -> str:
    messages = []
    if system_msg:
        messages.append({"role": "system", "content": system_msg})
    messages.append({"role": "user", "content": user_msg})

    response = llm.create_chat_completion(
        messages=messages,
        temperature=float(temperature) if temperature else 0.1,
        max_tokens=int(max_tokens) if max_tokens else 512,
    )
    return response["choices"][0]["message"]["content"]


demo = gr.Interface(
    fn=infer,
    inputs=[
        gr.Textbox(label="system"),
        gr.Textbox(label="user"),
        gr.Number(label="temperature", value=0.1),
        gr.Number(label="max_tokens", value=512),
    ],
    outputs=gr.Textbox(label="output"),
    api_name="infer",
    title="LifeSync NLP API",
    description="Internal model endpoint for the LifeSync app.",
)
demo.launch(server_name="0.0.0.0", server_port=7860)
