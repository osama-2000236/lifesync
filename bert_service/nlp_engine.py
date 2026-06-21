"""
LifeSync BERT NLP Engine
========================

Implements the NLP module described in the LifeSync design document
(Section 3.4.5): **Intent Detection**, **Text Classification (health vs
finance)**, and **Entity Extraction**, running fully locally on CPU or GPU.

Pipeline (matches Figure 3.15 "NLP Module Workflow"):

    tokenize -> intent detection (BERT) -> domain classification (BERT)
             -> entity extraction (rules) -> structured record + feedback

Two BERT back-ends are supported, selected automatically:

* **fine-tuned**  - a DistilBERT sequence classifier trained on the LifeSync
  intent dataset (see ``train.py``). Loaded from ``BERT_INTENT_MODEL_DIR`` when
  that directory exists. One fast forward pass per message.
* **zero-shot**   - ``typeform/distilbert-base-uncased-mnli`` used as a
  zero-shot NLI classifier over the intent / domain hypotheses. Needs no
  training, works out of the box.

Entity extraction (amounts, durations, units, currency) is deterministic and
mirrors the rules the Node fast-path already relies on, so numbers are never
hallucinated.

Set ``BERT_DISABLE_MODEL=1`` to skip model loading entirely and run on the
rule layer only (used by the unit tests and CI).
"""

from __future__ import annotations

import os
import re
import threading
from typing import Optional

import advice_engine

# ─────────────────────────────────────────────────────────────────────────────
# Intent / domain label space
# ─────────────────────────────────────────────────────────────────────────────

INTENT_LABELS = [
    "log_health",
    "log_finance",
    "query_health",
    "query_finance",
    "get_insight",
    "set_goal",
    "edit_entry",
    "query_general",
]

# NLI hypotheses for the zero-shot back-end. Each is the sentence the model
# checks the user message entails.
INTENT_HYPOTHESES = {
    "log_health": "The user is recording a health activity such as steps, sleep, water, exercise, heart rate, nutrition, or mood.",
    "log_finance": "The user is recording money they spent or income they received.",
    "query_health": "The user is asking a question about their health data, habits, or progress.",
    "query_finance": "The user is asking a question about their spending, budget, or income.",
    "get_insight": "The user is asking for weekly insights, an analysis, a summary, or recommendations.",
    "set_goal": "The user wants to set a goal or a target.",
    "edit_entry": "The user wants to edit, change, update, or delete a previous entry.",
    "query_general": "The user is greeting, making small talk, or saying something unrelated to health or finance.",
}

DOMAIN_HYPOTHESES = {
    "health": "This message is about health, fitness, sleep, mood, hydration, or exercise.",
    "finance": "This message is about money, spending, expenses, income, or budgets.",
    "general": "This message is a greeting or general conversation, not about health or finance.",
}

# ─────────────────────────────────────────────────────────────────────────────
# Rule layer — deterministic entity extraction
# ─────────────────────────────────────────────────────────────────────────────

GREETING_RE = re.compile(r"^(hi|hello|hey|good morning|good afternoon|good evening|yo|sup)\b", re.I)
INSIGHT_RE = re.compile(r"\b(insight|insights|summary|summarize|how am i doing|recommend|analysis|analyze|weekly report|my week)\b", re.I)
GOAL_RE = re.compile(r"\b(goal|target|aim for|i want to (?:reach|hit|save|reduce)|set a (?:goal|budget|limit))\b", re.I)
EDIT_RE = re.compile(r"\b(edit|update|change|correct|delete|remove|undo)\b", re.I)
QUERY_RE = re.compile(r"\b(how much|how many|what(?:'s| is| are| was)|show me|tell me|did i|have i|do i|when did|list my)\b", re.I)

EXPENSE_RE = re.compile(r"\b(spent|paid|bought|purchase(?:d)?|cost|pay(?:ing)?|bill)\b", re.I)
INCOME_RE = re.compile(r"\b(earned|received|income|salary|sold|got paid|paycheck|freelance)\b", re.I)
CURRENCY_RE = re.compile(r"[$€£₪]")
AMOUNT_RE = re.compile(
    r"(?:[$€£₪]\s?(\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?)\s?(?:usd|dollars?|bucks?|ils|nis|shekels?))",
    re.I,
)
BARE_NUMBER_RE = re.compile(r"\b(\d+(?:[.,]\d{1,2})?)\b")

