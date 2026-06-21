"""
LifeSync cross-domain Advice Engine.

Turns a parsed message into *actionable, cross-domain advice* instead of just
logging it. It reasons over health + finance signals (sleep, eating, budget,
mood goals) using a small knowledge base and a budget-aware food optimizer.

Fully local and deterministic — no LLM required. The chat NLU (BERT) decides
*when* advice is wanted; this module decides *what* to say.

Example:
    "i slept 16 hours and ate nothing, i have 20 ils, what should I buy for the
     best healthy food and mood?"
  ->
    assessment of oversleeping + not eating, plus a ~₪20 mood/health grocery
    basket with prices and the reason each item helps.
"""

from __future__ import annotations

import re
from typing import Optional

# ── advice-request detection ────────────────────────────────────────────────

ADVICE_CUES = re.compile(
    r"\b(advice|advise|recommend|recommendation|suggest|suggestion|what should i|"
    r"what (?:can|do|shall) i|what to (?:buy|eat|do)|help me|how (?:can|do) i|"
    r"what would you|any tips|best (?:food|meal|thing|way)|to get (?:the )?best)\b",
    re.I,
)

BUY_CUES = re.compile(r"\b(buy|spend|afford|grocer|groceries|shop|meal|food|eat)\b", re.I)

# ── constraint extraction ────────────────────────────────────────────────────

CURRENCY_WORDS = {
    "ils": "₪", "nis": "₪", "shekel": "₪", "shekels": "₪", "₪": "₪",
    "usd": "$", "dollar": "$", "dollars": "$", "$": "$",
    "eur": "€", "euro": "€", "€": "€", "gbp": "£", "£": "£",
}

ATE_NOTHING = re.compile(
    r"\b(?:ate|eat|eaten|having)\s+nothing\b|\bnothing to eat\b|"
    r"\b(?:haven'?t|did\s?n'?t|didnt|not|never)\s+(?:eat|eaten|ate)\b|"
    r"\bskipped?\s+(?:meals?|breakfast|lunch|dinner|eating)\b|\bempty stomach\b|"
    r"\bstarv(?:ing|ed)\b",
    re.I,
)

GOAL_PATTERNS = {
    "mood": re.compile(r"\b(mood|happy|happier|feel better|depress|sad|energy|energiz)\b", re.I),
    "health": re.compile(r"\b(health|healthy|fit|nutrition|nutritious|well)\b", re.I),
    "food": re.compile(r"\b(eat|food|meal|buy|grocer)\b", re.I),
    "sleep": re.compile(r"\b(sleep|rest|tired|nap)\b", re.I),
    "exercise": re.compile(r"\b(exercise|workout|gym|run|jog|walk|active|move|fitness|steps|cardio)\b", re.I),
    "hydration": re.compile(r"\b(water|hydrat|drink|thirsty)\b", re.I),
    "savings": re.compile(r"\b(save|saving|budget|cheap|afford|spend less|cut (?:back|down)|money)\b", re.I),
}


def _budget(text: str) -> Optional[dict]:
    """Find an *available* amount (a budget to spend), e.g. 'i have 20 ils'."""
    m = re.search(
        r"(?:[$€£₪]\s?(\d+(?:\.\d{1,2})?))"
        r"|(\d+(?:\.\d{1,2})?)\s?(ils|nis|shekels?|usd|dollars?|eur|euros?|gbp|₪|\$|€|£)",
        text, re.I,
    )
    if not m:
        return None
    if m.group(1):
        amount = float(m.group(1))
        sym = next((c for c in "$€£₪" if c in m.group(0)), "$")
    else:
        amount = float(m.group(2))
        sym = CURRENCY_WORDS.get((m.group(3) or "").lower(), "$")
    return {"amount": amount, "symbol": sym}


def extract_constraints(text: str, entities: list[dict]) -> dict:
    by_type = {}
    for e in entities or []:
        by_type.setdefault(e.get("type"), e.get("value"))

    sleep_hours = by_type.get("sleep")
    if sleep_hours is None:
        m = re.search(r"slept?\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b", text, re.I)
        if m:
            sleep_hours = float(m.group(1))

    goals = [g for g, pat in GOAL_PATTERNS.items() if pat.search(text)]
    return {
        "sleep_hours": sleep_hours,
        "steps": by_type.get("steps"),
        "water": by_type.get("water"),
        "exercise_minutes": by_type.get("exercise"),
        "ate_nothing": bool(ATE_NOTHING.search(text)),
        "budget": _budget(text),
        "goals": goals,
    }


