"""
LifeSync local/custom HF service powered by Gemma 4 E2B.

This service keeps the existing Gradio `/gradio_api/call/infer` contract the
Node backend already expects:
  data = [system_msg, user_msg, temperature, max_tokens]

Implementation notes:
- The LifeSync backend sends text-only prompts today, so this service uses the
  official text-generation path for `google/gemma-4-E2B-it`.
- On CPU-only machines, int4 TorchAO quantization is enabled by default to fit
  better on local hardware.
"""

from __future__ import annotations

import os
import json
import re
import threading
from pathlib import Path
from importlib import metadata as importlib_metadata

import gradio as gr
import torch
from dotenv import load_dotenv
from transformers import AutoModelForCausalLM, AutoProcessor

try:
    from torchao.quantization import Int4WeightOnlyConfig
    TORCHAO_AVAILABLE = True
except Exception:
    TORCHAO_AVAILABLE = False
    Int4WeightOnlyConfig = None

try:
    from transformers import TorchAoConfig
except Exception:
    TorchAoConfig = None


ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env", override=False)
os.environ.setdefault("HF_HUB_DISABLE_XET", os.getenv("HF_HUB_DISABLE_XET", "1"))


MODEL_ID = os.getenv("CUSTOM_HF_MODEL") or os.getenv("HF_MODEL") or "google/gemma-4-E2B-it"
# Pin when set (e.g. HF commit SHA) so cold starts don't silently pull a new revision.
MODEL_REVISION = (os.getenv("HF_MODEL_REVISION") or os.getenv("CUSTOM_HF_MODEL_REVISION") or "").strip() or None
HF_TOKEN = os.getenv("HF_TOKEN") or None
# Offline/local: refuse hub download (supply a cached snapshot or local path).
LOCAL_FILES_ONLY = os.getenv("HF_SPACE_LOCAL_FILES_ONLY", "").strip().lower() in {"1", "true", "yes", "on"}
SERVER_PORT = int(os.getenv("HF_SPACE_PORT", "7860"))
HAS_CUDA = torch.cuda.is_available()
DEVICE_MAP = os.getenv("HF_SPACE_DEVICE_MAP") or ("auto" if HAS_CUDA else "cpu")
QUANTIZATION_MODE = os.getenv("HF_SPACE_QUANTIZATION") or ("int4_cpu" if DEVICE_MAP == "cpu" else "none")
ATTN_IMPLEMENTATION = os.getenv("HF_SPACE_ATTN_IMPLEMENTATION", "sdpa")
USE_STATIC_CACHE = os.getenv("HF_SPACE_CACHE_IMPLEMENTATION")
if USE_STATIC_CACHE is None:
    USE_STATIC_CACHE = "none" if DEVICE_MAP == "cpu" else "static"
MAX_GENERATION_SECONDS = float(os.getenv("HF_SPACE_MAX_GENERATION_SECONDS", "45" if DEVICE_MAP == "cpu" else "120"))
# Hard caps — huge prompts / max_tokens OOM the process on small hosts.
MAX_INPUT_CHARS = int(os.getenv("HF_SPACE_MAX_INPUT_CHARS", "8000"))
MAX_NEW_TOKENS_CAP = int(os.getenv("HF_SPACE_MAX_NEW_TOKENS", "1024"))
# Serialize GPU/CPU generate — concurrent requests thrash VRAM and can OOM.
_GENERATE_LOCK = threading.Lock()
ENABLE_LIFESYNC_FAST_PATH = os.getenv("HF_SPACE_LIFESYNC_FAST_PATH", "1").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

if DEVICE_MAP == "cpu":
    cpu_threads = int(os.getenv("HF_SPACE_TORCH_THREADS", str(max(1, min(8, os.cpu_count() or 1)))))
    torch.set_num_threads(cpu_threads)
    torch.set_num_interop_threads(1)
    print(f"CPU runtime tuned: torch_threads={cpu_threads}, interop_threads=1")


