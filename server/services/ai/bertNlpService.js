const { classifyText } = require('./providerClient');

const LABEL_TO_INTENT = {
  general_chat: 'query_general',
  log_both: 'log_both',
  log_expense: 'log_finance',
  log_health: 'log_health',
  query_summary: 'get_insight',
  set_goal: 'set_goal',
};

const normalize = (text) => text.toLowerCase().replace(/[’]/g, "'").trim();
const numberValue = (value) => Number(String(value).replace(/,/g, ''));

const HEALTH_SIGNAL = /\b(steps?|walk(?:ed|ing)?|run(?:ning)?|jogg(?:ed|ing)?|sleep|slept|mood|feel(?:ing)?|water|hydration|exercis(?:e|ed|ing)|workout|gym|heart\s*rate|bpm|calories?|kcal|nutrition|healthy)\b/i;
const FINANCE_SIGNAL = /(?:[$€£₪]|\b(?:spent|spend|paid|pay|bought|purchase(?:d)?|cost|expense|earned|income|salary|paycheck|freelance|received|usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)\b)/i;
const ADVICE_SIGNAL = /\b(advice|advise|recommend(?:ation|ed|s)?|suggest(?:ion|ed|s)?|what\s+(?:can|should|could)\s+i|what\s+to\s+(?:buy|eat|do)|how\s+(?:can|should|do)\s+i|best\s+(?:food|choice|option)|help\s+me\s+(?:choose|plan|improve))\b/i;
const HEALTH_LOG_EVENT = /\b(?:slept|walked|ran|jogged|exercised|worked\s*out|drank|my\s+mood\s+(?:was|is)|my\s+heart\s*rate|ate)\b/i;
const FINANCE_LOG_EVENT = /\b(?:spent|paid|bought|purchased|earned|received|salary\s+was|cost\s+me)\b/i;

const detectRuleLabel = (message) => {
  const text = normalize(message);
  if (/^(hi|hello|hey|good\s+(morning|afternoon|evening))[!.\s]*$/.test(text)) return 'general_chat';
  if (/\b(help me use lifesync|what can you do|who are you)\b/.test(text)) return 'general_chat';
  if (/\b(summary|dashboard|weekly report|insights?|how much did i spend|show my|this week)\b/.test(text)) return 'query_summary';
  if (/\b(goal|target)\b|\b(?:i\s+)?(?:aim|plan)\s+to\b|\bi want to save\b|\bset\b.{0,30}\bbudget\b/.test(text)) return 'set_goal';
  if (/\b\d+(?:\.\d+)?\s+for\s+(?:the\s+)?gym\b/.test(text)) return 'log_both';
  const health = HEALTH_SIGNAL.test(text);
  const finance = FINANCE_SIGNAL.test(text);
  if (health && finance) return 'log_both';
  if (finance) return 'log_expense';
  if (health) return 'log_health';
  return null;
};

const currencyFrom = (symbolOrCode) => {
  const value = String(symbolOrCode || '').toLowerCase();
  if (value === '€' || value.startsWith('eur') || value.startsWith('euro')) return 'EUR';
  if (value === '£' || value.startsWith('gbp') || value.startsWith('pound')) return 'GBP';
  if (value === '₪' || ['ils', 'nis'].includes(value) || value.startsWith('shekel')) return 'ILS';
  return 'USD';
};

const financeCategory = (text, type) => {
  if (type === 'income') return /freelance|client/.test(text) ? 'Income - Freelance' : 'Income - Salary';
  if (/lunch|breakfast|dinner|food|restaurant|coffee|meal/.test(text)) return 'Food & Dining';
  if (/bus|taxi|uber|fuel|gas|transport|train/.test(text)) return 'Transportation';
  if (/movie|game|concert|entertainment/.test(text)) return 'Entertainment';
  if (/electric|water bill|internet|rent|utility|utilities|phone bill/.test(text)) return 'Bills & Utilities';
  if (/doctor|medicine|medical|pharmacy|hospital|gym/.test(text)) return 'Healthcare';
  if (/course|school|book|tuition|education/.test(text)) return 'Education';
  if (/grocery|groceries|supermarket/.test(text)) return 'Groceries';
  if (/save|saving|savings/.test(text)) return 'Savings';
  if (/shop|shirt|clothes|clothing|shoes|amazon/.test(text)) return 'Shopping';
  return 'Other';
};

