"""
LifeSync BERT insights enrichment.

The Node statistical engine (``insightEngine.js``) computes correlations and
scores. This module adds the *language* layer the dashboard shows: BERT
classifies the emotional tone of the week and the spending behaviour, then a
template composes a natural-language summary and recommendations.

Input is weekly aggregates (the same shape the Node side already produces):

    {
      "health":  [{"type":"sleep","avg_value":6.2,"total_value":...,"entry_count":5}, ...],
      "finance": [{"type":"expense","total":420,"count":12,"category":{"name":"Food & Dining"}}, ...],
      "prev":    {"expense_total": 300, "income_total": 0},   # optional
      "notes":   ["felt great after the gym", ...]            # optional free text
    }
"""

from __future__ import annotations

from typing import Optional

from nlp_engine import _classifier, model_label

SENTIMENT_HYPOTHESES = {
    "positive": "This describes a healthy, positive, well-balanced week.",
    "neutral": "This describes an average, ordinary week.",
    "concerning": "This describes an unhealthy or financially stressful week that needs attention.",
}

SPENDING_HYPOTHESES = {
    "disciplined": "The person is saving money and spending carefully.",
    "balanced": "The person's spending is balanced and reasonable.",
    "overspending": "The person is overspending and not saving enough money.",
}


def _num(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _health_avg(health: list[dict], type_name: str) -> Optional[float]:
    for row in health or []:
        if row.get("type") == type_name and row.get("avg_value") is not None:
            return _num(row.get("avg_value"))
    return None


def _health_total(health: list[dict], type_name: str) -> Optional[float]:
    for row in health or []:
        if row.get("type") == type_name and row.get("total_value") is not None:
            return _num(row.get("total_value"))
    return None


def compute_health_score(health: list[dict]) -> int:
    score = 50
    sleep = _health_avg(health, "sleep")
    if sleep is not None:
        score += 15 if 7 <= sleep <= 9 else 8 if sleep >= 6 else -5
    mood = _health_avg(health, "mood")
    if mood is not None:
        score += min(15, round((mood / 10) * 15))
    steps_total = _health_total(health, "steps")
    if steps_total is not None:
        daily = steps_total / 7
        score += 10 if daily >= 10000 else 6 if daily >= 7000 else 3 if daily >= 4000 else 0
    water = _health_avg(health, "water")
    if water is not None:
        score += 10 if water >= 2 else 5 if water >= 1.5 else 0
    return max(0, min(100, score))


def _finance_totals(finance: list[dict]) -> tuple[float, float]:
    income = sum(_num(r.get("total")) for r in finance or [] if r.get("type") == "income")
    expenses = sum(_num(r.get("total")) for r in finance or [] if r.get("type") == "expense")
    return income, expenses


def compute_financial_score(finance: list[dict]) -> int:
    score = 50
    income, expenses = _finance_totals(finance)
    if income > 0:
        rate = (income - expenses) / income
        score += 25 if rate > 0.3 else 20 if rate > 0.2 else 10 if rate > 0.1 else 5 if rate > 0 else -10
    expense_rows = [r for r in finance or [] if r.get("type") == "expense"]
    total_expense = expenses or 1
    if expense_rows:
        top = max(expense_rows, key=lambda r: _num(r.get("total")))
        if _num(top.get("total")) / total_expense < 0.35:
            score += 10
    return max(0, min(100, score))


def _top_categories(finance: list[dict], expenses: float) -> list[dict]:
    rows = [r for r in finance or [] if r.get("type") == "expense"]
    rows.sort(key=lambda r: _num(r.get("total")), reverse=True)
    out = []
    for r in rows[:3]:
        cat = (r.get("category") or {}).get("name") if isinstance(r.get("category"), dict) else r.get("category")
        amount = _num(r.get("total"))
        out.append({
            "category": cat or "Uncategorized",
            "amount": round(amount, 2),
            "percentage": round((amount / expenses) * 100, 1) if expenses else 0,
        })
    return out


def _week_sentence(health: list[dict], finance: list[dict]) -> str:
    parts = []
    sleep = _health_avg(health, "sleep")
    if sleep is not None:
        parts.append(f"I slept about {sleep:.1f} hours a night")
    mood = _health_avg(health, "mood")
    if mood is not None:
        parts.append(f"my mood averaged {mood:.1f} out of 10")
    steps = _health_total(health, "steps")
    if steps is not None:
        parts.append(f"I walked around {int(steps / 7):,} steps a day")
    income, expenses = _finance_totals(finance)
    if income or expenses:
        parts.append(f"I earned ${income:.0f} and spent ${expenses:.0f}")
    return ". ".join(parts) + "." if parts else "I did not log much this week."


def generate(payload: dict, use_model: bool = True) -> dict:
    health = payload.get("health") or []
    finance = payload.get("finance") or []
    prev = payload.get("prev") or {}

    income, expenses = _finance_totals(finance)
    health_score = compute_health_score(health)
    financial_score = compute_financial_score(finance)
    savings_rate = round(((income - expenses) / income) * 100, 1) if income > 0 else 0
    top_categories = _top_categories(finance, expenses)

    # trends from previous week
    prev_expense = _num(prev.get("expense_total"))
    spending_trend = "insufficient_data"
    if prev_expense > 0:
        if expenses > prev_expense * 1.1:
            spending_trend = "increasing"
        elif expenses < prev_expense * 0.9:
            spending_trend = "decreasing"
        else:
            spending_trend = "stable"
    mood = _health_avg(health, "mood")
    mood_trend = "insufficient_data"
    if mood is not None:
        mood_trend = "improving" if mood >= 7 else "declining" if mood <= 4 else "stable"

    # ── BERT layer ──────────────────────────────────────────────────────────
    # The hard numbers are the anchor (mood avg, savings rate are exact). BERT
    # classifies the *language* — the user's own mood notes — which is what it
    # is genuinely good at, and breaks ties when the numbers are ambiguous.
    sentence = _week_sentence(health, finance)
    notes = [n for n in (payload.get("notes") or []) if isinstance(n, str) and n.strip()]

    rule_mood = (
        "positive" if (mood is not None and mood >= 7)
        else "concerning" if (mood is not None and mood <= 4)
        else "neutral"
    )
    rule_spend = (
        "disciplined" if (income > 0 and savings_rate >= 20)
        else "overspending" if ((income > 0 and savings_rate < 0) or (expenses > 0 and income == 0))
        else "balanced"
    )
    mood_sentiment, spending_behavior, model_used = rule_mood, rule_spend, "rules"

    if use_model:
        # BERT sentiment over the user's own words (its core competency)
        if notes:
            sent = _classifier.zero_shot(" ".join(notes)[:512], SENTIMENT_HYPOTHESES)
            if sent and sent[1] >= 0.55:
                mood_sentiment = sent[0]
                model_used = model_label()
        # Ambiguous numbers → let BERT read the summarised week
        elif rule_mood == "neutral":
            sent = _classifier.zero_shot(sentence, SENTIMENT_HYPOTHESES)
            if sent and sent[1] >= 0.7:
                mood_sentiment = sent[0]
                model_used = model_label()
        # Spending: numbers are exact, only let BERT refine the "balanced" middle
        if rule_spend == "balanced" and (income or expenses):
            spend = _classifier.zero_shot(
                f"I earned ${income:.0f} and spent ${expenses:.0f} this week.", SPENDING_HYPOTHESES
            )
            if spend and spend[1] >= 0.7:
                spending_behavior = spend[0]
                if model_used == "rules":
                    model_used = model_label()

    # ── narrative + recommendations ──────────────────────────────────────────
    patterns, recommendations = [], []

    if mood is not None:
        patterns.append({
            "observation": f"Average mood was {mood:.1f}/10 ({mood_sentiment}).",
            "domain": "health", "trend": mood_trend,
            "severity": "positive" if mood_sentiment == "positive" else "concerning" if mood_sentiment == "concerning" else "neutral",
        })
    sleep = _health_avg(health, "sleep")
    if sleep is not None:
        patterns.append({
            "observation": f"You averaged {sleep:.1f} hours of sleep.",
            "domain": "health",
            "trend": "stable",
            "severity": "positive" if 7 <= sleep <= 9 else "concerning" if sleep < 6 else "neutral",
        })
        if sleep < 7:
            recommendations.append({
                "text": f"Aim for 7-8 hours of sleep — you're averaging {sleep:.1f}.",
                "priority": "high", "domain": "health",
                "reason": "Consistent sleep improves mood and reduces impulse spending.",
            })

    if income or expenses:
        patterns.append({
            "observation": f"Spent ${expenses:.0f} against ${income:.0f} income (savings rate {savings_rate:.0f}%).",
            "domain": "finance", "trend": spending_trend,
            "severity": "concerning" if spending_behavior == "overspending" else "positive" if spending_behavior == "disciplined" else "neutral",
        })
        if spending_behavior == "overspending" or (income > 0 and savings_rate < 10):
            recommendations.append({
                "text": "Your savings rate is low — try capping discretionary spending to lift it above 20%.",
                "priority": "high", "domain": "finance",
                "reason": f"This week: ${income:.0f} income vs ${expenses:.0f} expenses.",
            })
        if top_categories and top_categories[0]["percentage"] > 35:
            recommendations.append({
                "text": f"{top_categories[0]['category']} is {top_categories[0]['percentage']:.0f}% of spending — consider a weekly cap.",
                "priority": "medium", "domain": "finance",
                "reason": f"${top_categories[0]['amount']:.0f} spent on {top_categories[0]['category']}.",
            })

    if not recommendations:
        recommendations.append({
            "text": "Log at least one health item and one expense each day for sharper weekly insights.",
            "priority": "medium", "domain": "both",
            "reason": "More consistent data lets BERT detect cross-domain patterns.",
        })

    cross = ""
    if mood_sentiment == "concerning" and spending_behavior == "overspending":
        cross = "Low mood and overspending showed up together this week — protecting sleep and a small daily spending cap can help both."

    headline = {
        "positive": "Strong week — your health and money habits are working together. 🎯",
        "neutral": "A steady week. A couple of small tweaks could move the needle.",
        "concerning": "A tough week — let's focus on sleep and spending to turn it around.",
    }[mood_sentiment]

    summary = headline + " " + sentence

    return {
        "summary": summary,
        "headline": headline,
        "patterns": patterns,
        "recommendations": recommendations[:5],
        "cross_domain_insights": cross,
        "mood_trend": mood_trend,
        "spending_trend": spending_trend,
        "mood_sentiment": mood_sentiment,
        "spending_behavior": spending_behavior,
        "health_score": health_score,
        "financial_health_score": financial_score,
        "savings_rate": savings_rate,
        "top_categories": top_categories,
        "model_used": model_used,
    }
