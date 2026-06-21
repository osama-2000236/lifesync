"""
Generate the LifeSync intent-classification dataset.

Produces a balanced, deterministic set of labelled chat messages across the
eight LifeSync intents (matching ``nlp_engine.INTENT_LABELS``) by filling
natural-language templates with realistic slot values. Output is JSONL:

    {"text": "spent $20 on lunch", "label": "log_finance"}

Usage:
    python build_dataset.py                       # writes train.jsonl / val.jsonl
    python build_dataset.py --per-class 600 --out .
"""

from __future__ import annotations

import argparse
import json
import os
import random

INTENT_LABELS = [
    "log_health", "log_finance", "query_health", "query_finance",
    "get_insight", "set_goal", "edit_entry", "query_general",
]

ITEMS = ["lunch", "coffee", "groceries", "dinner", "a taxi", "gas", "a movie ticket",
         "new shoes", "a book", "medicine", "the internet bill", "rent", "snacks",
         "breakfast", "a haircut", "parking", "a gym membership", "headphones"]
INCOME_SRC = ["my salary", "a freelance project", "a client", "selling my old phone",
              "a side gig", "my paycheck", "a bonus"]
HEALTH_CATS = ["sleep", "steps", "water", "mood", "exercise", "calories", "my workouts"]
FIN_CATS = ["food", "transport", "shopping", "entertainment", "groceries", "bills"]
MOODS = ["great", "happy", "okay", "tired", "stressed", "amazing", "down", "fine"]


def _amt(rng): return rng.choice(["5", "12", "20", "8.50", "35", "100", "15", "60", "250", "7"])
def _steps(rng): return rng.choice(["3000", "5000", "8000", "10000", "6500", "12000"])
def _hours(rng): return rng.choice(["5", "6", "6.5", "7", "8", "9"])
def _mins(rng): return rng.choice(["20", "30", "45", "60", "15", "90"])
def _water(rng): return rng.choice(["1", "1.5", "2", "2.5", "500ml", "8 glasses"])


def _health(rng):
    return rng.choice([
        f"I walked {_steps(rng)} steps today",
        f"did {_steps(rng)} steps",
        f"slept {_hours(rng)} hours last night",
        f"I slept {_hours(rng)} hours",
        f"drank {_water(rng)} of water",
        f"had {_water(rng)} water today",
        f"went for a {_mins(rng)} minute run",
        f"{_mins(rng)} minutes at the gym",
        f"did a {_mins(rng)} min workout",
        f"feeling {rng.choice(MOODS)} today",
        f"my mood is {rng.randint(1,10)}/10",
        f"heart rate was {rng.randint(60,150)} bpm",
        f"ate a {rng.choice(['healthy','big','light'])} {rng.choice(['breakfast','lunch','dinner'])}",
        f"jogged for {_mins(rng)} minutes this morning",
    ])


def _finance(rng):
    return rng.choice([
        f"spent ${_amt(rng)} on {rng.choice(ITEMS)}",
        f"I paid ${_amt(rng)} for {rng.choice(ITEMS)}",
        f"bought {rng.choice(ITEMS)} for ${_amt(rng)}",
        f"just spent {_amt(rng)} on {rng.choice(ITEMS)}",
        f"earned ${_amt(rng)}0 from {rng.choice(INCOME_SRC)}",
        f"got ${_amt(rng)}0 from {rng.choice(INCOME_SRC)}",
        f"received my salary of ${_amt(rng)}00",
        f"${_amt(rng)} on {rng.choice(ITEMS)}",
        f"paid the {rng.choice(['rent','electricity','water','internet'])} bill, ${_amt(rng)}0",
    ])


TIME = ["today", "this week", "this month", "lately", "yesterday", "so far", "recently"]
ASK = ["how much", "how many", "what is", "what's", "tell me", "show me", "do you know"]
POLITE = ["", "", "", "can you ", "could you ", "please ", "hey, "]


def _query_health(rng):
    metric = rng.choice(HEALTH_CATS)
    t = rng.choice(TIME)
    base = rng.choice([
        f"how many steps did I take {t}?",
        f"what's my average {metric} {t}?",
        f"how am I doing on {metric}?",
        f"how much did I sleep {t}?",
        f"what was my mood like {t}?",
        f"did I drink enough water {t}?",
        f"show me my {metric} {t}",
        f"how many calories did I eat {t}?",
        f"what's my {rng.choice(['step count','sleep average','water intake','heart rate'])}?",
        f"{rng.choice(ASK)} {metric} did I track {t}?",
        f"am I getting enough {rng.choice(['sleep','steps','water','exercise'])}?",
        f"how active have I been {t}?",
    ])
    return (rng.choice(POLITE) + base).strip()


