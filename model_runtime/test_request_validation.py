"""Unit tests for BERT classify request validation (no model weights required)."""

from __future__ import annotations

import json
import unittest

from request_validation import (
    MAX_TEXT_CHARS,
    parse_classify_text,
    parse_content_length,
    safe_error_name,
)


class ParseContentLengthTests(unittest.TestCase):
    def test_rejects_missing_or_zero(self):
        with self.assertRaises(ValueError) as ctx:
            parse_content_length(None)
        self.assertEqual(str(ctx.exception), "invalid_content_length")
        with self.assertRaises(ValueError):
            parse_content_length("0")

    def test_rejects_too_large(self):
        with self.assertRaises(ValueError) as ctx:
            parse_content_length("99999999")
        self.assertEqual(str(ctx.exception), "invalid_content_length")

    def test_accepts_reasonable(self):
        self.assertEqual(parse_content_length("128"), 128)


class ParseClassifyTextTests(unittest.TestCase):
    def test_happy_path_strip(self):
        raw = json.dumps({"text": "  hello world  "}).encode()
        self.assertEqual(parse_classify_text(raw), "hello world")

    def test_empty_and_whitespace_rejected(self):
        for payload in ({"text": ""}, {"text": "   "}, {}, {"text": None}):
            with self.assertRaises(ValueError) as ctx:
                parse_classify_text(json.dumps(payload).encode())
            self.assertEqual(str(ctx.exception), "text_required")

    def test_emoji_and_arabic_ok(self):
        text = "صرفت 50 😀 على قهوة"
        raw = json.dumps({"text": text}, ensure_ascii=False).encode("utf-8")
        self.assertEqual(parse_classify_text(raw), text)

    def test_too_long_rejected(self):
        huge = "x" * (MAX_TEXT_CHARS + 1)
        with self.assertRaises(ValueError) as ctx:
            parse_classify_text(json.dumps({"text": huge}).encode())
        self.assertEqual(str(ctx.exception), "text_too_long")

    def test_invalid_json(self):
        with self.assertRaises(ValueError) as ctx:
            parse_classify_text(b"{not json")
        self.assertEqual(str(ctx.exception), "invalid_json")

    def test_body_byte_cap(self):
        # Oversized raw blob before JSON parse.
        raw = b"x" * 20_000
        with self.assertRaises(ValueError) as ctx:
            parse_classify_text(raw)
        self.assertEqual(str(ctx.exception), "invalid_content_length")


class SafeErrorNameTests(unittest.TestCase):
    def test_known_value_error(self):
        self.assertEqual(safe_error_name(ValueError("text_too_long")), "text_too_long")

    def test_json_decode(self):
        try:
            json.loads("{")
        except json.JSONDecodeError as exc:
            self.assertEqual(safe_error_name(exc), "invalid_json")

    def test_generic_exception_is_type_name_only(self):
        class PathLeak(Exception):
            pass
        err = PathLeak("/secret/weights/model.onnx failed")
        self.assertEqual(safe_error_name(err), "PathLeak")
        self.assertNotIn("secret", safe_error_name(err))


if __name__ == "__main__":
    unittest.main()
