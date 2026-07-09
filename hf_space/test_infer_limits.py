"""Pure tests for HF Space input clamps (no model load)."""

from __future__ import annotations

import os
import unittest

# Avoid importing app.py (loads torch + hub). Test clamp helpers in isolation.
MAX_INPUT_CHARS = int(os.getenv("HF_SPACE_MAX_INPUT_CHARS", "8000"))
MAX_NEW_TOKENS_CAP = int(os.getenv("HF_SPACE_MAX_NEW_TOKENS", "1024"))


def clamp_prompt(value, max_chars=MAX_INPUT_CHARS) -> str:
    return str(value or "")[:max_chars]


def clamp_max_tokens(max_tokens, cap=MAX_NEW_TOKENS_CAP) -> int:
    try:
        requested = int(max_tokens) if max_tokens else 512
    except (TypeError, ValueError):
        requested = 512
    return max(1, min(requested, cap))


class InferLimitTests(unittest.TestCase):
    def test_prompt_clamped(self):
        huge = "a" * 50_000
        out = clamp_prompt(huge)
        self.assertEqual(len(out), MAX_INPUT_CHARS)

    def test_empty_prompt(self):
        self.assertEqual(clamp_prompt(None), "")
        self.assertEqual(clamp_prompt(""), "")

    def test_max_tokens_capped(self):
        self.assertEqual(clamp_max_tokens(999_999), MAX_NEW_TOKENS_CAP)
        # 0 / None are falsy → default 512 then clamp
        self.assertEqual(clamp_max_tokens(0), 512)
        self.assertEqual(clamp_max_tokens("nope"), 512)
        self.assertEqual(clamp_max_tokens(128), 128)

    def test_emoji_and_arabic_preserved_within_cap(self):
        text = "مرحبا 🌍 " * 10
        self.assertEqual(clamp_prompt(text), text)


if __name__ == "__main__":
    unittest.main()
