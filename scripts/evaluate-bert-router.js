/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { _detectRuleLabel: detectRuleLabel } = require('../server/services/ai/bertNlpService');

const input = process.argv[2] || 'output/model-eval/bert-target-pytorch-cpu.json';
const output = process.argv[3] || 'output/model-eval/bert-router-hybrid.json';
const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const labels = Object.keys(raw.per_label);

const results = raw.results.map((item) => {
  const ruleLabel = detectRuleLabel(item.text);
  const routed = ruleLabel || item.predicted;
  return {
    id: item.id,
    text: item.text,
    expected: item.label,
    raw_model_label: item.predicted,
    rule_label: ruleLabel,
    routed_label: routed,
    rule_override: Boolean(ruleLabel && ruleLabel !== item.predicted),
    correct: routed === item.label,
  };
});

const confusion = Object.fromEntries(labels.map((label) => [
  label,
  Object.fromEntries(labels.map((predicted) => [predicted, 0])),
]));
for (const result of results) confusion[result.expected][result.routed_label] += 1;

const perLabel = {};
for (const label of labels) {
  const tp = results.filter((item) => item.expected === label && item.routed_label === label).length;
  const fp = results.filter((item) => item.expected !== label && item.routed_label === label).length;
  const fn = results.filter((item) => item.expected === label && item.routed_label !== label).length;
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = 2 * precision * recall / (precision + recall || 1);
  perLabel[label] = {
    support: results.filter((item) => item.expected === label).length,
    precision_pct: Number((precision * 100).toFixed(2)),
    recall_pct: Number((recall * 100).toFixed(2)),
    f1_pct: Number((f1 * 100).toFixed(2)),
  };
}

const correct = results.filter((item) => item.correct).length;
const summary = {
  cases: results.length,
  correct,
  accuracy_pct: Number((correct / results.length * 100).toFixed(2)),
  macro_f1_pct: Number((Object.values(perLabel).reduce((sum, item) => sum + item.f1_pct, 0) / labels.length).toFixed(2)),
  rule_overrides: results.filter((item) => item.rule_override).length,
  raw_model_accuracy_pct: raw.summary.accuracy_pct,
};
const report = {
  generated_at: new Date().toISOString(),
  input: path.normalize(input),
  disclosure: process.env.BERT_ROUTER_DISCLOSURE
    || 'Measures application hybrid router on same acceptance cases; rules were tuned using failures from this set.',
  summary,
  per_label: perLabel,
  confusion_matrix: confusion,
  results,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`Evidence: ${path.resolve(output)}`);