const extractFinance = (message, { allowBareAmount = false } = {}) => {
  const text = normalize(message);
  const income = /\b(earned|income|salary|paycheck|freelance|received|made)\b/.test(text);
  const patterns = [
    /([$€£₪])\s*(\d+(?:,\d{3})*(?:\.\d+)?)/,
    /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)/,
    /\b(?:spent|spend|paid|pay|bought|purchase(?:d)?|cost|earned|received|salary|income)\s*(?:me\s*)?(\d+(?:,\d{3})*(?:\.\d+)?)/,
  ];
  let match = null;
  let amount = null;
  let currency = 'USD';
  for (const pattern of patterns) {
    match = text.match(pattern);
    if (!match) continue;
    if (/^[$€£₪]$/.test(match[1] || '')) {
      currency = currencyFrom(match[1]);
      amount = numberValue(match[2]);
    } else if (match[2] && /^(usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)$/.test(match[2])) {
      amount = numberValue(match[1]);
      currency = currencyFrom(match[2]);
    } else {
      amount = numberValue(match[1]);
    }
    break;
  }
  if (amount === null && allowBareAmount) {
    const bare = text.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\b/);
    if (bare) amount = numberValue(bare[1]);
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const purpose = text.match(/\b(?:on|for|at)\s+(?:the\s+)?([^,.!?]+)/)?.[1]?.trim();
  return {
    domain: 'finance',
    activity: purpose || (income ? 'income' : 'transaction'),
    type: income ? 'income' : 'expense',
    amount,
    currency,
    category: financeCategory(text, income ? 'income' : 'expense'),
    description: purpose || (income ? 'income' : null),
  };
};

const extractFinanceEntities = (message, options = {}) => {
  const clauses = String(message)
    .split(/[.!?;]+|\band\b(?=\s*(?:then\s+)?(?:spent|paid|bought|purchased|earned|received)\b)/i)
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates = clauses.length ? clauses : [message];
  const entities = [];
  for (const clause of candidates) {
    const hasFinanceSignal = FINANCE_SIGNAL.test(clause);
    const allowBareAmount = Boolean(options.allowBareAmount && candidates.length === 1);
    if (!hasFinanceSignal && !allowBareAmount) continue;
    const entity = extractFinance(clause, { ...options, allowBareAmount });
    if (!entity) continue;
    const key = [entity.type, entity.amount, entity.currency, entity.description].join('|');
    if (!entities.some((item) => item._key === key)) entities.push({ ...entity, _key: key });
  }
  if (!entities.length) {
    const fallback = extractFinance(message, options);
    if (fallback) entities.push({ ...fallback, _key: 'fallback' });
  }
  return entities.map(({ _key, ...entity }) => entity);
};

const pushHealth = (entities, entity) => {
  if (!entities.some((item) => item.type === entity.type)) entities.push(entity);
};