def _context_summary(context: Optional[dict]) -> dict:
    """Normalise the optional recent-stats context from the Node backend into
    averages/totals the advice can reference (cross-domain personalisation)."""
    out = {"avg_sleep": None, "daily_steps": None, "avg_water": None, "avg_mood": None,
           "income": 0.0, "expenses": 0.0, "savings_rate": None, "top_category": None}
    if not context:
        return out
    for row in context.get("health") or []:
        t = row.get("type")
        if t == "sleep" and row.get("avg_value") is not None:
            out["avg_sleep"] = round(float(row["avg_value"]), 1)
        elif t == "steps" and row.get("total_value") is not None:
            out["daily_steps"] = int(float(row["total_value"]) / 7)
        elif t == "water" and row.get("avg_value") is not None:
            out["avg_water"] = round(float(row["avg_value"]), 1)
        elif t == "mood" and row.get("avg_value") is not None:
            out["avg_mood"] = round(float(row["avg_value"]), 1)
    fin = context.get("finance") or {}
    out["income"] = float(fin.get("income") or 0)
    out["expenses"] = float(fin.get("expenses") or 0)
    out["top_category"] = fin.get("top_category")
    if out["income"] > 0:
        out["savings_rate"] = round(((out["income"] - out["expenses"]) / out["income"]) * 100)
    return out


def wants_advice(text: str) -> bool:
    if ADVICE_CUES.search(text):
        return True
    # "i have 20 ils ... food/buy?" reads as an advice request even without "advice"
    return bool(_budget(text) and BUY_CUES.search(text) and "?" in text)


# ── food knowledge base (approx. local grocery prices, normalised to ₪) ──────
# price is a rough per-unit cost; the optimizer scales it to the user's currency
# only for display — amounts are treated as comparable small-grocery units.

FOODS = [
    {"name": "bananas", "price": 5, "tags": ["mood", "energy"], "why": "B6 + carbs help produce serotonin"},
    {"name": "eggs (6)", "price": 8, "tags": ["protein", "filling"], "why": "protein + choline for steady energy and focus"},
    {"name": "dark chocolate", "price": 6, "tags": ["mood", "treat"], "why": "flavonoids lift mood quickly"},
    {"name": "plain yogurt", "price": 5, "tags": ["gut", "protein", "mood"], "why": "probiotics support the gut–mood link"},
    {"name": "oats (500g)", "price": 7, "tags": ["energy", "filling"], "why": "slow carbs keep energy and mood stable"},
    {"name": "lentils (500g)", "price": 6, "tags": ["protein", "iron", "filling"], "why": "cheap plant protein + iron to fight fatigue"},
    {"name": "oranges (3)", "price": 6, "tags": ["vitaminC", "mood"], "why": "vitamin C and hydration for a lift"},
    {"name": "milk (1L)", "price": 6, "tags": ["protein", "calm"], "why": "tryptophan + protein to steady mood"},
    {"name": "spinach", "price": 5, "tags": ["folate", "mood"], "why": "folate supports mood regulation"},
    {"name": "walnuts", "price": 9, "tags": ["omega3", "mood"], "why": "omega-3s are linked to lower low-mood risk"},
    {"name": "whole-grain bread", "price": 6, "tags": ["energy", "filling"], "why": "filling complex carbs"},
]


def optimize_basket(budget_amount: float, goals: list[str]) -> dict:
    """Greedy budget-aware basket favouring protein + mood + filling + variety."""
    mood_first = "mood" in goals
    # priority: a mood/energy carb + protein + (mood treat if mood-focused), then variety
    priority = [
        "bananas", "eggs (6)",
        "dark chocolate" if mood_first else "oats (500g)",
        "plain yogurt", "oats (500g)", "lentils (500g)", "oranges (3)",
        "spinach", "milk (1L)", "whole-grain bread", "walnuts",
    ]
    by_name = {f["name"]: f for f in FOODS}
    chosen, total, covered = [], 0.0, set()
    for name in priority:
        food = by_name.get(name)
        if not food or food in chosen:
            continue
        if total + food["price"] <= budget_amount:
            chosen.append(food)
            total += food["price"]
            covered.update(food["tags"])
    # try to fill remaining room with any affordable item not yet chosen
    for food in sorted(FOODS, key=lambda f: f["price"]):
        if food in chosen:
            continue
        if total + food["price"] <= budget_amount:
            chosen.append(food)
            total += food["price"]
            covered.update(food["tags"])
    return {"items": chosen, "total": round(total, 2), "covered": covered}


def _fmt(sym: str, amount: float) -> str:
    a = int(amount) if float(amount).is_integer() else round(amount, 2)
    return f"{sym}{a}"


def _hrs(v):
    return int(v) if float(v).is_integer() else v


