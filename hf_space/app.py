"""
LifeSync NLP API — HuggingFace Space
=====================================
Hardware : ZeroGPU  (apply in Space Settings → Hardware)
Secret   : HF_TOKEN (Space Settings → Secrets)

Exposes a Gradio API endpoint that LifeSync's providerClient.js calls as:
  POST /run/predict
  {"data": [system_msg, user_msg, temperature, max_tokens]}
  Authorization: Bearer <HF_TOKEN>
"""

import os
import json
import torch
import spaces
import gradio as gr
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel

HF_TOKEN      = os.environ.get("HF_TOKEN")
BASE_MODEL_ID = "mistralai/Mistral-7B-Instruct-v0.2"
ADAPTER_ID    = "os-1202883/lifesync-nlp"

# Tokenizer is small — load once at startup on CPU
tokenizer = AutoTokenizer.from_pretrained(ADAPTER_ID, token=HF_TOKEN)

_model = None  # cached in GPU memory while Space is warm


@spaces.GPU
def infer(system_msg: str, user_msg: str, temperature: float, max_tokens: float) -> str:
    global _model

    if _model is None:
        bnb = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16,
            bnb_4bit_use_double_quant=True,
        )
        base = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL_ID,
            quantization_config=bnb,
            device_map="auto",
            token=HF_TOKEN,
        )
        _model = PeftModel.from_pretrained(base, ADAPTER_ID, token=HF_TOKEN)
        _model.eval()

    messages = []
    if system_msg:
        messages.append({"role": "system", "content": system_msg})
    messages.append({"role": "user", "content": user_msg})

    inputs = tokenizer.apply_chat_template(
        messages, return_tensors="pt", add_generation_prompt=True
    ).to("cuda")

    with torch.no_grad():
        outputs = _model.generate(
            inputs,
            max_new_tokens=int(max_tokens),
            temperature=float(temperature),
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )

    return tokenizer.decode(outputs[0][inputs.shape[1]:], skip_special_tokens=True)


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
demo.launch()
