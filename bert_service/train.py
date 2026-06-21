"""
Fine-tune DistilBERT for LifeSync intent classification.

Trains a sequence-classification head on the generated LifeSync intent dataset
and saves it where the NLP engine auto-loads it (``models/intent-distilbert``).
Once trained, the service uses the fine-tuned model instead of zero-shot.

Usage:
    # CPU is fine for this small dataset; GPU is auto-detected and much faster.
    python train.py                       # builds dataset if missing, trains, saves
    python train.py --epochs 4 --batch 16
    python train.py --model distilbert-base-uncased --output models/intent-distilbert

After training, just (re)start the service — it picks up the model on boot.
"""

from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DEFAULT_OUT = os.path.join(HERE, "models", "intent-distilbert")

INTENT_LABELS = [
    "log_health", "log_finance", "query_health", "query_finance",
    "get_insight", "set_goal", "edit_entry", "query_general",
]
LABEL2ID = {label: i for i, label in enumerate(INTENT_LABELS)}
ID2LABEL = {i: label for label, i in LABEL2ID.items()}


def _ensure_dataset() -> None:
    train_path = os.path.join(DATA_DIR, "train.jsonl")
    if not os.path.isfile(train_path):
        print("dataset not found — generating it...")
        import subprocess
        import sys
        subprocess.run([sys.executable, os.path.join(DATA_DIR, "build_dataset.py")], check=True)


def _load_jsonl(path: str) -> list[dict]:
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="distilbert-base-uncased")
    parser.add_argument("--output", default=DEFAULT_OUT)
    parser.add_argument("--epochs", type=float, default=4)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--lr", type=float, default=5e-5)
    parser.add_argument("--max-len", type=int, default=64)
    args = parser.parse_args()

    _ensure_dataset()

    import numpy as np
    import torch
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        DataCollatorWithPadding,
        Trainer,
        TrainingArguments,
    )

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"training on: {device}")

    train_rows = _load_jsonl(os.path.join(DATA_DIR, "train.jsonl"))
    val_rows = _load_jsonl(os.path.join(DATA_DIR, "val.jsonl"))
    print(f"train={len(train_rows)} val={len(val_rows)} labels={len(INTENT_LABELS)}")

    tokenizer = AutoTokenizer.from_pretrained(args.model)

    class IntentDataset(torch.utils.data.Dataset):
        """Plain torch dataset — avoids the heavy `datasets`/pyarrow dependency."""

        def __init__(self, rows):
            enc = tokenizer([r["text"] for r in rows], truncation=True, max_length=args.max_len)
            self.input_ids = enc["input_ids"]
            self.attention_mask = enc["attention_mask"]
            self.labels = [LABEL2ID[r["label"]] for r in rows]

        def __len__(self):
            return len(self.labels)

        def __getitem__(self, idx):
            return {
                "input_ids": self.input_ids[idx],
                "attention_mask": self.attention_mask[idx],
                "labels": self.labels[idx],
            }

    train_ds, val_ds = IntentDataset(train_rows), IntentDataset(val_rows)

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model, num_labels=len(INTENT_LABELS), id2label=ID2LABEL, label2id=LABEL2ID,
    )

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {"accuracy": float((preds == labels).mean())}

    training_args = TrainingArguments(
        output_dir=os.path.join(args.output, "_checkpoints"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        eval_strategy="epoch",
        save_strategy="no",
        logging_steps=25,
        report_to=[],
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        processing_class=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics,
    )

    trainer.train()
    metrics = trainer.evaluate()
    print(f"final eval accuracy: {metrics.get('eval_accuracy'):.4f}")

    os.makedirs(args.output, exist_ok=True)
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    with open(os.path.join(args.output, "intent_labels.json"), "w", encoding="utf-8") as fh:
        json.dump(INTENT_LABELS, fh)
    print(f"saved fine-tuned model -> {args.output}")
    print("restart the BERT service to load it (it auto-detects models/intent-distilbert).")


if __name__ == "__main__":
    main()
