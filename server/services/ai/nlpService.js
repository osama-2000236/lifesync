// server/services/ai/nlpService.js
// ============================================
// NLP Service v2 — AI Provider Integration
// Enhanced with:
//   - Strict entity extraction (Amount, Category, Duration, Activity)
//   - Auto-classification (Health vs. Finance)
//   - Clarification logic for ambiguous messages
//   - Conversation context awareness
// ============================================

require('dotenv').config();
const { generateStructuredJson } = require('./providerClient');

// ============================================
// SYSTEM PROMPT — Core NLP Instructions
// ============================================
const SYSTEM_PROMPT = `You are the NLP engine for LifeSync, a unified health and finance tracking app.
Your sole job is to parse natural language messages and return STRUCTURED JSON.

RESPONSE FORMAT — Always return ONLY this JSON structure (no markdown, no backticks):
{
  "intent": "<string>",
  "domain": "<string>",
  "entities": [ <array of extracted entity objects> ],
  "response": "<string — friendly confirmation or follow-up question>",
  "is_cross_domain": <boolean>,
  "needs_clarification": <boolean>,
  "clarification_question": "<string or null>",
  "clarification_options": [<array of string suggestions or null>],
  "confidence": <number 0.0-1.0>
}

─── INTENTS ───
"log_health"     → User logs a health metric (steps, sleep, mood, nutrition, water, exercise)
"log_finance"    → User logs a financial transaction (expense or income)
"log_both"       → Message contains BOTH health AND finance data
"query_health"   → User asks about their health data
"query_finance"  → User asks about their financial data
"query_general"  → Greeting, off-topic, or general chat
"set_goal"       → User wants to set a target
"get_insight"    → User asks for weekly analysis or recommendations
"edit_entry"     → User wants to modify or delete a past entry
"unclear"        → Cannot determine intent with confidence

─── DOMAINS ───
"health" | "finance" | "both" | "general"

─── ENTITY EXTRACTION SCHEMA ───

For HEALTH entries, extract:
{
  "domain": "health",
  "activity": "<descriptive activity name>",
  "type": "steps | sleep | mood | nutrition | water | exercise | heart_rate",
  "value": <number>,
  "value_text": "<optional text descriptor>",
  "unit": "<steps | hours | rating | kcal | liters | minutes | bpm>",
  "duration": <minutes as integer, or null>,
  "category": "<Steps | Sleep | Mood | Nutrition | Water Intake | Exercise | Heart Rate>"
}

For FINANCE entries, extract:
{
  "domain": "finance",
  "activity": "<what the money was for>",
  "type": "income | expense",
  "amount": <number — always positive>,
  "currency": "USD",
  "category": "<Food & Dining | Transportation | Entertainment | Shopping | Bills & Utilities | Healthcare | Education | Groceries | Income - Salary | Income - Freelance | Savings | Other>",
  "description": "<brief description>"
}

─── CLARIFICATION RULES (CRITICAL) ───

You MUST set needs_clarification = true when:

1. MISSING CATEGORY: User says an amount but no context.
   Example: "I spent 10" → Ask: "What was the $10 for? For example: food, transport, shopping?"
   
2. AMBIGUOUS DOMAIN: Message could be health OR finance.
   Example: "50 for the gym" → Ask: "Would you like me to log this as: (A) a $50 gym expense, (B) 50 minutes of exercise, or (C) both?"

3. MISSING VALUE: User names an activity but no quantity.
   Example: "I went running" → Ask: "Great! How long did you run, or how many steps?"

4. VAGUE MOOD: User expresses feeling without a clear rating.
   Example: "I feel okay" → Log mood as 5/10 but note low confidence.

5. AMBIGUOUS AMOUNT without currency context:
   Example: "spent 10 on lunch" → Assume USD, log it, confidence 0.8.

When needs_clarification = true:
- Set intent to "unclear" or best guess with low confidence
- Set clarification_question to a friendly follow-up
- Set clarification_options to 2-4 suggestions
- Set confidence below 0.5
- Do NOT create entities (empty array)

When needs_clarification = false:
- Set clarification_question to an empty string
- Set clarification_options to an empty array
- Set confidence above 0.7

─── SPECIAL RULES ───

1. MULTI-ENTITY: "I slept 7 hours and spent $15 on breakfast" → TWO entities.

2. CROSS-DOMAIN: "Spent $50 on a healthy dinner" → is_cross_domain = true, extract BOTH:
   - Finance: $50 expense, "Food & Dining"
   - Health: nutrition entry, value_text "healthy dinner"

3. MOOD MAPPING (1-10):
   terrible/awful=1-2, bad/poor=3, below average=4, okay/neutral=5,
   good/fine=6, great/happy=7-8, amazing/excellent=9-10

4. SLEEP: value in hours, duration in minutes. "7 hours" → value:7, duration:420

5. WATER: Normalize to liters. "8 glasses" ≈ 2 liters. "500ml" = 0.5

6. CURRENCY: Default USD. Support $, €, £, ₪ (ILS).

7. GREETINGS: intent "query_general", empty entities, friendly response.

8. CLARIFICATION RESPONSES: When context is provided, match the answer to extract entities.

ONLY return valid JSON.`;

