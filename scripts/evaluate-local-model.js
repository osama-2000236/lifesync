/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { parseMessage } = require('../server/services/ai/nlpService');
const { getAIProviderStatus } = require('../server/services/ai/providerClient');

const casesPath = process.env.MODEL_EVAL_CASES
  || path.join(__dirname, '..', 'tests', 'model-eval', 'cases.json');
const outputPath = process.env.MODEL_EVAL_OUTPUT
  || path.join(__dirname, '..', 'output', 'model-eval', 'latest.json');
const numericTolerance = Number(process.env.MODEL_EVAL_NUMERIC_TOLERANCE || 0.01);

const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};

const pct = (numerator, denominator) => denominator ? Number((100 * numerator / denominator).toFixed(2)) : null;

const isStructuredResponse = (result) => (
  result
  && typeof result.intent === 'string'
  && typeof result.domain === 'string'
  && Array.isArray(result.entities)
  && typeof result.needs_clarification === 'boolean'
  && typeof result.processing_time_ms === 'number'
);

const findEntity = (entities, expected) => entities.find((entity) => (
  entity.domain === expected.domain && entity.type === expected.type
));

const compareCase = (testCase, actual) => {
  const expectedEntities = testCase.expected.entities || [];
  const actualEntities = actual.entities || [];
  const matchedEntities = expectedEntities.filter((expected) => findEntity(actualEntities, expected));
  const numericChecks = [];

  for (const expected of expectedEntities) {
    const actualEntity = findEntity(actualEntities, expected);
    for (const key of ['value', 'amount']) {
      if (typeof expected[key] === 'number') {
        numericChecks.push(Boolean(
          actualEntity
          && typeof actualEntity[key] === 'number'
          && Math.abs(actualEntity[key] - expected[key]) <= numericTolerance
        ));
      }
    }
  }

  const checks = {
    structured: isStructuredResponse(actual),
    intent: actual.intent === testCase.expected.intent,
    domain: actual.domain === testCase.expected.domain,
    clarification: actual.needs_clarification === testCase.expected.needs_clarification,
    entity_set: matchedEntities.length === expectedEntities.length
      && actualEntities.length === expectedEntities.length,
    numeric: numericChecks.length === 0 || numericChecks.every(Boolean),
  };

  return {
    id: testCase.id,
    message: testCase.message,
    expected: testCase.expected,
    actual: {
      intent: actual.intent,
      domain: actual.domain,
      needs_clarification: actual.needs_clarification,
      entities: actual.entities,
      confidence: actual.confidence,
      processing_time_ms: actual.processing_time_ms,
      error: actual.error || null,
    },
    checks,
    passed: Object.values(checks).every(Boolean),
    entity_counts: {
      expected: expectedEntities.length,
      predicted: actualEntities.length,
      matched: matchedEntities.length,
    },
    numeric_checks: numericChecks,
  };
};

const main = async () => {
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const provider = await getAIProviderStatus('chat');
  const results = [];

  console.log(`Evaluating ${cases.length} cases with ${provider.provider}/${provider.configured_model}...`);
  for (const testCase of cases) {
    const actual = await parseMessage(testCase.message);
    const result = compareCase(testCase, actual);
    results.push(result);
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.id} (${actual.processing_time_ms} ms)`);
  }

  const entityTotals = results.reduce((totals, result) => ({
    expected: totals.expected + result.entity_counts.expected,
    predicted: totals.predicted + result.entity_counts.predicted,
    matched: totals.matched + result.entity_counts.matched,
  }), { expected: 0, predicted: 0, matched: 0 });
  const numericChecks = results.flatMap((result) => result.numeric_checks);
  const latencies = results.map((result) => result.actual.processing_time_ms);
  const precision = entityTotals.predicted ? entityTotals.matched / entityTotals.predicted : 1;
  const recall = entityTotals.expected ? entityTotals.matched / entityTotals.expected : 1;
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;

  const report = {
    generated_at: new Date().toISOString(),
    evaluation_set: path.relative(path.join(__dirname, '..'), casesPath),
    provider,
    disclosure: process.env.MODEL_EVAL_DISCLOSURE
      || 'Results apply only to the loaded model reported above; they are not transferable to another artifact.',
    summary: {
      cases: results.length,
      passed: results.filter((result) => result.passed).length,
      case_pass_rate_pct: pct(results.filter((result) => result.passed).length, results.length),
      structured_output_rate_pct: pct(results.filter((result) => result.checks.structured).length, results.length),
      intent_accuracy_pct: pct(results.filter((result) => result.checks.intent).length, results.length),
      domain_accuracy_pct: pct(results.filter((result) => result.checks.domain).length, results.length),
      clarification_accuracy_pct: pct(results.filter((result) => result.checks.clarification).length, results.length),
      entity_type_precision_pct: Number((precision * 100).toFixed(2)),
      entity_type_recall_pct: Number((recall * 100).toFixed(2)),
      entity_type_f1_pct: Number((f1 * 100).toFixed(2)),
      numeric_value_accuracy_pct: pct(numericChecks.filter(Boolean).length, numericChecks.length),
      latency_ms: {
        min: Math.min(...latencies),
        median_p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: Math.max(...latencies),
        mean: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
      },
    },
    results,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Evidence written to ${outputPath}`);
  process.exitCode = report.summary.passed === report.summary.cases ? 0 : 2;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