const extractHealth = (message, { allowBareExercise = false } = {}) => {
  const text = normalize(message);
  const entities = [];
  let match = text.match(/\b(\d+(?:,\d{3})*)\s*steps?\b/);
  if (match) pushHealth(entities, {
    domain: 'health', activity: 'walking', type: 'steps', value: numberValue(match[1]),
    value_text: null, unit: 'steps', duration: null, category: 'Steps',
  });

  match = text.match(/\b(?:slept|sleep(?:ing)?(?:\s+for)?)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/)
    || text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+(?:of\s+)?sleep\b/);
  if (match) {
    const hours = numberValue(match[1]);
    pushHealth(entities, {
      domain: 'health', activity: 'sleep', type: 'sleep', value: hours,
      value_text: null, unit: 'hours', duration: Math.round(hours * 60), category: 'Sleep',
    });
  }

  match = text.match(/\b(\d+(?:\.\d+)?)\s*(ml|milliliters?|l|liters?|glasses?)\b(?=[^.!?]*\bwater\b)/)
    || text.match(/\bwater\b[^.!?]*?\b(\d+(?:\.\d+)?)\s*(ml|milliliters?|l|liters?|glasses?)\b/);
  if (match) {
    const raw = numberValue(match[1]);
    const unit = match[2];
    const liters = unit.startsWith('ml') || unit.startsWith('milliliter') ? raw / 1000
      : unit.startsWith('glass') ? raw * 0.25 : raw;
    pushHealth(entities, {
      domain: 'health', activity: 'water', type: 'water', value: liters,
      value_text: null, unit: 'liters', duration: null, category: 'Water Intake',
    });
  }

  match = text.match(/\b(?:heart\s*rate(?:\s+was)?\s*)?(\d{2,3})\s*bpm\b/);
  if (match) pushHealth(entities, {
    domain: 'health', activity: 'heart rate', type: 'heart_rate', value: numberValue(match[1]),
    value_text: null, unit: 'bpm', duration: null, category: 'Heart Rate',
  });

  const exerciseSignal = /\b(run(?:ning)?|jogg(?:ing)?|walk(?:ed|ing)?|exercis(?:e|ed|ing)|workout|gym|cycled?|cycling)\b/.test(text);
  match = exerciseSignal && (text.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/));
  if (!match && exerciseSignal && allowBareExercise) match = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (match) {
    const raw = numberValue(match[1]);
    const minutes = match[2] && /hour|hr/.test(match[2]) ? raw * 60 : raw;
    pushHealth(entities, {
      domain: 'health', activity: text.match(/run(?:ning)?|jogg(?:ing)?|walking|walked|workout|gym|cycling/)?.[0] || 'exercise',
      type: 'exercise', value: minutes, value_text: null, unit: 'minutes',
      duration: Math.round(minutes), category: 'Exercise',
    });
  }

  match = text.match(/\b(?:mood\s*(?:was|is)?\s*)?(10|[1-9])\s*\/\s*10\b/);
  const moodWords = [
    [/\b(terrible|awful)\b/, 2], [/\b(bad|poor)\b/, 3], [/\b(okay|neutral)\b/, 5],
    [/\b(good|fine)\b/, 6], [/\b(great|happy)\b/, 8], [/\b(amazing|excellent)\b/, 10],
  ];
  let mood = match ? numberValue(match[1]) : null;
  let moodText = match?.[0] || null;
  if (mood === null && /\b(mood|feel|feeling)\b/.test(text)) {
    for (const [pattern, value] of moodWords) {
      const word = text.match(pattern);
      if (word) { mood = value; moodText = word[1]; break; }
    }
  }
  if (mood !== null) pushHealth(entities, {
    domain: 'health', activity: 'mood', type: 'mood', value: mood,
    value_text: moodText, unit: 'rating', duration: null, category: 'Mood',
  });

  match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:kcal|calories?)\b/);
  if (match) pushHealth(entities, {
    domain: 'health', activity: 'nutrition', type: 'nutrition', value: numberValue(match[1]),
    value_text: null, unit: 'kcal', duration: null, category: 'Nutrition',
  });
  return entities;
};

const clarification = (question, options) => ({
  needs_clarification: true,
  clarification_question: question,
  clarification_options: options,
  entities: [],
});

const forcedLabelFromAnswer = (answer) => {
  const text = normalize(answer);
  if (/\b(both|c|option c)\b/.test(text)) return 'log_both';
  if (/\b(health|exercise|workout|minutes|b|option b)\b/.test(text)) return 'log_health';
  if (/\b(expense|finance|money|dollars?|a|option a)\b/.test(text)) return 'log_expense';
  return null;
};

const extractBudget = (message) => {
  const text = normalize(message);
  const explicitBudget = /\b(budget|have|left|available|can\s+spend|afford)\b/.test(text);
  if (FINANCE_LOG_EVENT.test(text) && !explicitBudget) return null;
  const contextual = text.match(/\b(?:budget(?:\s+is|\s+of)?|have|left|available|can\s+spend|afford)\s*(?:about|only|is|of|with)?\s*([$€£₪])?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)?/)
    || text.match(/([$€£₪])?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)?\s*(?:left|budget|available)\b/);
  const match = contextual
    || text.match(/([$€£₪])\s*(\d+(?:,\d{3})*(?:\.\d+)?)/)
    || text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)/);
  if (!match) return null;
  let amount;
  let currencyToken;
  if (contextual) {
    amount = numberValue(match[2]);
    currencyToken = match[1] || match[3];
  } else {
    const symbolFirst = /^[$€£₪]$/.test(match[1] || '');
    amount = numberValue(symbolFirst ? match[2] : match[1]);
    currencyToken = symbolFirst ? match[1] : match[2];
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    currency: currencyFrom(currencyToken),
  };
};

