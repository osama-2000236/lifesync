"""Balanced intent benchmark for raw LifeSync BERT classifier."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from collections import Counter
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer


def percentile(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, math.ceil(len(ordered) * probability) - 1))]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=Path("bert_best_model_10pct"))
    parser.add_argument("--cases", type=Path, default=Path("tests/model-eval/bert_intent_cases.json"))
    parser.add_argument("--output", type=Path, default=Path("output/model-eval/bert-target-pytorch-cpu.json"))
    parser.add_argument("--threads", type=int, default=6)
    args = parser.parse_args()

    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(args.model, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(args.model, local_files_only=True).eval()
    load_ms = (time.perf_counter() - started) * 1000
    cases = json.loads(args.cases.read_text(encoding="utf-8"))
    labels = [model.config.id2label[i] for i in sorted(model.config.id2label)]

    # Warm-up excluded from latency statistics.
    with torch.inference_mode():
        model(**tokenizer("benchmark warmup", return_tensors="pt"))

    results = []
    latencies = []
    confusion = {label: {predicted: 0 for predicted in labels} for label in labels}
    for case in cases:
        encoded = tokenizer(case["text"], return_tensors="pt", truncation=True, max_length=512)
        inference_started = time.perf_counter()
        with torch.inference_mode():
            logits = model(**encoded).logits[0]
        latency_ms = (time.perf_counter() - inference_started) * 1000
        probabilities = torch.softmax(logits, dim=-1)
        index = int(probabilities.argmax())
        predicted = model.config.id2label[index]
        confidence = float(probabilities[index])
        correct = predicted == case["label"]
        confusion[case["label"]][predicted] += 1
        latencies.append(latency_ms)
        results.append({
            **case,
            "predicted": predicted,
            "confidence": round(confidence, 6),
            "correct": correct,
            "latency_ms": round(latency_ms, 3),
        })

    per_label = {}
    for label in labels:
        tp = sum(1 for result in results if result["label"] == label and result["predicted"] == label)
        fp = sum(1 for result in results if result["label"] != label and result["predicted"] == label)
        fn = sum(1 for result in results if result["label"] == label and result["predicted"] != label)
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
        per_label[label] = {
            "support": sum(1 for result in results if result["label"] == label),
            "precision_pct": round(precision * 100, 2),
            "recall_pct": round(recall * 100, 2),
            "f1_pct": round(f1 * 100, 2),
        }

    correct_results = [result for result in results if result["correct"]]
    wrong_results = [result for result in results if not result["correct"]]
    summary = {
        "cases": len(results),
        "correct": len(correct_results),
        "accuracy_pct": round(len(correct_results) / len(results) * 100, 2),
        "macro_f1_pct": round(statistics.mean(value["f1_pct"] for value in per_label.values()), 2),
        "mean_confidence_correct_pct": round(statistics.mean(result["confidence"] for result in correct_results) * 100, 2) if correct_results else None,
        "mean_confidence_wrong_pct": round(statistics.mean(result["confidence"] for result in wrong_results) * 100, 2) if wrong_results else None,
        "load_ms": round(load_ms, 2),
        "latency_ms": {
            "min": round(min(latencies), 3),
            "p50": round(percentile(latencies, 0.50), 3),
            "p95": round(percentile(latencies, 0.95), 3),
            "max": round(max(latencies), 3),
            "mean": round(statistics.mean(latencies), 3),
        },
        "throughput_requests_per_second": round(1000 / statistics.mean(latencies), 2),
    }
    report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": str(args.model),
        "architecture": model.config.architectures[0],
        "engine": "pytorch_cpu",
        "threads": args.threads,
        "parameter_count": sum(parameter.numel() for parameter in model.parameters()),
        "disclosure": "Balanced 60-case application acceptance set created after training; not original held-out training accuracy.",
        "summary": summary,
        "per_label": per_label,
        "confusion_matrix": confusion,
        "prediction_counts": Counter(result["predicted"] for result in results),
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"Evidence: {args.output.resolve()}")


if __name__ == "__main__":
    main()