def _query_finance(rng):
    cat = rng.choice(FIN_CATS)
    t = rng.choice(TIME)
    base = rng.choice([
        f"how much did I spend on {cat} {t}?",
        f"how much have I spent {t}?",
        f"what's my biggest expense {t}?",
        f"how much did I earn {t}?",
        "what's my savings rate?",
        f"how much money is left in my budget {t}?",
        f"what did I spend on {cat} {t}?",
        f"how much do I spend on {cat} on average?",
        f"{rng.choice(ASK)} did I spend on {cat}?",
        f"what are my top spending categories {t}?",
        f"did I stay within budget {t}?",
        f"how much income did I get {t}?",
    ])
    return (rng.choice(POLITE) + base).strip()


def _insight(rng):
    t = rng.choice(TIME)
    base = rng.choice([
        f"show me my {rng.choice(['weekly','latest',''])} insights".replace("  ", " "),
        f"give me a summary of my {rng.choice(['week','month','progress'])}",
        "what patterns do you see?",
        "any recommendations for me?",
        f"how am I doing overall {t}?",
        f"analyze my {rng.choice(['week','data','habits','progress'])}",
        "generate my weekly report",
        f"what should I improve {t}?",
        "give me some advice",
        "summarize my health and spending",
        f"what are my trends {t}?",
        "how can I do better?",
        "what does my data say about me?",
        "review my week for me",
    ])
    return (rng.choice(POLITE) + base).strip()


def _goal(rng):
    return rng.choice([
        f"set a goal to sleep {_hours(rng)} hours",
        f"I want to save ${_amt(rng)}0 a {rng.choice(['week','month'])}",
        f"my goal is {_steps(rng)} steps a day",
        f"I want to reduce my spending to ${_amt(rng)}0",
        f"set a target of {_water(rng)} water daily",
        f"I want to walk {_steps(rng)} steps a day",
        f"aim for {_mins(rng)} minutes of exercise daily",
        f"set a {rng.choice(['budget','spending'])} limit for {rng.choice(FIN_CATS)}",
        f"target {_hours(rng)} hours of sleep every night",
        f"I want to hit {_steps(rng)} steps {rng.choice(['daily','this week'])}",
        f"my target is to spend under ${_amt(rng)}0 on {rng.choice(FIN_CATS)}",
        f"set a goal of {_mins(rng)} min {rng.choice(['running','workout','cardio'])}",
        f"I'd like to save ${_amt(rng)}00 this month",
    ])


def _edit(rng):
    entry = rng.choice(["expense", "transaction", "sleep entry", "steps", "water intake",
                        "mood", "last log", "health entry", "coffee expense", "workout"])
    return rng.choice([
        f"delete my last {entry}",
        f"remove that {entry}",
        f"edit my {entry}",
        f"change my mood to {rng.randint(1,10)}",
        f"undo the last {rng.choice(['log','entry'])}",
        f"correct the {rng.choice(['steps','amount','hours'])} I logged",
        f"update my {entry}",
        f"fix the {entry} I just added",
        f"the {entry} is wrong, change it",
        f"cancel my last {entry}",
    ])


def _general(rng):
    return rng.choice([
        "hi", "hello", "hey there", "good morning", "good evening", "good afternoon",
        "thanks", "thank you", "thanks a lot", "who are you?", "what can you do?",
        "help", "how does this work?", "what is LifeSync?", "what are you?",
        "tell me a joke", "ok", "okay", "cool", "nice", "great", "sounds good",
        "how are you?", "what should I tell you?", "give me an example",
        "yo", "sup", "hey", "morning", "evening", "are you a bot?",
    ])


GENERATORS = {
    "log_health": _health,
    "log_finance": _finance,
    "query_health": _query_health,
    "query_finance": _query_finance,
    "get_insight": _insight,
    "set_goal": _goal,
    "edit_entry": _edit,
    "query_general": _general,
}


def build(per_class: int, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    rows = []
    for label, gen in GENERATORS.items():
        seen = set()
        attempts = 0
        while len([r for r in rows if r["label"] == label]) < per_class and attempts < per_class * 20:
            text = gen(rng)
            attempts += 1
            key = (label, text)
            if key in seen:
                continue
            seen.add(key)
            rows.append({"text": text, "label": label})
    rng.shuffle(rows)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-class", type=int, default=400)
    parser.add_argument("--val-frac", type=float, default=0.15)
    parser.add_argument("--out", default=os.path.dirname(os.path.abspath(__file__)))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rows = build(args.per_class, args.seed)
    split = int(len(rows) * (1 - args.val_frac))
    train, val = rows[:split], rows[split:]

    os.makedirs(args.out, exist_ok=True)
    for name, data in [("train.jsonl", train), ("val.jsonl", val)]:
        path = os.path.join(args.out, name)
        with open(path, "w", encoding="utf-8") as fh:
            for row in data:
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        # print filename only — the absolute path may contain non-cp1252 chars
        print(f"wrote {len(data):>5} examples -> {name}")

    # class balance report
    from collections import Counter
    print("class balance:", dict(Counter(r["label"] for r in rows)))


if __name__ == "__main__":
    main()