def build_quantization_config():
    if QUANTIZATION_MODE != "int4_cpu":
        return None

    if DEVICE_MAP != "cpu":
        print("Skipping int4 CPU quantization because device_map is not cpu.")
        return None

    if not TORCHAO_AVAILABLE:
        print("TorchAO is not available. Falling back to non-quantized CPU load.")
        return None

    if TorchAoConfig is None:
        print("Transformers TorchAoConfig is unavailable. Falling back to non-quantized CPU load.")
        return None

    try:
        mslk_version = importlib_metadata.version("mslk")
    except importlib_metadata.PackageNotFoundError:
        print("mslk is not installed. Skipping TorchAO int4 and using non-quantized CPU load.")
        return None

    version_parts = tuple(int(part) for part in mslk_version.split(".")[:3] if part.isdigit())
    if version_parts < (1, 0, 0):
        print(
            "mslk "
            f"{mslk_version} is too old for TorchAO int4. Using non-quantized CPU load instead."
        )
        return None

    quant_config = Int4WeightOnlyConfig(group_size=128)
    return TorchAoConfig(quant_type=quant_config)


def _pretrained_kwargs(base: dict | None = None) -> dict:
    kwargs = dict(base or {})
    if MODEL_REVISION:
        kwargs["revision"] = MODEL_REVISION
    if LOCAL_FILES_ONLY:
        kwargs["local_files_only"] = True
    return kwargs


def load_model(model_id: str, base_kwargs: dict, quantization_config):
    load_kwargs = _pretrained_kwargs(base_kwargs)
    if quantization_config is not None:
        try:
            print("Attempting TorchAO int4 CPU quantization...")
            return AutoModelForCausalLM.from_pretrained(
                model_id,
                **load_kwargs,
                quantization_config=quantization_config,
            )
        except Exception as exc:
            print(f"TorchAO int4 load failed, retrying without quantization: {exc}")

    return AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs)


def build_messages(system_msg: str, user_msg: str) -> list[dict]:
    messages = []

    if system_msg and system_msg.strip():
        messages.append({"role": "system", "content": system_msg.strip()})

    messages.append({"role": "user", "content": (user_msg or "").strip()})
    return messages


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def json_response(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False)


def parse_amount(value: str) -> float:
    return float(str(value).replace(",", ""))


def format_amount(value: float) -> str:
    return f"${int(value)}" if float(value).is_integer() else f"${value:.2f}"


def infer_finance_category(text: str, is_income: bool) -> str:
    if is_income:
        if re.search(r"\b(freelance|client|project)\b", text, re.I):
            return "Income - Freelance"
        return "Income - Salary"

    rules = [
        ("Food & Dining", r"\b(coffee|lunch|dinner|breakfast|meal|restaurant|food)\b"),
        ("Groceries", r"\b(grocer|supermarket|market)\b"),
        ("Transportation", r"\b(uber|taxi|bus|train|metro|fuel|gas|transport)\b"),
        ("Bills & Utilities", r"\b(rent|electric|water bill|internet|phone bill|utility)\b"),
        ("Healthcare", r"\b(medicine|doctor|clinic|hospital|pharmacy)\b"),
        ("Entertainment", r"\b(movie|cinema|netflix|game|concert)\b"),
        ("Shopping", r"\b(clothes|shirt|shoes|shopping|amazon)\b"),
    ]
    for category, pattern in rules:
        if re.search(pattern, text, re.I):
            return category
    return "Other"


def nlp_result(intent: str, domain: str, entities: list[dict], response: str, confidence: float = 0.96) -> dict:
    return {
        "intent": intent,
        "domain": domain,
        "entities": entities,
        "response": response,
        "is_cross_domain": domain == "both",
        "needs_clarification": False,
        "clarification_question": "",
        "clarification_options": [],
        "confidence": confidence,
    }


