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
const { getAIClient, getAIModel } = require('./providerClient');

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
- Set clarification_question to null
- Set clarification_options to null
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
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    if (pendingClarification) {
      messages.push({
        role: 'user',
        content: buildClarificationContext(pendingClarification, message),
      });
    } else {
      messages.push({ role: 'user', content: message });
    }

    const completion = await getAIClient().chat.completions.create({
      model: getAIModel(),
      messages,
      temperature: 0.05,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const rawResponse = completion.choices[0]?.message?.content;
    const processingTime = Date.now() - startTime;

    if (!rawResponse) throw new Error('Empty response from AI provider');

    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (parseErr) {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error(`Failed to parse NLP response: ${rawResponse.substring(0, 200)}`);
      }
    }

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
 * Normalize and validate the NLP response
 */
const normalizeNLPResponse = (parsed, originalMessage, processingTime) => {
  const validIntents = [
    'log_health', 'log_finance', 'log_both', 'query_health',
    'query_finance', 'query_general', 'set_goal', 'get_insight',
    'edit_entry', 'unclear',
  ];
  const validDomains = ['health', 'finance', 'both', 'general'];

  const intent = validIntents.includes(parsed.intent) ? parsed.intent : 'unclear';
  const domain = validDomains.includes(parsed.domain) ? parsed.domain : 'general';
  const needsClarification = Boolean(parsed.needs_clarification);
  const confidence = typeof parsed.confidence === 'number'
    ? Math.min(1, Math.max(0, parsed.confidence))
    : (needsClarification ? 0.3 : 0.85);

  const entities = Array.isArray(parsed.entities)
    ? parsed.entities.map(validateEntity).filter(Boolean)
    : [];

  let clarificationQuestion = parsed.clarification_question || null;
  let clarificationOptions = parsed.clarification_options || null;

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
 * Validate and normalize a single entity
 */
const validateEntity = (entity) => {
  if (!entity || !entity.domain) return null;

  if (entity.domain === 'health') {
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
  "cross_domain_insights": "<health-finance correlations>",
  "mood_trend": "improving|stable|declining|insufficient_data",
  "spending_trend": "increasing|stable|decreasing|insufficient_data",
  "health_score": <1-100>,
  "financial_health_score": <1-100>
}`;

    const completion = await getAIClient().chat.completions.create({
      model: getAIModel(),
      messages: [
        {
          role: 'system',
          content: 'You are a wellness and finance advisor for LifeSync. Be empathetic, reference specific data, find cross-domain correlations. JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0]?.message?.content);
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