const formatMoney = (currency, amount) => `${currency} ${Number(amount.toFixed(2))}`;

const buildContextSummary = (context = {}) => {
  const parts = [];
  const goals = Array.isArray(context.active_goals) ? context.active_goals : [];
  const health = context.health || {};
  if (health.mood) parts.push(`mood averages ${health.mood.average}/10 from ${health.mood.count} log(s)`);
  if (health.sleep) parts.push(`sleep averages ${health.sleep.average} hours`);
  if (health.steps) parts.push(`steps average ${Math.round(health.steps.average)} per logged day`);
  if (health.water) parts.push(`water averages ${health.water.average} liters`);
  const financeEntries = Object.entries(context.finance || {})
    .sort((a, b) => b[1].transactions - a[1].transactions);
  if (financeEntries.length) {
    const [currency, summary] = financeEntries[0];
    parts.push(`${context.window_days || 30}-day ${currency} spending is ${summary.expense} and income is ${summary.income}`);
  }
  if (goals.length) {
    parts.push(`${goals.length} active goal${goals.length === 1 ? '' : 's'}, including ${goals.slice(0, 2).map((goal) => goal.metric).join(' and ')}`);
  }
  if (!parts.length) return 'I do not have enough recent logs for a personalized trend yet.';
  return `Your recent context: ${parts.join('; ')}.`;
};

const buildAdviceResponse = (message, context, entities) => {
  const budget = extractBudget(message);
  const nutritionGoal = /\b(food|eat|meal|nutrition|healthy|grocer|vegetable|fruit)\b/i.test(message);
  const moodGoal = /\b(mood|feel|energy|happy|stress)\b/i.test(message);
  const parts = [];
  const healthLogged = entities.filter((entity) => entity.domain === 'health').length;
  const financeLogged = entities.filter((entity) => entity.domain === 'finance').length;
  if (healthLogged || financeLogged) {
    parts.push(`Logged ${healthLogged} health and ${financeLogged} finance item(s) from your message.`);
  }

  if (budget && nutritionGoal) {
    const protein = budget.amount * 0.35;
    const produce = budget.amount * 0.30;
    const staple = budget.amount * 0.25;
    const reserve = budget.amount - protein - produce - staple;
    parts.push(
      `For ${formatMoney(budget.currency, budget.amount)}, target about ${formatMoney(budget.currency, protein)} for protein such as lentils, beans, eggs, or yogurt; ${formatMoney(budget.currency, produce)} for seasonal vegetables and fruit; ${formatMoney(budget.currency, staple)} for oats, rice, or whole pita; keep ${formatMoney(budget.currency, reserve)} as price buffer.`
    );
    parts.push('Choose cheapest seasonal items and compare unit prices; shop prices vary.');
  } else if (budget) {
    parts.push(`Protect ${formatMoney(budget.currency, budget.amount)} by funding the need first, comparing unit prices, and keeping roughly 10% unspent.`);
  } else if (nutritionGoal) {
    parts.push('Build the meal around protein, fiber, a seasonal vegetable or fruit, and water.');
  }

  const health = context?.health || {};
  if (moodGoal) {
    if (health.sleep?.average && health.sleep.average < 7) {
      parts.push(`Your logged sleep averages ${health.sleep.average} hours; a regular sleep schedule may help energy more than a single food choice.`);
    }
    if (health.mood?.average) {
      parts.push(`Your recorded mood average is ${health.mood.average}/10 across ${health.mood.count} log(s); keep tracking mood beside sleep, meals, and activity to find your pattern.`);
    }
    parts.push('Food cannot guarantee a better mood; regular meals, hydration, daylight, movement, and sleep can support energy.');
  }

  if (!budget && !nutritionGoal && !moodGoal) parts.push(buildContextSummary(context));
  return parts.join(' ');
};