def clarification_result(question: str, options: list[str], domain: str = "general") -> dict:
    return {
        "intent": "unclear",
        "domain": domain,
        "entities": [],
        "response": question,
        "is_cross_domain": False,
        "needs_clarification": True,
        "clarification_question": question,
        "clarification_options": options,
        "confidence": 0.35,
    }


def summarize_entity(entity: dict) -> str:
    if entity["domain"] == "finance":
        return f"{format_amount(entity['amount'])} {entity['type']} for {entity.get('description') or entity.get('category')}"
    if entity["type"] == "steps":
        return f"{int(entity['value']):,} steps"
    if entity["type"] == "sleep":
        return f"{entity['value']} hours of sleep"
    if entity["type"] == "water":
        return f"{entity['value']}L of water"
    if entity["type"] == "exercise":
        return f"{entity['value']} minutes of exercise"
    if entity["type"] == "mood":
        return f"mood {entity['value']}/10"
    return entity.get("activity") or entity["type"]


def try_lifesync_nlp(system_msg: str, user_msg: str) -> dict | None:
    if "NLP engine for LifeSync" not in (system_msg or ""):
        return None

    message = normalize_text(user_msg)
    lower = message.lower()
    if not message:
        return None

    if re.match(r"^(hi|hello|hey|good morning|good afternoon|good evening)\b", message, re.I):
        return nlp_result(
            "query_general",
            "general",
            [],
            'Hi! You can tell me something like "spent $12 on lunch" or "walked 5000 steps".',
            0.9,
        )

    entities: list[dict] = []

    steps_match = re.search(r"(\d[\d,]*)\s*steps?\b", message, re.I)
    if steps_match:
        value = int(parse_amount(steps_match.group(1)))
        entities.append({
            "domain": "health",
            "activity": "walking",
            "type": "steps",
            "value": value,
            "unit": "steps",
            "duration": None,
            "category": "Steps",
        })

    sleep_match = re.search(
        r"(?:slept?|sleep(?:ed)?)\s*(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b|(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b.*\b(?:sleep|slept)\b",
        message,
        re.I,
    )
    if sleep_match:
        hours = parse_amount(sleep_match.group(1) or sleep_match.group(2))
        entities.append({
            "domain": "health",
            "activity": "sleeping",
            "type": "sleep",
            "value": hours,
            "unit": "hours",
            "duration": round(hours * 60),
            "category": "Sleep",
        })

    water_match = re.search(r"(\d+(?:\.\d+)?)\s*(liters?|l|ml|glasses?|cups?)\b", message, re.I) if re.search(r"\b(water|drank|drink)\b", message, re.I) else None
    if water_match:
        raw_value = parse_amount(water_match.group(1))
        raw_unit = water_match.group(2).lower()
        liters = raw_value / 1000 if raw_unit.startswith("ml") else raw_value * 0.25 if raw_unit.startswith("glass") else raw_value * 0.24 if raw_unit.startswith("cup") else raw_value
        entities.append({
            "domain": "health",
            "activity": "drinking water",
            "type": "water",
            "value": round(liters, 2),
            "unit": "liters",
            "duration": None,
            "category": "Water Intake",
        })

    exercise_match = re.search(
        r"(?:exercise|workout|gym|run(?:ning)?|walk(?:ing)?|jog(?:ging)?|cycle|cycling).*?(\d+)\s*(?:minutes?|mins?|min)\b|(\d+)\s*(?:minutes?|mins?|min)\b.*\b(?:exercise|workout|gym|run(?:ning)?|walk(?:ing)?|jog(?:ging)?|cycle|cycling)\b",
        message,
        re.I,
    )
    if exercise_match:
        minutes = int(exercise_match.group(1) or exercise_match.group(2))
        activity_match = re.search(r"\b(run(?:ning)?|walk(?:ing)?|jog(?:ging)?|cycle|cycling|gym|workout|exercise)\b", message, re.I)
        entities.append({
            "domain": "health",
            "activity": activity_match.group(0).lower() if activity_match else "exercise",
            "type": "exercise",
            "value": minutes,
            "unit": "minutes",
            "duration": minutes,
            "category": "Exercise",
        })

    mood_match = re.search(r"\b(?:mood|feeling|feel)\b[^0-9]{0,12}(\d{1,2})(?:/10)?\b", message, re.I)
    if mood_match:
        mood = max(1, min(10, int(mood_match.group(1))))
        entities.append({
            "domain": "health",
            "activity": "mood",
            "type": "mood",
            "value": mood,
            "unit": "rating",
            "duration": None,
            "category": "Mood",
        })

    finance_context = re.search(r"\b(spent|paid|bought|purchase(?:d)?|cost|pay(?:ing)?|bill|earned|received|income|salary|sold|got paid|paycheck|freelance)\b|[$€£₪]", message, re.I)
    amount_match = re.search(r"(?:[$€£₪]\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:usd|dollars?|bucks?|ils|nis|shekels?))", message, re.I)
    bare_amount_match = re.search(r"\b(\d+(?:[.,]\d{1,2})?)\b", message) if finance_context and not amount_match else None
    if finance_context and (amount_match or bare_amount_match):
        amount = parse_amount((amount_match.group(1) or amount_match.group(2)) if amount_match else bare_amount_match.group(1))
        is_income = bool(re.search(r"\b(earned|received|income|salary|sold|got paid|paycheck|freelance)\b", message, re.I)) and not bool(re.search(r"\b(spent|paid|bought|purchase(?:d)?|cost|pay(?:ing)?|bill)\b", message, re.I))
        descriptor = re.sub(r"(?:[$€£₪]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:usd|dollars?|bucks?|ils|nis|shekels?))", " ", lower)
        descriptor = re.sub(r"\b(i|just|today|yesterday|spent|paid|bought|purchase(?:d)?|cost|earn(?:ed)?|received|income|salary|got|for|on|from|a|an|the|my)\b", " ", descriptor, flags=re.I)
        descriptor = normalize_text(re.sub(r"\b\d+(?:[.,]\d{1,2})?\b", " ", descriptor))
        if not descriptor:
            return clarification_result(
                f"What was the {format_amount(amount)} {'income' if is_income else 'expense'} for?",
                ["Salary", "Freelance work", "Gift"] if is_income else ["Food", "Transport", "Shopping"],
                "finance",
            )
        category = infer_finance_category(descriptor, is_income)
        entities.append({
            "domain": "finance",
            "activity": descriptor,
            "type": "income" if is_income else "expense",
            "amount": amount,
            "currency": "USD",
            "category": category,
            "description": descriptor,
        })

    if entities:
        domain_set = {entity["domain"] for entity in entities}
        domain = "both" if len(domain_set) > 1 else entities[0]["domain"]
        intent = "log_both" if domain == "both" else "log_finance" if domain == "finance" else "log_health"
        return nlp_result(intent, domain, entities, f"Logged {' and '.join(summarize_entity(e) for e in entities)}.")

    return clarification_result(
        "I couldn't tell what to save yet. Try adding a number and what it was for.",
        ["Spent $20 on food", "Walked 5000 steps", "Slept 7 hours"],
    )