const GENERIC_ENTITY_SCHEMA = {
  type: 'object',
  properties: {
    domain: { type: 'string' },
    activity: { type: 'string' },
    type: { type: 'string' },
    value: { type: 'number' },
    value_text: { type: 'string' },
    unit: { type: 'string' },
    duration: { type: 'integer' },
    category: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['domain', 'type'],
  additionalProperties: false,
};

const NLP_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string' },
    domain: { type: 'string' },
    entities: {
      type: 'array',
      items: GENERIC_ENTITY_SCHEMA,
    },
    response: { type: 'string' },
    is_cross_domain: { type: 'boolean' },
    needs_clarification: { type: 'boolean' },
    clarification_question: { type: 'string' },
    clarification_options: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: { type: 'number' },
  },
  required: [
    'intent',
    'domain',
    'entities',
    'response',
    'is_cross_domain',
    'needs_clarification',
    'clarification_question',
    'clarification_options',
    'confidence',
  ],
  additionalProperties: false,
};

const WEEKLY_INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    patterns: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          observation: { type: 'string' },
          domain: { type: 'string' },
          trend: { type: 'string' },
          severity: { type: 'string' },
        },
        required: ['observation', 'domain', 'trend', 'severity'],
        additionalProperties: false,
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          priority: { type: 'string' },
          domain: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['text', 'priority', 'domain', 'reason'],
        additionalProperties: false,
      },
    },
    cross_domain_insights: { type: 'string' },
    mood_trend: { type: 'string' },
    spending_trend: { type: 'string' },
    health_score: { type: 'number' },
    financial_health_score: { type: 'number' },
  },
  required: [
    'summary',
    'patterns',
    'recommendations',
    'cross_domain_insights',
    'mood_trend',
    'spending_trend',
    'health_score',
    'financial_health_score',
  ],
  additionalProperties: false,
};

// ============================================
// CORE NLP FUNCTIONS
// ============================================

/**
 * Build context for clarification follow-ups
 */
const buildClarificationContext = (pending, userResponse) => {
  return `The user is responding to a clarification question.

PREVIOUS CONTEXT:
- Original message: "${pending.originalMessage}"
- Question asked: "${pending.clarificationQuestion}"
- Options given: ${JSON.stringify(pending.clarificationOptions)}

USER'S RESPONSE: "${userResponse}"

Parse this in context of the original message. Extract full entities now that ambiguity is resolved.`;
};

/**
 * Parse a natural language message using the configured AI provider
 * @param {string} message - The user's input
 * @param {Object|null} pendingClarification - Previous clarification context
 * @returns {Object} Parsed result
 */
const parseMessage = async (message, pendingClarification = null) => {
  const startTime = Date.now();

  try {
    const userPrompt = pendingClarification
      ? buildClarificationContext(pendingClarification, message)
      : message;

    const completion = await generateStructuredJson({
      systemInstruction: SYSTEM_PROMPT,
      userPrompt,
      responseSchema: NLP_RESPONSE_SCHEMA,
      temperature: 0.05,
      maxOutputTokens: 1000,
      feature: 'chat',
    });

    const rawResponse = completion.rawText;
    const processingTime = Date.now() - startTime;

    if (!rawResponse) throw new Error('Empty response from AI provider');

    const parsed = completion.data;

    return normalizeNLPResponse(parsed, message, processingTime);
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('NLP Service Error:', error.message);

    return {
      success: false,
      intent: 'unclear',
      domain: 'general',
      entities: [],
      response: "I had trouble understanding that. Could you try rephrasing? For example: 'Spent $10 on lunch' or 'Walked 5000 steps'.",
      is_cross_domain: false,
      needs_clarification: true,
      clarification_question: 'Could you rephrase your message?',
      clarification_options: [
        'Log an expense (e.g., "Spent $20 on food")',
        'Log health data (e.g., "Slept 7 hours")',
        'Ask about my data',
      ],
      confidence: 0.0,
      processing_time_ms: processingTime,
      error: error.message,
    };
  }
};

/**
 * Map model's non-standard intent names to valid intents.
 * The fine-tuned model often outputs e.g. "log_steps" instead of "log_health".
 */
