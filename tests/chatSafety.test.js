// Chat/NLP write safety: no silent health/finance writes on ambiguity or junk entities.

const {
  entitiesForPersistence,
  isValidHealthEntity,
  isValidFinanceEntity,
  MIN_WRITE_CONFIDENCE,
} = require('../server/services/ai/chatWriteSafety');

describe('entitiesForPersistence (controller gate)', () => {
  test('clarification → no entities even if array was wrongly filled', () => {
    expect(entitiesForPersistence({
      needs_clarification: true,
      confidence: 0.9,
      entities: [{ domain: 'finance', type: 'expense', amount: 25 }],
    })).toEqual([]);
  });

  test('low confidence → no entities', () => {
    expect(entitiesForPersistence({
      needs_clarification: false,
      confidence: MIN_WRITE_CONFIDENCE - 0.01,
      entities: [{ domain: 'health', type: 'steps', value: 1000 }],
    })).toEqual([]);
  });

  test('confident logging → passes entities through', () => {
    const entities = [{ domain: 'finance', type: 'expense', amount: 12 }];
    expect(entitiesForPersistence({
      needs_clarification: false,
      confidence: 0.85,
      entities,
    })).toEqual(entities);
  });

  test('missing entities array → empty', () => {
    expect(entitiesForPersistence({ needs_clarification: false, confidence: 0.9 })).toEqual([]);
  });
});

describe('entity shape validation', () => {
  test('rejects invalid health types and non-finite values', () => {
    expect(isValidHealthEntity({ domain: 'health', type: 'not_real', value: 1 })).toBe(false);
    expect(isValidHealthEntity({ domain: 'health', type: 'steps', value: NaN })).toBe(false);
    expect(isValidHealthEntity({ domain: 'health', type: 'steps', value: 8000 })).toBe(true);
  });

  test('rejects non-positive finance amounts and bad types', () => {
    expect(isValidFinanceEntity({ domain: 'finance', type: 'expense', amount: 0 })).toBe(false);
    expect(isValidFinanceEntity({ domain: 'finance', type: 'expense', amount: -5 })).toBe(false);
    expect(isValidFinanceEntity({ domain: 'finance', type: 'transfer', amount: 10 })).toBe(false);
    expect(isValidFinanceEntity({ domain: 'finance', type: 'expense', amount: 9.99 })).toBe(true);
  });
});
