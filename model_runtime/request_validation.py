"""Shared HTTP request validation for BERT classify runtimes.

Kept pure (no torch/onnx) so unit tests run without model weights.
"""

from __future__ import annotations

import json
import os

# Body cap: JSON overhead + max text. Prevents OOM before tokenizer.
MAX_BODY_BYTES = int(os.getenv("BERT_MAX_BODY_BYTES", "16384"))
# Char cap on classify text (tokenizer still truncates to model max_length).
MAX_TEXT_CHARS = int(os.getenv("BERT_MAX_TEXT_CHARS", "2000"))


def parse_content_length(header_value: str | None, max_body: int = MAX_BODY_BYTES) -> int:
    try:
        length = int(header_value or "0")
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid_content_length") from exc
    if length <= 0 or length > max_body:
        raise ValueError("invalid_content_length")
    return length


def parse_classify_text(
    raw: bytes | str,
    *,
    max_text: int = MAX_TEXT_CHARS,
) -> str:
    """Parse JSON body and return stripped classify text or raise ValueError."""
    if isinstance(raw, bytes):
        if len(raw) > MAX_BODY_BYTES:
            raise ValueError("invalid_content_length")
        try:
            body = json.loads(raw.decode("utf-8"))
        except UnicodeDecodeError as exc:
            raise ValueError("invalid_utf8") from exc
        except json.JSONDecodeError as exc:
            raise ValueError("invalid_json") from exc
    else:
        try:
            body = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("invalid_json") from exc

    if not isinstance(body, dict):
        raise ValueError("invalid_json")

    text = body.get("text")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("text_required")
    if len(text) > max_text:
        raise ValueError("text_too_long")
    return text.strip()


def safe_error_name(error: BaseException) -> str:
    """Client-facing error code — never a traceback or path."""
    if isinstance(error, (ValueError, json.JSONDecodeError)):
        msg = str(error) or type(error).__name__
        # Only allow known short codes / ValueError messages we raise.
        if msg in {
            "invalid_content_length",
            "invalid_utf8",
            "invalid_json",
            "text_required",
            "text_too_long",
        } or msg.startswith("Expecting ") or "JSON" in type(error).__name__:
            if isinstance(error, json.JSONDecodeError):
                return "invalid_json"
            return msg if msg in {
                "invalid_content_length",
                "invalid_utf8",
                "invalid_json",
                "text_required",
                "text_too_long",
            } else "invalid_json"
        return type(error).__name__
    return type(error).__name__