const INTENT_MAP = {
  log_steps: 'log_health', log_sleep: 'log_health', log_mood: 'log_health',
  log_exercise: 'log_health', log_water: 'log_health', log_nutrition: 'log_health',
  log_heart_rate: 'log_health', log_activity: 'log_health',
  log_expense: 'log_finance', log_income: 'log_finance', log_spending: 'log_finance',
  log_both_activities: 'log_both', log_cross: 'log_both',
  query_steps: 'query_health', query_sleep: 'query_health',
  query_spending: 'query_finance', query_expense: 'query_finance',
  greet: 'query_general', greeting: 'query_general', hello: 'query_general',
};

/**
 * Map model's non-standard domain names to valid domains.
 * The model often uses health subtypes as domain names.
 */
const DOMAIN_MAP = {
  steps: 'health', sleep: 'health', mood: 'health', exercise: 'health',
  water: 'health', nutrition: 'health', heart_rate: 'health',
  expense: 'finance', income: 'finance', spending: 'finance',
};

/**
 * Normalize and validate the NLP response
 */
const normalizeNLPResponse = (parsed, originalMessage, processingTime) => {
  const validIntents = [
    'log_health', 'log_finance', 'log_both', 'query_health',
    'query_finance', 'query_general', 'set_goal', 'get_insight',
    'edit_entry', 'unclear',
  ];
  const validDomains = ['health', 'finance', 'both', 'general'];

  const rawIntent = (parsed.intent || '').toLowerCase().trim();
  const mappedIntent = validIntents.includes(rawIntent) ? rawIntent : (INTENT_MAP[rawIntent] || 'unclear');
  const intent = validIntents.includes(mappedIntent) ? mappedIntent : 'unclear';

  const rawDomain = (parsed.domain || '').toLowerCase().trim();
  const mappedDomain = validDomains.includes(rawDomain) ? rawDomain : (DOMAIN_MAP[rawDomain] || 'general');
  const domain = validDomains.includes(mappedDomain) ? mappedDomain : 'general';
  const needsClarification = Boolean(parsed.needs_clarification);
  const confidence = typeof parsed.confidence === 'number'
    ? Math.min(1, Math.max(0, parsed.confidence))
    : (needsClarification ? 0.3 : 0.85);

  // Pre-process entities: reconstruct from primitives when model returns e.g. [8000]
  let rawEntities = Array.isArray(parsed.entities) ? parsed.entities : [];
  const hasPrimitives = rawEntities.some((e) => typeof e === 'number' || typeof e === 'string');
  if (hasPrimitives && rawEntities.length > 0 && intent !== 'unclear') {
    // Infer entity type from the raw intent (e.g., "log_steps" → type "steps")
    const inferredType = rawIntent.replace(/^log_/, '');
    const healthTypes = ['steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate'];
    if (healthTypes.includes(inferredType)) {
      const numVal = rawEntities.find((e) => typeof e === 'number');
      if (numVal !== undefined) {
        rawEntities = [{
          domain: 'health', type: inferredType, value: numVal,
          activity: inferredType, category: inferredType.charAt(0).toUpperCase() + inferredType.slice(1),
        }];
      }
    } else if (inferredType === 'expense' || inferredType === 'income') {
      const numVal = rawEntities.find((e) => typeof e === 'number');
      if (numVal !== undefined) {
        rawEntities = [{
          domain: 'finance', type: inferredType, amount: numVal,
          currency: 'USD', category: 'Other',
        }];
      }
    }
  }

  const entities = rawEntities.map(validateEntity).filter(Boolean);

  let clarificationQuestion = parsed.clarification_question || null;
  let clarificationOptions = Array.isArray(parsed.clarification_options) && parsed.clarification_options.length > 0
    ? parsed.clarification_options
    : null;

  if (needsClarification && !clarificationQuestion) {
    clarificationQuestion = "I'm not sure I understood that fully. Could you add more detail?";
    clarificationOptions = ['It was an expense', 'It was health-related', 'It was both'];
  }

  return {
    success: !needsClarification && entities.length > 0,
    intent,
    domain,
    entities,
    response: parsed.response || 'Got it!',
    is_cross_domain: Boolean(parsed.is_cross_domain),
    needs_clarification: needsClarification,
    clarification_question: clarificationQuestion,
    clarification_options: clarificationOptions,
    confidence,
    processing_time_ms: processingTime,
    original_message: originalMessage,
  };
};

/**
 * Validate and normalize a single entity.
 * Handles the fine-tuned model's non-standard entity shapes:
 *   - domain: "sleep" → mapped to "health"
 *   - plain number entities: [8000] → inferred from context
 */
