// tests/nlp.test.js
// ============================================
// NLP Service Test Suite
// Tests entity extraction, classification, validation,
// clarification logic, and cross-domain detection
// ============================================

const {
  _validateEntity: validateEntity,
  _normalizeNLPResponse: normalizeNLPResponse,
} = require('../server/services/ai/nlpService');

// ============================================
// 1. ENTITY VALIDATION TESTS
// ============================================

describe('NLP Entity Validation', () => {
  // ─── Health Entities ───

  describe('Health Entity Validation', () => {
    test('should validate a valid steps entity', () => {
      const entity = {
        domain: 'health',
        activity: 'walking',
        type: 'steps',
        value: 8000,
        unit: 'steps',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.domain).toBe('health');
      expect(result.type).toBe('steps');
      expect(result.value).toBe(8000);
      expect(result.unit).toBe('steps');
      expect(result.category).toBe('Steps');
    });

    test('should validate a sleep entity with duration', () => {
      const entity = {
        domain: 'health',
        activity: 'sleeping',
        type: 'sleep',
        value: 7,
        unit: 'hours',
        duration: 420,
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('sleep');
      expect(result.value).toBe(7);
      expect(result.duration).toBe(420);
      expect(result.unit).toBe('hours');
      expect(result.category).toBe('Sleep');
    });

    test('should validate mood with numeric rating', () => {
      const entity = {
        domain: 'health',
        type: 'mood',
        value: 8,
        activity: 'feeling great',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('mood');
      expect(result.value).toBe(8);
      expect(result.unit).toBe('rating');
      expect(result.category).toBe('Mood');
    });

    test('should validate nutrition with text descriptor', () => {
      const entity = {
        domain: 'health',
        type: 'nutrition',
        value: 600,
        value_text: 'chicken salad',
        unit: 'kcal',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('nutrition');
      expect(result.value).toBe(600);
      expect(result.value_text).toBe('chicken salad');
    });

    test('should validate water intake', () => {
      const entity = {
        domain: 'health',
        type: 'water',
        value: 2.5,
        unit: 'liters',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('water');
      expect(result.value).toBe(2.5);
      expect(result.unit).toBe('liters');
      expect(result.category).toBe('Water Intake');
    });

    test('should validate exercise entity', () => {
      const entity = {
        domain: 'health',
        type: 'exercise',
        value: 30,
        unit: 'minutes',
        activity: 'running',
        duration: 30,
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('exercise');
      expect(result.duration).toBe(30);
      expect(result.activity).toBe('running');
    });

    test('should validate heart rate entity', () => {
      const entity = {
        domain: 'health',
        type: 'heart_rate',
        value: 72,
        unit: 'bpm',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('heart_rate');
      expect(result.value).toBe(72);
      expect(result.unit).toBe('bpm');
    });

    test('should reject health entity with invalid type', () => {
      const entity = {
        domain: 'health',
        type: 'blood_pressure',
        value: 120,
      };

      const result = validateEntity(entity);
      expect(result).toBeNull();
    });

    test('should auto-assign unit when missing', () => {
      const entity = {
        domain: 'health',
        type: 'water',
        value: 3,
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.unit).toBe('liters');
    });

    test('should auto-assign category when missing', () => {
      const entity = {
        domain: 'health',
        type: 'steps',
        value: 5000,
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.category).toBe('Steps');
    });

    test('should parse string value to number', () => {
      const entity = {
        domain: 'health',
        type: 'steps',
        value: '10000',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.value).toBe(10000);
      expect(typeof result.value).toBe('number');
    });
  });

  // ─── Finance Entities ───

  describe('Finance Entity Validation', () => {
    test('should validate a valid expense entity', () => {
      const entity = {
        domain: 'finance',
        type: 'expense',
        amount: 15.50,
        category: 'Food & Dining',
        description: 'lunch',
        currency: 'USD',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.domain).toBe('finance');
      expect(result.type).toBe('expense');
      expect(result.amount).toBe(15.50);
      expect(result.category).toBe('Food & Dining');
      expect(result.currency).toBe('USD');
    });

    test('should validate an income entity', () => {
      const entity = {
        domain: 'finance',
        type: 'income',
        amount: 3000,
        category: 'Income - Salary',
        description: 'monthly salary',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('income');
      expect(result.amount).toBe(3000);
    });

    test('should default type to expense when invalid', () => {
      const entity = {
        domain: 'finance',
        type: 'refund',
        amount: 20,
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.type).toBe('expense');
    });

    test('should default currency to USD when missing', () => {
      const entity = {
        domain: 'finance',
        type: 'expense',
        amount: 10,
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.currency).toBe('USD');
    });

    test('should reject finance entity with zero amount', () => {
      const entity = {
        domain: 'finance',
        type: 'expense',
        amount: 0,
      };

      const result = validateEntity(entity);
      expect(result).toBeNull();
    });

    test('should reject finance entity with negative amount', () => {
      const entity = {
        domain: 'finance',
        type: 'expense',
        amount: -50,
      };

      const result = validateEntity(entity);
      expect(result).toBeNull();
    });

    test('should parse string amount to number', () => {
      const entity = {
        domain: 'finance',
        type: 'expense',
        amount: '25.99',
        description: 'groceries',
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.amount).toBe(25.99);
      expect(typeof result.amount).toBe('number');
    });

    test('should default category to Other when missing', () => {
      const entity = {
        domain: 'finance',
        type: 'expense',
        amount: 10,
      };

      const result = validateEntity(entity);

      expect(result).not.toBeNull();
      expect(result.category).toBe('Other');
    });
  });

  // ─── Edge Cases ───

  describe('Edge Cases', () => {
    test('should return null for null entity', () => {
      expect(validateEntity(null)).toBeNull();
    });

    test('should return null for empty object', () => {
      expect(validateEntity({})).toBeNull();
    });

    test('should return null for entity without domain', () => {
      expect(validateEntity({ type: 'steps', value: 100 })).toBeNull();
    });

    test('should return null for unknown domain', () => {
      expect(validateEntity({ domain: 'social', type: 'post', value: 1 })).toBeNull();
    });

    test('should handle NaN value gracefully for finance', () => {
      const entity = {
        domain: 'finance',
        type: 'expense',
        amount: 'not-a-number',
      };

      expect(validateEntity(entity)).toBeNull();
    });

    test('should handle NaN value gracefully for health', () => {
      const entity = {
        domain: 'health',
        type: 'steps',
        value: 'not-a-number',
      };

      const result = validateEntity(entity);
      expect(result).not.toBeNull();
      expect(result.value).toBe(0); // Falls back to 0
    });
  });
});

// ============================================
// 2. NLP RESPONSE NORMALIZATION TESTS
// ============================================

describe('NLP Response Normalization', () => {
  test('should normalize a valid log_health response', () => {
    const raw = {
      intent: 'log_health',
      domain: 'health',
      entities: [
        { domain: 'health', type: 'steps', value: 8000, unit: 'steps' },
      ],
      response: 'Logged 8,000 steps!',
      is_cross_domain: false,
      needs_clarification: false,
      confidence: 0.95,
    };

    const result = normalizeNLPResponse(raw, 'I walked 8000 steps', 150);

    expect(result.success).toBe(true);
    expect(result.intent).toBe('log_health');
    expect(result.domain).toBe('health');
    expect(result.entities).toHaveLength(1);
    expect(result.needs_clarification).toBe(false);
    expect(result.confidence).toBe(0.95);
    expect(result.processing_time_ms).toBe(150);
  });

  test('should normalize a clarification response', () => {
    const raw = {
      intent: 'unclear',
      domain: 'finance',
      entities: [],
      response: 'What was the $10 for?',
      is_cross_domain: false,
      needs_clarification: true,
      clarification_question: 'What did you spend $10 on?',
      clarification_options: ['Food', 'Transport', 'Shopping'],
      confidence: 0.3,
    };

    const result = normalizeNLPResponse(raw, 'I spent 10', 120);

    expect(result.success).toBe(false);
    expect(result.needs_clarification).toBe(true);
    expect(result.clarification_question).toBe('What did you spend $10 on?');
    expect(result.clarification_options).toHaveLength(3);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.entities).toHaveLength(0);
  });

  test('should normalize a cross-domain response', () => {
    const raw = {
      intent: 'log_both',
      domain: 'both',
      entities: [
        { domain: 'finance', type: 'expense', amount: 50, category: 'Food & Dining', description: 'healthy dinner' },
        { domain: 'health', type: 'nutrition', value: 700, value_text: 'healthy dinner' },
      ],
      response: 'Logged $50 expense and nutrition entry.',
      is_cross_domain: true,
      needs_clarification: false,
      confidence: 0.9,
    };

    const result = normalizeNLPResponse(raw, 'Spent $50 on a healthy dinner', 200);

    expect(result.success).toBe(true);
    expect(result.is_cross_domain).toBe(true);
    expect(result.domain).toBe('both');
    expect(result.entities).toHaveLength(2);

    const financeEntity = result.entities.find((e) => e.domain === 'finance');
    const healthEntity = result.entities.find((e) => e.domain === 'health');

    expect(financeEntity.amount).toBe(50);
    expect(healthEntity.value_text).toBe('healthy dinner');
  });

  test('should handle multi-entity extraction', () => {
    const raw = {
      intent: 'log_both',
      domain: 'both',
      entities: [
        { domain: 'health', type: 'sleep', value: 7, unit: 'hours', duration: 420 },
        { domain: 'finance', type: 'expense', amount: 15, category: 'Food & Dining', description: 'breakfast' },
      ],
      response: 'Logged 7 hours of sleep and $15 for breakfast.',
      is_cross_domain: false,
      needs_clarification: false,
      confidence: 0.92,
    };

    const result = normalizeNLPResponse(raw, 'I slept 7 hours and spent $15 on breakfast', 180);

    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].type).toBe('sleep');
    expect(result.entities[1].amount).toBe(15);
  });

  test('should fallback invalid intent to unclear', () => {
    const raw = {
      intent: 'do_something',
      domain: 'health',
      entities: [],
      response: 'OK',
      confidence: 0.5,
    };

    const result = normalizeNLPResponse(raw, 'test', 50);
    expect(result.intent).toBe('unclear');
  });

  test('should fallback invalid domain to general', () => {
    const raw = {
      intent: 'query_general',
      domain: 'social_media',
      entities: [],
      response: 'Hello!',
      confidence: 0.9,
    };

    const result = normalizeNLPResponse(raw, 'hi', 30);
    expect(result.domain).toBe('general');
  });

  test('should clamp confidence between 0 and 1', () => {
    const raw1 = { intent: 'log_health', domain: 'health', entities: [], confidence: 1.5, response: 'ok' };
    const raw2 = { intent: 'log_health', domain: 'health', entities: [], confidence: -0.5, response: 'ok' };

    expect(normalizeNLPResponse(raw1, '', 0).confidence).toBe(1);
    expect(normalizeNLPResponse(raw2, '', 0).confidence).toBe(0);
  });

  test('should auto-generate clarification question when missing', () => {
    const raw = {
      intent: 'unclear',
      domain: 'general',
      entities: [],
      response: 'hmm',
      needs_clarification: true,
      // No clarification_question provided
    };

    const result = normalizeNLPResponse(raw, 'something', 50);

    expect(result.needs_clarification).toBe(true);
    expect(result.clarification_question).toBeTruthy();
    expect(result.clarification_options).toBeTruthy();
    expect(result.clarification_options.length).toBeGreaterThan(0);
  });

  test('should filter out invalid entities', () => {
    const raw = {
      intent: 'log_health',
      domain: 'health',
      entities: [
        { domain: 'health', type: 'steps', value: 5000 }, // Valid
        { domain: 'health', type: 'invalid_type', value: 10 }, // Invalid
        null, // Null
        { domain: 'finance', type: 'expense', amount: 0 }, // Invalid (zero)
      ],
      response: 'done',
      confidence: 0.8,
    };

    const result = normalizeNLPResponse(raw, 'test', 50);

    // Only the valid steps entity should remain
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('steps');
  });

  test('should set success=false when entities is empty and no clarification', () => {
    const raw = {
      intent: 'query_general',
      domain: 'general',
      entities: [],
      response: 'Hello there!',
      needs_clarification: false,
      confidence: 0.95,
    };

    const result = normalizeNLPResponse(raw, 'hi', 30);

    // No entities extracted and no clarification = success is false
    expect(result.success).toBe(false);
    expect(result.response).toBe('Hello there!');
  });
});

// ============================================
// 3. CLASSIFICATION ACCURACY TESTS
// ============================================

describe('Domain Classification', () => {
  test('should classify health entities correctly', () => {
    const healthTypes = ['steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate'];

    healthTypes.forEach((type) => {
      const entity = { domain: 'health', type, value: 1 };
      const result = validateEntity(entity);
      expect(result).not.toBeNull();
      expect(result.domain).toBe('health');
    });
  });

  test('should classify finance entities correctly', () => {
    const financeTypes = ['income', 'expense'];

    financeTypes.forEach((type) => {
      const entity = { domain: 'finance', type, amount: 100 };
      const result = validateEntity(entity);
      expect(result).not.toBeNull();
      expect(result.domain).toBe('finance');
    });
  });

  test('should correctly map health categories', () => {
    const mapping = {
      steps: 'Steps',
      sleep: 'Sleep',
      mood: 'Mood',
      nutrition: 'Nutrition',
      water: 'Water Intake',
      exercise: 'Exercise',
      heart_rate: 'Heart Rate',
    };

    Object.entries(mapping).forEach(([type, expectedCategory]) => {
      const result = validateEntity({ domain: 'health', type, value: 1 });
      expect(result.category).toBe(expectedCategory);
    });
  });

  test('should correctly map health units', () => {
    const mapping = {
      steps: 'steps',
      sleep: 'hours',
      mood: 'rating',
      nutrition: 'kcal',
      water: 'liters',
      exercise: 'minutes',
      heart_rate: 'bpm',
    };

    Object.entries(mapping).forEach(([type, expectedUnit]) => {
      const result = validateEntity({ domain: 'health', type, value: 1 });
      expect(result.unit).toBe(expectedUnit);
    });
  });
});

// ============================================
// 6. FINE-TUNED MODEL OUTPUT NORMALIZATION
// ============================================

describe('Fine-tuned Model Output Normalization', () => {
  describe('Intent Mapping', () => {
    test('maps log_steps to log_health', () => {
      const result = normalizeNLPResponse(
        { intent: 'log_steps', domain: 'steps', entities: [], response: 'Logged!', confidence: 0.9,
          is_cross_domain: false, needs_clarification: false, clarification_question: '', clarification_options: [] },
        'I walked 8000 steps', 100
      );
      expect(result.intent).toBe('log_health');
      expect(result.domain).toBe('health');
    });

    test('maps log_both_activities to log_both', () => {
      const result = normalizeNLPResponse(
        { intent: 'log_both_activities', domain: 'health', entities: [], response: 'Done!', confidence: 0.9,
          is_cross_domain: true, needs_clarification: false, clarification_question: '', clarification_options: [] },
        'I slept 7 hours and spent $25', 100
      );
      expect(result.intent).toBe('log_both');
    });

    test('maps log_expense to log_finance', () => {
      const result = normalizeNLPResponse(
        { intent: 'log_expense', domain: 'expense', entities: [], response: 'Done!', confidence: 0.9,
          is_cross_domain: false, needs_clarification: false, clarification_question: '', clarification_options: [] },
        'Spent $20', 100
      );
      expect(result.intent).toBe('log_finance');
      expect(result.domain).toBe('finance');
    });
  });

  describe('Entity Domain Mapping', () => {
    test('maps entity domain "sleep" to "health"', () => {
      const entity = { domain: 'sleep', type: 'sleep', value: 7, unit: 'hours', category: 'Sleep', activity: 'sleeping', duration: 420 };
      const result = validateEntity(entity);
      expect(result).not.toBeNull();
      expect(result.domain).toBe('health');
      expect(result.type).toBe('sleep');
      expect(result.value).toBe(7);
    });

    test('maps entity domain "steps" to "health"', () => {
      const entity = { domain: 'steps', type: 'steps', value: 8000 };
      const result = validateEntity(entity);
      expect(result).not.toBeNull();
      expect(result.domain).toBe('health');
      expect(result.type).toBe('steps');
    });

    test('maps entity domain "expense" to "finance"', () => {
      const entity = { domain: 'expense', type: 'expense', amount: 25 };
      const result = validateEntity(entity);
      expect(result).not.toBeNull();
      expect(result.domain).toBe('finance');
      expect(result.type).toBe('expense');
    });
  });

  describe('Primitive Entity Reconstruction', () => {
    test('reconstructs health entity from primitive [8000] with log_steps intent', () => {
      const result = normalizeNLPResponse(
        { intent: 'log_steps', domain: 'steps', entities: [8000], response: 'Logged 8000 steps!', confidence: 0.92,
          is_cross_domain: false, needs_clarification: false, clarification_question: '', clarification_options: [] },
        'I walked 8000 steps today', 100
      );
      expect(result.intent).toBe('log_health');
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].domain).toBe('health');
      expect(result.entities[0].type).toBe('steps');
      expect(result.entities[0].value).toBe(8000);
      expect(result.success).toBe(true);
    });

    test('returns null for plain primitive without reconstructable intent', () => {
      const result = validateEntity(42);
      expect(result).toBeNull();
    });

    test('returns null for string primitive', () => {
      const result = validateEntity('walking');
      expect(result).toBeNull();
    });
  });
});