MOOD_KEYWORDS = [
    (9, re.compile(r"\b(amazing|excellent|fantastic|wonderful)\b", re.I)),
    (8, re.compile(r"\b(great|happy|good mood)\b", re.I)),
    (6, re.compile(r"\b(good|fine|alright)\b", re.I)),
    (5, re.compile(r"\b(okay|neutral|meh|alright)\b", re.I)),
    (3, re.compile(r"\b(bad|poor|low|sad|down)\b", re.I)),
    (2, re.compile(r"\b(awful|terrible|depressed|miserable)\b", re.I)),
]

FINANCE_CATEGORY_RULES = [
    ("Food & Dining", re.compile(r"\b(coffee|lunch|dinner|breakfast|meal|restaurant|food|snack|cafe)\b", re.I)),
    ("Groceries", re.compile(r"\b(grocer|supermarket|market)\b", re.I)),
    ("Transportation", re.compile(r"\b(uber|taxi|bus|train|metro|fuel|gas|transport|parking)\b", re.I)),
    ("Bills & Utilities", re.compile(r"\b(rent|electric|water bill|internet|phone bill|utility|subscription)\b", re.I)),
    ("Healthcare", re.compile(r"\b(medicine|doctor|clinic|hospital|pharmacy|dentist)\b", re.I)),
    ("Entertainment", re.compile(r"\b(movie|cinema|netflix|game|concert|spotify)\b", re.I)),
    ("Shopping", re.compile(r"\b(clothes|shirt|shoes|shopping|amazon|gift)\b", re.I)),
    ("Income - Salary", re.compile(r"\b(salary|paycheck|wage)\b", re.I)),
    ("Income - Freelance", re.compile(r"\b(freelance|client|project|gig)\b", re.I)),
]

DESCRIPTOR_STOPWORDS = re.compile(
    r"\b(i|just|today|yesterday|spent|paid|bought|purchase(?:d)?|cost|earn(?:ed)?|received|income|"
    r"salary|got|for|on|from|a|an|the|my|me|of|some|this|that)\b",
    re.I,
)


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _parse_amount(value: str) -> float:
    return float(str(value).replace(",", ""))


def format_amount(value: float) -> str:
    return f"${int(value)}" if float(value).is_integer() else f"${value:.2f}"


def infer_finance_category(text: str, is_income: bool) -> str:
    for category, pattern in FINANCE_CATEGORY_RULES:
        if category.startswith("Income") != is_income:
            continue
        if pattern.search(text):
            return category
    return "Income - Salary" if is_income else "Other"


