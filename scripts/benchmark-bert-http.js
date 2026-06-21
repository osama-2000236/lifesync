/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const endpoint = process.argv[2] || 'http://127.0.0.1:1235';
const output = process.argv[3] || 'output/model-eval/bert-http-benchmark.json';
const casesPath = process.argv[4] || 'tests/model-eval/bert_intent_cases.json';
const repeats = Number(process.env.BERT_BENCHMARK_REPEATS || 3);
const warmups = Number(process.env.BERT_BENCHMARK_WARMUPS || 10);

const percentile = (values, probability) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * probability) - 1))];
};

const summarizeLatency = (values) => ({
  min: Number(Math.min(...values).toFixed(3)),
  p50: Number(percentile(values, 0.50).toFixed(3)),
  p95: Number(percentile(values, 0.95).toFixed(3)),
  max: Number(Math.max(...values).toFixed(3)),
  mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)),
});

const classify = async (text) => {
  const started = performance.now();
  const response = await fetch(`${endpoint}/v1/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Runtime ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return { data, endToEndMs: performance.now() - started };
};

const main = async () => {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const statusResponse = await fetch(`${endpoint}/v1/status`);
  if (!statusResponse.ok) throw new Error(`Status ${statusResponse.status}`);
  const status = await statusResponse.json();

  for (let index = 0; index < warmups; index += 1) await classify('benchmark warmup');

  const results = [];
  const endToEndLatencies = [];
  const modelLatencies = [];
  for (const testCase of cases) {
    let first = null;
    const labels = new Set();
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const measured = await classify(testCase.text);
      if (!first) first = measured.data;
      labels.add(measured.data.label);
      endToEndLatencies.push(measured.endToEndMs);
      modelLatencies.push(measured.data.latency_ms);
    }
    results.push({
      ...testCase,
      predicted: first.label,
      confidence: first.confidence,
      correct: first.label === testCase.label,
      deterministic_across_repeats: labels.size === 1,
    });
  }

  const labels = status.labels;
  const confusion = Object.fromEntries(labels.map((label) => [
    label,
    Object.fromEntries(labels.map((predicted) => [predicted, 0])),
  ]));
  for (const result of results) confusion[result.label][result.predicted] += 1;
  const perLabel = {};
  for (const label of labels) {
    const tp = results.filter((item) => item.label === label && item.predicted === label).length;
    const fp = results.filter((item) => item.label !== label && item.predicted === label).length;
    const fn = results.filter((item) => item.label === label && item.predicted !== label).length;
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    const f1 = 2 * precision * recall / (precision + recall || 1);
    perLabel[label] = {
      support: results.filter((item) => item.label === label).length,
      precision_pct: Number((precision * 100).toFixed(2)),
      recall_pct: Number((recall * 100).toFixed(2)),
      f1_pct: Number((f1 * 100).toFixed(2)),
    };
  }
  const correct = results.filter((item) => item.correct).length;
  const report = {
    generated_at: new Date().toISOString(),
    endpoint,
    runtime: status,
    hardware: process.env.BERT_BENCHMARK_HARDWARE || 'unspecified',
    cases: path.normalize(casesPath),
    repeats,
    warmups,
    disclosure: 'HTTP benchmark of supplied target artifact on fixed application acceptance cases; not original training holdout accuracy.',
    summary: {
      cases: results.length,
      correct,
      accuracy_pct: Number((correct / results.length * 100).toFixed(2)),
      macro_f1_pct: Number((Object.values(perLabel).reduce((sum, item) => sum + item.f1_pct, 0) / labels.length).toFixed(2)),
      deterministic_repeat_rate_pct: Number((results.filter((item) => item.deterministic_across_repeats).length / results.length * 100).toFixed(2)),
      end_to_end_latency_ms: summarizeLatency(endToEndLatencies),
      inference_latency_ms: summarizeLatency(modelLatencies),
      sequential_throughput_requests_per_second: Number((1000 / (modelLatencies.reduce((sum, value) => sum + value, 0) / modelLatencies.length)).toFixed(2)),
    },
    per_label: perLabel,
    confusion_matrix: confusion,
    results,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Evidence: ${path.resolve(output)}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
