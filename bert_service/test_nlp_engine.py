"""
Unit tests for the LifeSync BERT NLP engine (rule layer).

Run with the model disabled so the suite is fast and offline:
    BERT_DISABLE_MODEL=1 python -m pytest bert_service/test_nlp_engine.py -q
"""

import os

os.environ.setdefault("BERT_DISABLE_MODEL", "1")

import nlp_engine as ne  # noqa: E402
import insights_engine as ie  # noqa: E402
import advice_engine as ae  # noqa: E402


# ── entity extraction ────────────────────────────────────────────────────────

def test_steps_entity():
    ents = ne.extract_entities("I walked 5000 steps today")
    assert len(ents) == 1
    assert ents[0]["type"] == "steps"
    assert ents[0]["value"] == 5000
    assert ents[0]["domain"] == "health"


def test_sleep_entity_pdf_example():
    # PDF example: "I slept 6 hours" -> { activity: sleep, duration: 6h }
    ents = ne.extract_entities("I slept 6 hours")
    assert ents[0]["type"] == "sleep"
    assert ents[0]["value"] == 6
    assert ents[0]["duration"] == 360


def test_expense_entity_pdf_example():
    # PDF example: "I spent $50 on a healthy dinner"
    ents = ne.extract_entities("I spent $50 on a healthy dinner")
    fin = [e for e in ents if e["domain"] == "finance"][0]
    assert fin["amount"] == 50
    assert fin["type"] == "expense"
    assert fin["category"] == "Food & Dining"


def test_water_normalized_to_liters():
    ents = ne.extract_entities("drank 500ml of water")
    water = [e for e in ents if e["type"] == "water"][0]
    assert water["value"] == 0.5


def test_cross_domain_extraction():
    ents = ne.extract_entities("I slept 7 hours and spent $15 on breakfast")
    domains = {e["domain"] for e in ents}
    assert domains == {"health", "finance"}


def test_steps_number_not_treated_as_money():
    ents = ne.extract_entities("I walked 5000 steps")
    assert all(e["domain"] == "health" for e in ents)


# ── parse (rules-only, model disabled) ───────────────────────────────────────

def test_parse_finance_log():
    res = ne.parse("I spent 10 dollars on coffee", use_model=False)
    assert res["intent"] == "log_finance"
    assert res["domain"] == "finance"
    assert res["entities"][0]["amount"] == 10
    assert res["needs_clarification"] is False


def test_parse_cross_domain():
    res = ne.parse("I slept 7 hours and spent $15 on breakfast", use_model=False)
    assert res["intent"] == "log_both"
    assert res["domain"] == "both"
    assert res["is_cross_domain"] is True
    assert len(res["entities"]) == 2


def test_parse_greeting():
    res = ne.parse("hello there", use_model=False)
    assert res["intent"] == "query_general"
    assert res["entities"] == []


def test_parse_unclear_clarifies():
    res = ne.parse("asdfghjkl", use_model=False)
    assert res["needs_clarification"] is True
    assert res["clarification_options"]


def test_parse_insight_request_rule_fallback():
    res = ne.parse("show me my weekly insights", use_model=False)
    assert res["intent"] == "get_insight"


def test_parse_shape_has_required_keys():
    res = ne.parse("walked 8000 steps", use_model=False)
    for key in ("intent", "domain", "entities", "response", "is_cross_domain",
                "needs_clarification", "clarification_question",
                "clarification_options", "confidence", "bert_intent"):
        assert key in res


# ── insights engine (rules-only) ─────────────────────────────────────────────

def test_insights_scores_and_shape():
    payload = {
        "health": [
            {"type": "sleep", "avg_value": 6.0, "total_value": 42, "entry_count": 7},
            {"type": "mood", "avg_value": 4.0, "total_value": 28, "entry_count": 7},
            {"type": "steps", "avg_value": 5000, "total_value": 35000, "entry_count": 7},
        ],
        "finance": [
            {"type": "income", "total": 1000, "count": 1},
            {"type": "expense", "total": 950, "count": 20, "category": {"name": "Food & Dining"}},
        ],
        "prev": {"expense_total": 600},
    }
    res = ie.generate(payload, use_model=False)
    assert 0 <= res["health_score"] <= 100
    assert 0 <= res["financial_health_score"] <= 100
    assert res["spending_trend"] == "increasing"
    assert isinstance(res["recommendations"], list)
    assert res["summary"]
    # low sleep + low savings should produce at least one high-priority rec
    assert any(r["priority"] == "high" for r in res["recommendations"])


def test_insights_handles_empty():
    res = ie.generate({"health": [], "finance": []}, use_model=False)
    assert res["health_score"] == 50
    assert res["recommendations"]


# ── advice engine ────────────────────────────────────────────────────────────

EXAMPLE = ("ok i slept for 16 hours and i eat nothing, what is your advice for me, "
           "i have 20 ils, what i buy to get the best healthy food and to get best mood")


def test_wants_advice_detects_request():
    assert ae.wants_advice(EXAMPLE) is True
    assert ae.wants_advice("what should I buy with 20 ils?") is True
    assert ae.wants_advice("i walked 5000 steps") is False


def test_extract_constraints_from_example():
    ents = ne.extract_entities(EXAMPLE)
    c = ae.extract_constraints(EXAMPLE, ents)
    assert c["sleep_hours"] == 16
    assert c["ate_nothing"] is True
    assert c["budget"] == {"amount": 20.0, "symbol": "₪"}
    assert "mood" in c["goals"] and "food" in c["goals"]


def test_budget_optimizer_stays_within_budget():
    basket = ae.optimize_basket(20, ["mood", "food"])
    assert basket["items"]
    assert basket["total"] <= 20


def test_compose_advice_is_cross_domain_and_specific():
    ents = ne.extract_entities(EXAMPLE)
    advice = ae.compose_advice(EXAMPLE, ents)
    assert "oversleeping" in advice.lower()
    assert "eat" in advice.lower()           # tells them to eat
    assert "₪" in advice                     # budget basket in ILS
    assert "banan" in advice.lower() or "egg" in advice.lower()  # concrete foods


def test_parse_advice_returns_advice_and_keeps_entities():
    res = ne.parse(EXAMPLE, use_model=False)
    assert res["intent"] == "get_advice"
    # sleep entity still extracted so the data is logged
    assert any(e["type"] == "sleep" and e["value"] == 16 for e in res["entities"])
    # response is real advice, not "Logged ..."
    assert not res["response"].startswith("Logged")
    assert "₪" in res["response"]


def test_advice_exercise_and_hydration():
    advice = ae.compose_advice("what should I do to feel more energetic and active?", [])
    assert "walk" in advice.lower() or "move" in advice.lower()


def test_advice_savings_uses_context():
    ctx = {
        "health": [],
        "finance": {"income": 1000, "expenses": 950, "top_category": "Food & Dining"},
    }
    advice = ae.compose_advice("how can I save more money?", [], ctx)
    assert "savings rate" in advice.lower()
    assert "Food & Dining" in advice


def test_advice_personalizes_from_context():
    ctx = {
        "health": [{"type": "sleep", "avg_value": 5.2}, {"type": "steps", "total_value": 21000}],
        "finance": {"income": 0, "expenses": 120, "top_category": "Shopping"},
    }
    advice = ae.compose_advice("any advice for me?", [], ctx)
    assert "this week" in advice.lower()       # references their real data
    assert "5.2h" in advice or "5.2" in advice