def extract_entities(message: str) -> list[dict]:
    """Deterministically pull health & finance entities out of a message."""
    message = normalize_text(message)
    if not message:
        return []

    entities: list[dict] = []

    steps = re.search(r"(\d[\d,]*)\s*steps?\b", message, re.I)
    if steps:
        entities.append({
            "domain": "health", "activity": "walking", "type": "steps",
            "value": int(_parse_amount(steps.group(1))), "unit": "steps",
            "duration": None, "category": "Steps",
        })

    sleep = re.search(
        r"(?:slept?|sleep(?:ed)?)\s*(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b"
        r"|(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b[^.!?\n]*\b(?:sleep|slept)\b",
        message, re.I,
    )
    if sleep:
        hours = _parse_amount(sleep.group(1) or sleep.group(2))
        entities.append({
            "domain": "health", "activity": "sleeping", "type": "sleep",
            "value": hours, "unit": "hours", "duration": round(hours * 60),
            "category": "Sleep",
        })

    if re.search(r"\b(water|drank|drink|hydrate)\b", message, re.I):
        water = re.search(r"(\d+(?:\.\d+)?)\s*(liters?|l|ml|glasses?|cups?)\b", message, re.I)
        if water:
            raw_value = _parse_amount(water.group(1))
            unit = water.group(2).lower()
            liters = (
                raw_value / 1000 if unit.startswith("ml")
                else raw_value * 0.25 if unit.startswith("glass")
                else raw_value * 0.24 if unit.startswith("cup")
                else raw_value
            )
            entities.append({
                "domain": "health", "activity": "drinking water", "type": "water",
                "value": round(liters, 2), "unit": "liters", "duration": None,
                "category": "Water Intake",
            })

    exercise = re.search(
        r"(?:exercise|workout|gym|run(?:ning)?|walk(?:ing)?|jog(?:ging)?|cycle|cycling)[^.!?\n]*?(\d+)\s*(?:minutes?|mins?|min)\b"
        r"|(\d+)\s*(?:minutes?|mins?|min)\b[^.!?\n]*\b(?:exercise|workout|gym|run(?:ning)?|walk(?:ing)?|jog(?:ging)?|cycle|cycling)\b",
        message, re.I,
    )
    if exercise:
        minutes = int(exercise.group(1) or exercise.group(2))
        activity = re.search(r"\b(run(?:ning)?|walk(?:ing)?|jog(?:ging)?|cycle|cycling|gym|workout|exercise)\b", message, re.I)
        entities.append({
            "domain": "health", "activity": activity.group(0).lower() if activity else "exercise",
            "type": "exercise", "value": minutes, "unit": "minutes", "duration": minutes,
            "category": "Exercise",
        })

    mood_scale = re.search(r"\b(?:mood|feeling|feel)\b[^0-9]{0,12}(\d{1,2})(?:/10)?\b", message, re.I)
    if mood_scale:
        mood = max(1, min(10, int(mood_scale.group(1))))
        entities.append({
            "domain": "health", "activity": "mood", "type": "mood",
            "value": mood, "unit": "rating", "duration": None, "category": "Mood",
        })
    elif re.search(r"\b(feel|feeling|mood)\b", message, re.I):
        for score, pattern in MOOD_KEYWORDS:
            if pattern.search(message):
                entities.append({
                    "domain": "health", "activity": "mood", "type": "mood",
                    "value": score, "unit": "rating", "duration": None, "category": "Mood",
                })
                break

    heart = re.search(r"(\d{2,3})\s*(?:bpm|beats per minute)\b|\bheart rate\b[^0-9]{0,8}(\d{2,3})", message, re.I)
    if heart:
        bpm = int(heart.group(1) or heart.group(2))
        entities.append({
            "domain": "health", "activity": "heart rate", "type": "heart_rate",
            "value": bpm, "unit": "bpm", "duration": None, "category": "Heart Rate",
        })

    finance_context = bool(EXPENSE_RE.search(message) or INCOME_RE.search(message) or CURRENCY_RE.search(message))
    amount_match = AMOUNT_RE.search(message)
    bare_amount = BARE_NUMBER_RE.search(message) if finance_context and not amount_match else None
    # Don't treat a health number (e.g. "5000 steps") as money.
    health_number_present = any(e["domain"] == "health" for e in entities)
    if finance_context and (amount_match or bare_amount) and not (bare_amount and health_number_present):
        amount = _parse_amount(
            (amount_match.group(1) or amount_match.group(2)) if amount_match else bare_amount.group(1)
        )
        is_income = bool(INCOME_RE.search(message)) and not bool(EXPENSE_RE.search(message))
        descriptor = AMOUNT_RE.sub(" ", message.lower())
        descriptor = BARE_NUMBER_RE.sub(" ", descriptor)
        descriptor = DESCRIPTOR_STOPWORDS.sub(" ", descriptor)
        descriptor = normalize_text(descriptor)
        category = infer_finance_category(descriptor or message, is_income)
        entities.append({
            "domain": "finance", "activity": descriptor or "transaction",
            "type": "income" if is_income else "expense", "amount": amount,
            "currency": "USD", "category": category, "description": descriptor or None,
        })

    return entities