const buildResponse = (intent, entities, message, context = {}, adviceRequested = false) => {
  if (adviceRequested) return buildAdviceResponse(message, context, entities);
  if (intent === 'query_general') {
    const name = context.profile?.name;
    return `${name ? `Hi ${name}!` : 'Hi!'} I remember your LifeSync history, can discuss health and finances together, log updates, summarize trends, and help with goals.`;
  }
  if (['get_insight', 'query_finance', 'query_health'].includes(intent)) return buildContextSummary(context);
  if (intent === 'set_goal') return 'I understood this as a goal request. Open Goals to set the target and schedule.';
  const health = entities.filter((entity) => entity.domain === 'health');
  const finance = entities.filter((entity) => entity.domain === 'finance');
  if (health.length && finance.length) return `Logged ${health.length} health item(s) and ${finance.length} financial item(s).`;
  if (health.length) return `Logged ${health.length} health item(s).`;
  if (finance.length) return `Logged ${finance[0].currency} ${finance[0].amount} ${finance[0].type}.`;
  return 'I understood the request, but found no complete record to save.';
};

const parseMessageWithBert = async (message, pendingClarification = null, context = {}) => {
  const started = Date.now();
  const original = pendingClarification?.originalMessage || message;
  const forcedLabel = pendingClarification ? forcedLabelFromAnswer(message) : null;
  let classification;
  let runtimeError = null;
  try {
    classification = await classifyText(pendingClarification ? `${original} ${message}` : message);
  } catch (error) {
    runtimeError = error.message;
    classification = { label: detectRuleLabel(original) || 'general_chat', confidence: 0.5, provider: 'fallback', latency_ms: null };
  }

  const ruleLabel = detectRuleLabel(original);
  const adviceRequested = ADVICE_SIGNAL.test(original);
  const hasHealthEvent = HEALTH_LOG_EVENT.test(original);
  const hasFinanceEvent = FINANCE_LOG_EVENT.test(original);
  const detectedLabels = [...new Set([
    classification.label,
    ...(Array.isArray(classification.detected_labels) ? classification.detected_labels : []),
  ].filter(Boolean))];

  let routedLabel;
  if (forcedLabel) routedLabel = forcedLabel;
  else if (adviceRequested) {
    if (hasHealthEvent && hasFinanceEvent) routedLabel = 'log_both';
    else if (hasHealthEvent) routedLabel = 'log_health';
    else if (hasFinanceEvent) routedLabel = 'log_expense';
    else routedLabel = 'query_summary';
  } else if (ruleLabel) routedLabel = ruleLabel;
  else if (detectedLabels.includes('log_both')
    || (detectedLabels.includes('log_health') && detectedLabels.includes('log_expense'))) {
    routedLabel = 'log_both';
  } else routedLabel = classification.label;

  let candidateIntent = LABEL_TO_INTENT[routedLabel] || 'unclear';
  if (routedLabel === 'query_summary' && !adviceRequested) {
    const asksFinance = /\b(spend|spent|expense|income|budget|finance|money|transaction)\b/i.test(original);
    const asksHealth = /\b(health|sleep|steps|mood|water|exercise|heart\s*rate|calories)\b/i.test(original);
    if (asksFinance && !asksHealth) candidateIntent = 'query_finance';
    else if (asksHealth && !asksFinance) candidateIntent = 'query_health';
  }
  const allowBareFinance = Boolean(forcedLabel)
    || (routedLabel === 'log_expense' && FINANCE_SIGNAL.test(original));
  const allowBareExercise = forcedLabel === 'log_health' || forcedLabel === 'log_both';

  let entities = [];
  if (['log_expense', 'log_both'].includes(routedLabel)) {
    entities.push(...extractFinanceEntities(original, {
      allowBareAmount: allowBareFinance || routedLabel === 'log_both',
    }));
  }
  if (['log_health', 'log_both'].includes(routedLabel)) {
    entities.push(...extractHealth(original, { allowBareExercise }));
  }

  let clarificationResult = null;
  const ambiguousGym = /\b\d+(?:\.\d+)?\s+for\s+(?:the\s+)?gym\b/i.test(original) && !forcedLabel;
  if (ambiguousGym && !adviceRequested) {
    clarificationResult = clarification(
      'Should I log this as a gym expense, exercise minutes, or both?',
      ['Gym expense', 'Exercise minutes', 'Both']
    );
  } else if (!adviceRequested && routedLabel === 'log_expense' && !entities.some((entity) => entity.domain === 'finance')) {
    clarificationResult = clarification('What amount should I log?', ['Add an amount', 'Cancel']);
  } else if (!adviceRequested && routedLabel === 'log_expense' && !forcedLabel) {
    const finance = entities.find((entity) => entity.domain === 'finance');
    if (finance && !finance.description && !/\b(income|salary|earned|received)\b/i.test(original)) {
      clarificationResult = clarification(
        `What was the ${finance.currency} ${finance.amount} for?`,
        ['Food', 'Transport', 'Shopping', 'Other']
      );
    }
  } else if (!adviceRequested && routedLabel === 'log_health' && entities.length === 0) {
    clarificationResult = clarification(
      'What value should I record—for example duration, steps, hours, liters, or a mood rating?',
      ['Add duration', 'Add steps', 'Add health value']
    );
  } else if (!adviceRequested && routedLabel === 'log_both') {
    const hasHealth = entities.some((entity) => entity.domain === 'health');
    const hasFinance = entities.some((entity) => entity.domain === 'finance');
    if (!hasHealth || !hasFinance) {
      clarificationResult = clarification(
        'I need both a measurable health value and a financial amount. What is missing?',
        ['Add health value', 'Add financial amount', 'Log one domain only']
      );
    }
  }

  const needsClarification = Boolean(clarificationResult);
  if (needsClarification) entities = [];
  const intent = needsClarification ? 'unclear' : candidateIntent;
  const domains = new Set(entities.map((entity) => entity.domain));
  let domain = 'general';
  if (domains.size === 2) domain = 'both';
  else if (domains.has('health')) domain = 'health';
  else if (domains.has('finance')) domain = 'finance';
  else if (intent === 'query_finance') domain = 'finance';
  else if (intent === 'query_health') domain = 'health';
  else if (routedLabel === 'query_summary') domain = 'both';
  else if (routedLabel === 'log_health') domain = 'health';
  else if (routedLabel === 'log_expense') domain = 'finance';
  else if (routedLabel === 'log_both') domain = 'both';
  const confidence = needsClarification
    ? Math.min(Number(classification.confidence) || 0.3, 0.49)
    : Math.min(1, Math.max(0, Number(classification.confidence) || 0.5));

  return {
    success: !needsClarification && (
      entities.length > 0
      || ['query_general', 'query_health', 'query_finance', 'get_insight', 'set_goal'].includes(intent)
    ),
    intent,
    candidate_intent: needsClarification ? candidateIntent : null,
    domain,
    entities,
    response: needsClarification
      ? clarificationResult.clarification_question
      : buildResponse(intent, entities, original, context, adviceRequested),
    is_cross_domain: domain === 'both' && (entities.length > 1 || adviceRequested),
    needs_clarification: needsClarification,
    clarification_question: clarificationResult?.clarification_question || null,
    clarification_options: clarificationResult?.clarification_options || null,
    confidence,
    processing_time_ms: Date.now() - started,
    original_message: original,
    context_used: {
      window_days: context.window_days || 30,
      messages: context.source_counts?.messages || 0,
      health_logs: context.source_counts?.health_logs || 0,
      finance_logs: context.source_counts?.finance_logs || 0,
      goals: context.source_counts?.goals || 0,
    },
    model_runtime: {
      status: runtimeError ? 'deterministic_fallback' : 'ready',
      provider: 'bert_local',
      model: classification.model || 'bert_best_model_10pct',
      execution_provider: classification.provider || null,
      raw_label: classification.label,
      detected_labels: detectedLabels,
      routed_label: routedLabel,
      rule_override: routedLabel !== classification.label,
      model_confidence: classification.confidence,
      model_latency_ms: classification.latency_ms,
      chunk_count: classification.chunk_count || 1,
      truncated_chunks: classification.truncated_chunks || 0,
      chunk_results: classification.chunk_results || [],
      error: runtimeError,
    },
  };
};

module.exports = {
  parseMessageWithBert,
  _detectRuleLabel: detectRuleLabel,
  _extractFinance: extractFinance,
  _extractFinanceEntities: extractFinanceEntities,
  _extractHealth: extractHealth,
  _extractBudget: extractBudget,
  _buildContextSummary: buildContextSummary,
};