def try_lifesync_insights(system_msg: str, user_msg: str) -> dict | None:
    if "wellness and finance advisor for LifeSync" not in (system_msg or ""):
        return None
    if "Analyze this user's weekly LifeSync data" not in (user_msg or ""):
        return None

    return {
        "summary": "Local insights are ready. Keep logging health and finance activity so weekly patterns become more specific.",
        "patterns": [],
        "recommendations": [
            {
                "text": "Log one health item and one spending item each day.",
                "priority": "medium",
                "domain": "both",
                "reason": "Consistent paired data makes cross-domain insights more reliable.",
            }
        ],
        "cross_domain_insights": "No strong cross-domain pattern is available yet.",
        "mood_trend": "insufficient_data",
        "spending_trend": "insufficient_data",
        "health_score": 0,
        "financial_health_score": 0,
    }


def try_lifesync_fast_path(system_msg: str, user_msg: str) -> str | None:
    if not ENABLE_LIFESYNC_FAST_PATH:
        return None

    parsed = try_lifesync_nlp(system_msg, user_msg)
    if parsed is None:
        parsed = try_lifesync_insights(system_msg, user_msg)
    return json_response(parsed) if parsed is not None else None


print(f"Loading processor for {MODEL_ID} (revision={MODEL_REVISION or 'default'})...")
processor = AutoProcessor.from_pretrained(
    MODEL_ID,
    token=HF_TOKEN,
    **_pretrained_kwargs(),
)