def summarize_entity(entity: dict) -> str:
    if entity["domain"] == "finance":
        what = entity.get("description") or entity.get("category")
        return f"{format_amount(entity['amount'])} {entity['type']}{f' for {what}' if what else ''}"
    t = entity["type"]
    if t == "steps":
        return f"{int(entity['value']):,} steps"
    if t == "sleep":
        return f"{entity['value']} hours of sleep"
    if t == "water":
        return f"{entity['value']}L of water"
    if t == "exercise":
        return f"{entity['value']} minutes of {entity.get('activity', 'exercise')}"
    if t == "mood":
        return f"mood {entity['value']}/10"
    if t == "heart_rate":
        return f"heart rate {entity['value']} bpm"
    return entity.get("activity") or t


# ─────────────────────────────────────────────────────────────────────────────
# BERT classifier (lazy-loaded, thread-safe)
# ─────────────────────────────────────────────────────────────────────────────

class _Classifier:
    """Wraps either a fine-tuned DistilBERT head or a zero-shot NLI pipeline."""

    def __init__(self) -> None:
        self.mode = "rules"
        self.model_name = None
        self.device = "cpu"
        self._zero_shot = None
        self._ft_model = None
        self._ft_tokenizer = None
        self._ft_labels = None
        self._lock = threading.Lock()
        self._loaded = False

    # -- loading -------------------------------------------------------------

    def ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return
            if os.getenv("BERT_DISABLE_MODEL", "").strip().lower() in {"1", "true", "yes", "on"}:
                self.mode = "rules"
                self._loaded = True
                return
            self._load()
            self._loaded = True

    def _load(self) -> None:
        import torch  # local import keeps module import cheap for the rule layer

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        ft_dir = os.getenv("BERT_INTENT_MODEL_DIR", os.path.join(os.path.dirname(__file__), "models", "intent-distilbert"))

        if ft_dir and os.path.isdir(ft_dir) and os.path.isfile(os.path.join(ft_dir, "config.json")):
            try:
                from transformers import AutoModelForSequenceClassification, AutoTokenizer
                import json

                self._ft_tokenizer = AutoTokenizer.from_pretrained(ft_dir)
                self._ft_model = AutoModelForSequenceClassification.from_pretrained(ft_dir)
                self._ft_model.to(self.device)
                self._ft_model.eval()
                labels_path = os.path.join(ft_dir, "intent_labels.json")
                if os.path.isfile(labels_path):
                    with open(labels_path, "r", encoding="utf-8") as fh:
                        self._ft_labels = json.load(fh)
                else:
                    id2label = self._ft_model.config.id2label
                    self._ft_labels = [id2label[i] for i in range(len(id2label))]
                self.mode = "fine-tuned"
                self.model_name = ft_dir
                return
            except Exception as exc:  # pragma: no cover - fall back to zero-shot
                print(f"[bert] fine-tuned load failed ({exc}); falling back to zero-shot")

        # Zero-shot fallback
        from transformers import pipeline

        self.model_name = os.getenv("BERT_ZERO_SHOT_MODEL", "typeform/distilbert-base-uncased-mnli")
        device_index = 0 if self.device == "cuda" else -1
        self._zero_shot = pipeline(
            "zero-shot-classification",
            model=self.model_name,
            device=device_index,
        )
        self.mode = "zero-shot"

    # -- inference -----------------------------------------------------------

    def classify_intent(self, message: str) -> tuple[str, float]:
        self.ensure_loaded()
        if self.mode == "fine-tuned":
            return self._intent_finetuned(message)
        if self.mode == "zero-shot":
            return self._zero_shot_pick(message, INTENT_HYPOTHESES)
        return ("unclear", 0.0)  # rules-only

    def classify_domain(self, message: str) -> tuple[str, float]:
        self.ensure_loaded()
        if self.mode == "zero-shot":
            return self._zero_shot_pick(message, DOMAIN_HYPOTHESES)
        # fine-tuned / rules: derive from intent at the engine level
        return ("general", 0.0)

    def _intent_finetuned(self, message: str) -> tuple[str, float]:
        import torch

        inputs = self._ft_tokenizer(message, return_tensors="pt", truncation=True, max_length=64).to(self.device)
        with torch.inference_mode():
            logits = self._ft_model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1)
            idx = int(torch.argmax(probs))
        return (self._ft_labels[idx], float(probs[idx]))

    def _zero_shot_pick(self, message: str, hypotheses: dict[str, str]) -> tuple[str, float]:
        labels = list(hypotheses.keys())
        sequences = [hypotheses[k] for k in labels]
        out = self._zero_shot(message, candidate_labels=sequences, hypothesis_template="{}", multi_label=False)
        best_seq = out["labels"][0]
        best_score = float(out["scores"][0])
        label = labels[sequences.index(best_seq)]
        return (label, best_score)

    def _ensure_zero_shot(self) -> bool:
        """Lazy-load the zero-shot NLI pipeline (used for insight sentiment even
        when the intent back-end is the fine-tuned head). Returns False if a
        model cannot be loaded (rules-only mode)."""
        self.ensure_loaded()
        if self._zero_shot is not None:
            return True
        if self.mode == "rules":
            return False
        try:
            from transformers import pipeline
            name = os.getenv("BERT_ZERO_SHOT_MODEL", "typeform/distilbert-base-uncased-mnli")
            device_index = 0 if self.device == "cuda" else -1
            self._zero_shot = pipeline("zero-shot-classification", model=name, device=device_index)
            if self.model_name is None:
                self.model_name = name
            return True
        except Exception as exc:  # pragma: no cover
            print(f"[bert] zero-shot load for insights failed: {exc}")
            return False

    def zero_shot(self, text: str, labels: dict[str, str]) -> Optional[tuple[str, float]]:
        """Generic zero-shot classification over a {label: hypothesis} map.
        Returns None when no model is available."""
        if not self._ensure_zero_shot():
            return None
        keys = list(labels.keys())
        sequences = [labels[k] for k in keys]
        out = self._zero_shot(text, candidate_labels=sequences, hypothesis_template="{}", multi_label=False)
        best = out["labels"][0]
        return (keys[sequences.index(best)], float(out["scores"][0]))

    def info(self) -> dict:
        return {"mode": self.mode, "model": self.model_name, "device": self.device,
                "label": self.label(), "loaded": self._loaded}

    def label(self) -> str:
        return {
            "fine-tuned": "BERT (fine-tuned)",
            "zero-shot": "BERT (zero-shot)",
            "rules": "rules",
        }.get(self.mode, self.mode)