def compose_advice(text: str, entities: list[dict], context: Optional[dict] = None) -> str:
    c = extract_constraints(text, entities)
    ctx = _context_summary(context)
    goals = c["goals"]
    parts: list[str] = []

    # 0) personalised lead from the user's real recent data (cross-domain)
    lead = []
    if ctx["avg_sleep"] is not None:
        lead.append(f"averaged {ctx['avg_sleep']}h sleep")
    if ctx["daily_steps"] is not None:
        lead.append(f"~{ctx['daily_steps']:,} steps/day")
    if ctx["expenses"]:
        lead.append(f"spent {_fmt('$', ctx['expenses'])}")
    if lead:
        parts.append("This week you've " + ", ".join(lead) + ".")

    # 1) sleep
    sh = c["sleep_hours"] if c["sleep_hours"] is not None else ctx["avg_sleep"]
    if sh is not None:
        if sh > 10:
            parts.append(f"Sleeping {_hrs(sh)} hours is oversleeping — aim for 7–9. Too much sleep often leaves you groggy and can lower mood, so set an alarm and get daylight early.")
        elif sh < 6:
            parts.append(f"{_hrs(sh)} hours is short on sleep — under-sleeping hurts mood and willpower (and drives impulse spending). Aim for 7–9 tonight.")
        else:
            parts.append(f"{_hrs(sh)} hours of sleep is a healthy range — keep it up.")

    # 2) not eating
    if c["ate_nothing"]:
        parts.append("You haven't eaten — low blood sugar alone tanks mood and energy, so eat something within the next hour.")

    # 3) budget-aware food + mood basket
    budget = c["budget"]
    if budget and (("food" in goals) or ("mood" in goals) or BUY_CUES.search(text)):
        sym, amt = budget["symbol"], budget["amount"]
        basket = optimize_basket(amt, goals)
        if basket["items"]:
            lines = ", ".join(f"{f['name']} ({_fmt(sym, f['price'])})" for f in basket["items"])
            parts.append(f"With {_fmt(sym, amt)} for healthy, mood-boosting food, a smart basket (~{_fmt(sym, basket['total'])}): {lines}.")
            reasons = "; ".join(f"{f['name'].split(' (')[0]} — {f['why']}" for f in basket["items"][:3])
            parts.append(f"Why these: {reasons}.")
            leftover = round(amt - basket["total"], 2)
            if leftover >= 1:
                parts.append(f"That leaves {_fmt(sym, leftover)} spare for water or fruit.")
        else:
            parts.append(f"{_fmt(sym, amt)} is tight — prioritise eggs and bananas: cheap, filling, good for mood.")

    # 4) exercise / activity
    logged_ex = c["exercise_minutes"] or (c["steps"] and c["steps"] >= 5000)
    low_activity = ctx["daily_steps"] is not None and ctx["daily_steps"] < 5000
    if logged_ex:
        parts.append("Nice work moving today — regular activity is one of the strongest mood and sleep boosters.")
    elif ("exercise" in goals) or low_activity or c["ate_nothing"] or (sh is not None and sh > 10):
        tip = "Get moving: a brisk 20–30 min walk (or ~7–8k steps) lifts mood, sharpens focus, and helps you sleep better tonight."
        if low_activity:
            tip = f"Your activity is low (~{ctx['daily_steps']:,} steps/day) — " + tip[0].lower() + tip[1:]
        parts.append(tip)

    # 5) hydration
    low_water = ctx["avg_water"] is not None and ctx["avg_water"] < 1.5
    if ("hydration" in goals) or low_water:
        msg = "Hydrate — aim for ~2L of water a day; even mild dehydration worsens mood and concentration."
        if low_water:
            msg = f"You're averaging only {ctx['avg_water']}L of water — " + msg[0].lower() + msg[1:]
        parts.append(msg)

    # 6) savings / budget
    if ("savings" in goals) and (ctx["income"] or ctx["expenses"]):
        if ctx["savings_rate"] is not None and ctx["savings_rate"] < 20:
            t = f"Your savings rate is {ctx['savings_rate']}% — target 20%+. "
            if ctx["top_category"]:
                t += f"Your biggest leak is {ctx['top_category']}; set a weekly cap there first."
            else:
                t += "Cap one discretionary category (eating out, delivery) for the week."
            parts.append(t)
        elif ctx["expenses"] > 0:
            parts.append(f"Spending is under control ({_fmt('$', ctx['expenses'])} this week) — automate a small weekly transfer to savings to lock it in.")
    elif ("savings" in goals) and not (ctx["income"] or ctx["expenses"]):
        parts.append("To save more, log your income and expenses for a week so I can find your biggest cuts — a quick win is capping one category like eating out.")

    # 7) mood quick wins (cross-domain close)
    if "mood" in goals or c["ate_nothing"] or (sh is not None and sh > 10) or (ctx["avg_mood"] is not None and ctx["avg_mood"] <= 4):
        parts.append("Quick mood lift: eat, drink water, and get 15 minutes of daylight or a short walk before your next task.")

    if not parts or (len(parts) == 1 and lead):
        parts.append("Tell me what you'd like advice on — sleep, food, mood, activity, or saving money — add any budget and I'll give you a specific plan.")

    return " ".join(parts)