quantization_config = build_quantization_config()
print(
    "Loading model for "
    f"{MODEL_ID} (device_map={DEVICE_MAP}, quantization={QUANTIZATION_MODE}, "
    f"attn={ATTN_IMPLEMENTATION}, revision={MODEL_REVISION or 'default'})..."
)

model_kwargs = {
    "token": HF_TOKEN,
    "dtype": "auto",
    "device_map": DEVICE_MAP,
    "attn_implementation": ATTN_IMPLEMENTATION,
    "low_cpu_mem_usage": True,
}
model = load_model(MODEL_ID, model_kwargs, quantization_config)
model.eval()
MODEL_DEVICE = next(model.parameters()).device
print(f"Model loaded and ready on {MODEL_DEVICE}.")


def _clamp_prompt(value: str | None) -> str:
    return str(value or "")[:MAX_INPUT_CHARS]


def infer(system_msg: str, user_msg: str, temperature: float, max_tokens: float) -> str:
    try:
        system_msg = _clamp_prompt(system_msg)
        user_msg = _clamp_prompt(user_msg)

        fast_response = try_lifesync_fast_path(system_msg, user_msg)
        if fast_response is not None:
            return fast_response

        messages = build_messages(system_msg, user_msg)
        inputs = processor.apply_chat_template(
            messages,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
            add_generation_prompt=True,
        )
        inputs = inputs.to(MODEL_DEVICE)

        try:
            requested = int(max_tokens) if max_tokens else 512
        except (TypeError, ValueError):
            requested = 512
        max_new_tokens = max(1, min(requested, MAX_NEW_TOKENS_CAP))
        try:
            temperature = float(temperature) if temperature is not None else 0.1
        except (TypeError, ValueError):
            temperature = 0.1
        do_sample = temperature > 0

        generation_kwargs = {
            "max_new_tokens": max_new_tokens,
            "do_sample": do_sample,
        }
        if MAX_GENERATION_SECONDS > 0:
            generation_kwargs["max_time"] = MAX_GENERATION_SECONDS
        if do_sample:
            generation_kwargs.update(
                {
                    "temperature": temperature,
                    "top_p": 0.95,
                    "top_k": 64,
                }
            )

        if USE_STATIC_CACHE and USE_STATIC_CACHE.lower() != "none":
            generation_kwargs["cache_implementation"] = USE_STATIC_CACHE

        with _GENERATE_LOCK:
            with torch.inference_mode():
                output = model.generate(**inputs, **generation_kwargs)

        prompt_length = inputs["input_ids"].shape[1]
        generated_tokens = output[0][prompt_length:]
        return processor.decode(generated_tokens, skip_special_tokens=True).strip()
    except Exception as exc:
        # Gradio may surface exceptions to the client — return a short code only.
        print(f"infer error: {type(exc).__name__}: {exc}")
        return json.dumps({"error": "generation_failed"}, ensure_ascii=False)


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
    title="LifeSync Gemma 4 E2B API",
    description=(
        "Local/custom Hugging Face endpoint for LifeSync chat parsing, backed by "
        "google/gemma-4-E2B-it using the official text-generation path."
    ),
)

demo.launch(server_name="0.0.0.0", server_port=SERVER_PORT)