const validateEntity = (entity) => {
  // Handle primitive values (model sometimes returns [8000] instead of [{...}])
  if (typeof entity === 'number' || typeof entity === 'string') return null;
  if (!entity || typeof entity !== 'object') return null;

  // Map non-standard domains: "sleep"→"health", "expense"→"finance", etc.
  const healthTypes = ['steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate'];
  const financeTypes = ['income', 'expense'];

  let entityDomain = (entity.domain || '').toLowerCase().trim();

  // If domain is a health subtype (e.g., "sleep", "steps"), map to "health"
  if (healthTypes.includes(entityDomain)) {
    entityDomain = 'health';
    entity = { ...entity, domain: 'health', type: entity.type || entity.domain };
  }
  // If domain is a finance subtype, map to "finance"
  if (financeTypes.includes(entityDomain) || entityDomain === 'spending') {
    entityDomain = 'finance';
    entity = { ...entity, domain: 'finance', type: entity.type || 'expense' };
  }

  if (!entityDomain || (entityDomain !== 'health' && entityDomain !== 'finance')) return null;

  if (entityDomain === 'health') {
    const validTypes = ['steps', 'sleep', 'mood', 'nutrition', 'water', 'exercise', 'heart_rate'];
    const type = validTypes.includes(entity.type) ? entity.type : null;
    if (!type) return null;

    const unitMap = {
      steps: 'steps', sleep: 'hours', mood: 'rating', nutrition: 'kcal',
      water: 'liters', exercise: 'minutes', heart_rate: 'bpm',
    };
    const categoryMap = {
      steps: 'Steps', sleep: 'Sleep', mood: 'Mood', nutrition: 'Nutrition',
      water: 'Water Intake', exercise: 'Exercise', heart_rate: 'Heart Rate',
    };

    return {
      domain: 'health',
      activity: entity.activity || type,
      type,
      value: typeof entity.value === 'number' ? entity.value : parseFloat(entity.value) || 0,
      value_text: entity.value_text || null,
      unit: entity.unit || unitMap[type],
      duration: entity.duration ? parseInt(entity.duration) : null,
      category: entity.category || categoryMap[type],
    };
  }

  if (entity.domain === 'finance') {
    const validTypes = ['income', 'expense'];
    const type = validTypes.includes(entity.type) ? entity.type : 'expense';
    const amount = typeof entity.amount === 'number' ? entity.amount : parseFloat(entity.amount);
    if (isNaN(amount) || amount <= 0) return null;

    return {
      domain: 'finance',
      activity: entity.activity || entity.description || 'transaction',
      type,
      amount,
      currency: entity.currency || 'USD',
      category: entity.category || 'Other',
      description: entity.description || entity.activity || null,
    };
  }

  return null;
};

/**
 * Generate weekly insights
 */
const generateWeeklyInsights = async (healthData, financeData) => {
  try {
    const prompt = `Analyze this user's weekly LifeSync data and provide personalized insights.

HEALTH DATA:
${JSON.stringify(healthData, null, 2)}

FINANCE DATA:
${JSON.stringify(financeData, null, 2)}

Respond ONLY with valid JSON:
{
  "summary": "<2-3 sentence overview>",
  "patterns": [
    { "observation": "<pattern>", "domain": "health|finance|both", "trend": "improving|stable|declining", "severity": "positive|neutral|concerning" }
  ],
  "recommendations": [
    { "text": "<actionable suggestion>", "priority": "high|medium|low", "domain": "health|finance|both", "reason": "<why>" }
  ],
  "cross_domain_insights": "<health-finance correlations, or empty string if none>",
  "mood_trend": "improving|stable|declining|insufficient_data",
  "spending_trend": "increasing|stable|decreasing|insufficient_data",
  "health_score": <1-100, use 0 if insufficient data>,
  "financial_health_score": <1-100, use 0 if insufficient data>
}`;

    const completion = await generateStructuredJson({
      systemInstruction: 'You are a wellness and finance advisor for LifeSync. Be empathetic, reference specific data, find cross-domain correlations. JSON only.',
      userPrompt: prompt,
      responseSchema: WEEKLY_INSIGHTS_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 1200,
      feature: 'insights',
    });

    return completion.data;
  } catch (error) {
    console.error('Insight Generation Error:', error.message);
    return {
      summary: 'Not enough data for detailed insights this week. Keep logging!',
      patterns: [],
      recommendations: [{
        text: 'Log at least 3 health and 3 finance entries daily for better insights.',
        priority: 'high', domain: 'both', reason: 'More data = better patterns.',
      }],
      cross_domain_insights: null,
      mood_trend: 'insufficient_data',
      spending_trend: 'insufficient_data',
      health_score: null,
      financial_health_score: null,
    };
  }
};

module.exports = {
  parseMessage,
  generateWeeklyInsights,
  _validateEntity: validateEntity,
  _normalizeNLPResponse: normalizeNLPResponse,
};