_classifier = _Classifier()


def model_info() -> dict:
    return _classifier.info()


def model_label() -> str:
    return _classifier.label()


def warmup() -> dict:
    _classifier.ensure_loaded()
    return _classifier.info()


# ─────────────────────────────────────────────────────────────────────────────
# Response assembly
# ─────────────────────────────────────────────────────────────────────────────

def _nlp_result(intent, domain, entities, response, confidence=0.95, *, cross=False,
                needs_clarification=False, question="", options=None, bert_intent=None):
    return {
        "intent": intent,
        "domain": domain,
        "entities": entities,
        "response": response,
        "is_cross_domain": cross,
        "needs_clarification": needs_clarification,
        "clarification_question": question or "",
        "clarification_options": options or [],
        "confidence": round(float(confidence), 4),
        "bert_intent": bert_intent or intent,
    }


def _clarify(question, options, domain="general", bert_intent="unclear"):
    return _nlp_result("unclear", domain, [], question, 0.35, needs_clarification=True,
                       question=question, options=options, bert_intent=bert_intent)


QUERY_RESPONSES = {
    "query_health": "Here's a quick look — open the Health tab or Dashboard for the full breakdown of your steps, sleep, water and mood.",
    "query_finance": "Check the Finance tab or Dashboard for your spending by category, income and savings rate.",
    "get_insight": "Generating your weekly insights now — head to the Dashboard to see patterns and recommendations.",
    "set_goal": "You can set goals from the Dashboard. Tell me the target (e.g. \"sleep 8 hours\" or \"save $200 a week\").",
    "edit_entry": "You can edit or delete any entry from the Health or Finance tab — tap the entry, then Edit or Delete.",
}


