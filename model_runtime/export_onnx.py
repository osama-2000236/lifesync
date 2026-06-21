"""Export LifeSync BERT sequence classifier to dynamic ONNX."""

from __future__ import annotations

import argparse
from pathlib import Path

import onnx
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


class LogitsOnly(torch.nn.Module):
    def __init__(self, model: torch.nn.Module):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, token_type_ids):
        return self.model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        ).logits


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("bert_best_model_10pct"))
    parser.add_argument("--output", type=Path, default=Path("model_runtime/artifacts/bert_intent.onnx"))
    parser.add_argument("--sequence-length", type=int, default=128)
    args = parser.parse_args()

    model_dir = args.model.resolve()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(model_dir, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(model_dir, local_files_only=True)
    # Legacy ONNX tracing needs explicit eager attention; SDPA mask creation in
    # Transformers 5.x depends on symbolic shapes that TorchScript cannot trace.
    if hasattr(model, "set_attn_implementation"):
        model.set_attn_implementation("eager")
    else:
        model.config._attn_implementation = "eager"
    wrapper = LogitsOnly(model.eval()).eval()
    sample = tokenizer(
        "I walked 5000 steps",
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=args.sequence_length,
    )

    torch.onnx.export(
        wrapper,
        (sample["input_ids"], sample["attention_mask"], sample["token_type_ids"]),
        output,
        input_names=["input_ids", "attention_mask", "token_type_ids"],
        output_names=["logits"],
        opset_version=18,
        do_constant_folding=True,
        dynamo=True,
    )

    exported = onnx.load(str(output))
    onnx.checker.check_model(exported)
    print(f"Exported: {output}")
    print(f"Size: {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