def parse(message: str, use_model: bool = True, context: Optional[dict] = None) -> dict:
    """Full NLP parse: intent (BERT) + domain (BERT) + entities (rules).

    When the user asks for advice, returns reasoned cross-domain advice as the
    `response` while still keeping any extracted entities so the data is logged.
    """
    text = normalize_text(message)
    if not text:
        return _clarify(
            "I couldn't read that. Try something like \"spent $12 on lunch\" or \"walked 5000 steps\".",
            ["Spent $20 on food", "Walked 5000 steps", "Slept 7 hours"],
        )

    # 1) Fast greeting short-circuit (cheap, avoids a model call)
    if GREETING_RE.search(text) and not extract_entities(text):
        return _nlp_result(
            "query_general", "general", [],
            'Hi! Tell me something like "spent $12 on lunch" or "walked 5000 steps" and I\'ll log it.',
            0.9, bert_intent="query_general",
        )

    # 2) Entity extraction (deterministic)
    entities = extract_entities(text)

    # 3) BERT intent detection
    bert_intent, bert_conf = ("unclear", 0.0)
    if use_model:
        try:
            bert_intent, bert_conf = _classifier.classify_intent(text)
        except Exception as exc:  # model failure must not break parsing
            print(f"[bert] intent classification failed: {exc}")

    # 3.5) Advice request → reason and advise (cross-domain) instead of just
    #      logging. Entities are still kept so the data is recorded too.
    if advice_engine.wants_advice(text) or (bert_intent == "get_insight" and bert_conf >= 0.6):
        domains = {e["domain"] for e in entities}
        domain = next(iter(domains)) if len(domains) == 1 else "both"
        response = advice_engine.compose_advice(text, entities, context)
        return _nlp_result("get_advice", domain, entities, response,
                           max(0.9, bert_conf), cross=len(domains) > 1,
                           bert_intent=bert_intent or "get_insight")

    if entities:
        # Logging case — domain & intent derived from the (reliable) entities,
        # BERT confidence retained for transparency.
        domains = {e["domain"] for e in entities}
        if len(domains) > 1:
            domain, intent = "both", "log_both"
            cross = True
        else:
            domain = next(iter(domains))
            intent = "log_finance" if domain == "finance" else "log_health"
            cross = False
        confidence = max(0.9, bert_conf) if bert_intent.startswith("log") else 0.9
        response = "Logged " + " and ".join(summarize_entity(e) for e in entities) + "."
        return _nlp_result(intent, domain, entities, response, confidence,
                           cross=cross, bert_intent=bert_intent)

    # 4) No entities → a query / insight / goal / edit / greeting / unclear.
    #    This is where BERT does the heavy lifting.
    if use_model and bert_conf >= 0.55 and bert_intent in QUERY_RESPONSES:
        domain = (
            "health" if bert_intent == "query_health"
            else "finance" if bert_intent == "query_finance"
            else "both" if bert_intent == "get_insight"
            else "general"
        )
        return _nlp_result(bert_intent, domain, [], QUERY_RESPONSES[bert_intent],
                           bert_conf, bert_intent=bert_intent)

    if use_model and bert_intent == "query_general" and bert_conf >= 0.55:
        return _nlp_result("query_general", "general", [],
                           "I'm here to help you track health and spending. Try \"slept 7 hours\" or \"spent $30 on groceries\".",
                           bert_conf, bert_intent=bert_intent)

    # 5) Rule fallbacks when the model is unsure or disabled
    if INSIGHT_RE.search(text):
        return _nlp_result("get_insight", "both", [], QUERY_RESPONSES["get_insight"], 0.7, bert_intent=bert_intent)
    if GOAL_RE.search(text):
        return _nlp_result("set_goal", "general", [], QUERY_RESPONSES["set_goal"], 0.65, bert_intent=bert_intent)
    if EDIT_RE.search(text):
        return _nlp_result("edit_entry", "general", [], QUERY_RESPONSES["edit_entry"], 0.65, bert_intent=bert_intent)
    if QUERY_RE.search(text):
        domain = "finance" if re.search(r"\b(spend|spent|money|budget|expense|income|save|saving)\b", text, re.I) else "health"
        return _nlp_result(f"query_{domain}", domain, [], QUERY_RESPONSES[f"query_{domain}"], 0.6, bert_intent=bert_intent)

    # 6) Genuinely unclear
    return _clarify(
        "I couldn't tell what to save yet. Add a number and what it was for.",
        ["Spent $20 on food", "Walked 5000 steps", "Slept 7 hours"],
        bert_intent=bert_intent,
    )
