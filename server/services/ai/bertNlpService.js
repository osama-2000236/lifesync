const { classifyText } = require('./providerClient');

const LABEL_TO_INTENT = {
  general_chat: 'query_general',
  log_both: 'log_both',
  log_expense: 'log_finance',
  log_health: 'log_health',
  query_summary: 'get_insight',
  set_goal: 'set_goal',
};

// ─── Arabic input normalization ────────────────────────────────────────────
// The deterministic extractor is English-regex based. To log in native Arabic
// (not translation) we map Arabic-Indic/Persian numerals → ASCII and distinctive
// Arabic stems → the English tokens the extractor + rule router already match.
// Substring-based (Arabic has no \b in JS regex); stems are distinctive enough
// that collateral matches are negligible. Only runs when Arabic script present,
// and only on the COPY used for matching — the stored message stays raw Arabic.
const AR_DIGITS = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};
const AR_LEXICON = [
  // Phrases FIRST — the verb stems below would otherwise consume their words
  // (e.g. "كم أنفقت" must become a summary query before أنفق → spent).
  [/كم\s+(?:أنفقت|انفقت|صرفت|دفعت)/g, ' how much did i spend '],
  [/ملخص/g, ' summary '],
  [/أريد أن (?:أدخر|ادخر|أوفر|اوفر)|أريد (?:توفير|ادخار|الادخار)/g, ' i want to save '],
  [/هدفي|هدف/g, ' goal '],
  // Dual forms before their singular stems (لترين contains لتر etc.).
  [/لترين/g, ' 2 liters '],
  [/ساعتين/g, ' 2 hours '],
  [/كوبين/g, ' 2 glasses '],
  [/دقيقتين/g, ' 2 minutes '],
  [/صرف|أنفق|انفق|دفع|اشتري|اشتر/g, ' spent '],
  [/ربح|كسب|استلم|راتب/g, ' earned '],
  [/دولار/g, ' dollars '],
  [/شيكل|شيقل/g, ' shekels '],
  [/يورو/g, ' euros '],
  [/مشيت|مشي|امشي|أمشي/g, ' walked '],
  [/خطوات|خطوة|خطوه/g, ' steps '],
  [/نمت|أنام|انام|النوم|نوم/g, ' slept '],
  // Soft sleep qualifiers — must land before residual Arabic strip so
  // "نمت قليل" → "slept little" (not bare "slept" with قليل dropped).
  [/قليلاً|قليلا|قليل|قليلة/g, ' little '],
  [/سيء|سيئ|سئ|رديء/g, ' poor '],
  [/ساعات|ساعة|ساعه/g, ' hours '],
  [/دقائق|دقيقة|دقيقه/g, ' minutes '],
  [/شربت|اشرب|أشرب/g, ' drank '],
  [/مياه|ماء/g, ' water '],
  [/لترات|لتر/g, ' liters '],
  [/أكواب|اكواب|كوب/g, ' glasses '],
  [/تمارين|تمرين|تمرنت|تمرن|رياضة|تدريب|جري|ركض|ركضت/g, ' exercise '],
  [/مزاج|أشعر|اشعر|شعرت|شعور/g, ' feel mood '],
  [/الغداء|غداء/g, ' lunch '],
  [/العشاء|عشاء/g, ' dinner '],
  [/الإفطار|الافطار|إفطار|افطار|فطور/g, ' breakfast '],
  [/قهوة|قهوه/g, ' coffee '],
  [/طعام|وجبة|وجبه|الأكل|أكل|اكل/g, ' food '],
  [/طلبات|طلب/g, ' takeout '],
  [/صحية|صحّي|صحي/g, ' healthy '],
  // Expense-category stems → the English tokens financeCategory() matches.
  // Without these every non-food Arabic expense lands in "Other".
  [/باص|حافلة/g, ' bus '],
  [/تاكسي|تكسي/g, ' taxi '],
  [/أوبر|اوبر/g, ' uber '],
  [/بنزين|وقود/g, ' fuel '],
  [/مواصلات/g, ' transport '],
  [/قطار/g, ' train '],
  [/دواء|أدوية|ادوية|علاج/g, ' medicine '],
  [/صيدلية/g, ' pharmacy '],
  [/طبيب|دكتور/g, ' doctor '],
  [/مستشفى/g, ' hospital '],
  [/نادي|جيم/g, ' gym '],
  [/فاتورة|فواتير/g, ' bill '],
  [/كهرباء/g, ' electric '],
  [/إنترنت|انترنت|النت/g, ' internet '],
  [/إيجار|ايجار/g, ' rent '],
  [/ملابس/g, ' clothes '],
  [/حذاء|أحذية|احذية/g, ' shoes '],
  [/سوبرماركت|سوبر ماركت|بقالة|خضار|خضروات|فواكه/g, ' groceries '],
  [/تسوّق|تسوق/g, ' shopping '],
  [/أخرى|اخرى/g, ' other '], // clarification option «أخرى» must survive normalize
  [/جامعة/g, ' tuition '],
  [/مدرسة/g, ' school '],
  [/كتاب/g, ' book '],
  [/دورة/g, ' course '],
  [/أدخر|ادخر|ادخار|توفير|وفرت/g, ' save '], // bare وفر would collide with متوفر
  [/شهريًا|شهريا|كل شهر/g, ' monthly '],
  [/أسبوعيًا|اسبوعيًا|أسبوعيا|اسبوعيا|كل أسبوع|كل اسبوع/g, ' weekly '],
  [/يوميًا|يوميا|كل يوم/g, ' daily '],
  [/عمل حر|مستقل/g, ' freelance '],
  [/على/g, ' on '], // connector so "<amount> on <purpose>" parses the category
];
const normalizeArabic = (text) => {
  let s = String(text).replace(/[٠-٩۰-۹]/g, (d) => AR_DIGITS[d] ?? d);
  for (const [re, rep] of AR_LEXICON) s = s.replace(re, rep);
  // Drop any unmapped Arabic (connectors, suffix residue like "moodي", custom
  // words) so leftovers don't glue onto the English tokens the regexes match.
  s = s.replace(/[؀-ۿ]+/g, ' ');
  return s;
};
const normalize = (text) => {
  let t = String(text || '').toLowerCase().replace(/[’]/g, "'");
  if (/[؀-ۿ]/.test(t)) t = normalizeArabic(t);
  return t.replace(/\s+/g, ' ').trim();
};
const numberValue = (value) => Number(String(value).replace(/,/g, ''));

// Reply in Arabic when the user wrote Arabic OR the UI locale is Arabic, so the
// default on-device assistant confirms/clarifies natively (not just cloud models).
const wantsArabic = (message, context = {}) =>
  /[؀-ۿ]/.test(String(message || '')) || String(context?.locale || '').toLowerCase().startsWith('ar');

// Include past tense "ran" — `run(?:ning)?` alone misses "I ran 5 km".
const HEALTH_SIGNAL = /\b(steps?|walk(?:ed|ing)?|ran|run(?:ning)?|jogg(?:ed|ing)?|sleep|slept|mood|feel(?:ing)?|water|hydration|exercis(?:e|ed|ing)|workout|gym|heart\s*rate|bpm|calories?|kcal|nutrition|healthy)\b/i;
const FINANCE_SIGNAL = /(?:[$€£₪]|\b(?:spent|spend|paid|pay|bought|purchase(?:d)?|cost|expense|earned|income|salary|paycheck|freelance|received|usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)\b)/i;
const ADVICE_SIGNAL = /\b(advice|advise|recommend(?:ation|ed|s)?|suggest(?:ion|ed|s)?|what\s+(?:can|should|could)\s+i|what\s+to\s+(?:buy|eat|do)|how\s+(?:can|should|do)\s+i|best\s+(?:food|choice|option)|help\s+me\s+(?:choose|plan|improve))\b/i;
const HEALTH_LOG_EVENT = /\b(?:slept|walked|ran|jogged|exercised|worked\s*out|drank|my\s+mood\s+(?:was|is)|my\s+heart\s*rate|ate)\b/i;
const FINANCE_LOG_EVENT = /\b(?:spent|paid|bought|purchased|earned|received|salary\s+was|cost\s+me)\b/i;
// Food/meal context — lets a food expense double as a nutrition entry so
// "spent $50 on a healthy dinner" logs cross-domain without a clarification.
const FOOD_CONTEXT = /\b(food|meal|breakfast|lunch|dinner|snack|brunch|restaurant|cafe|coffee|grocer(?:y|ies)|healthy\s+(?:meal|dinner|lunch|breakfast|food|eat)|salad|fruit|vegetable)\b/i;

// ─── Cross-domain "outing" follow-up ───────────────────────────────
// Turns an everyday plan ("I'm going to town") into a daily-assistant
// follow-up that asks HOW the user will travel, then connects the answer to
// both finance (cost) and health (movement) — the core "creates cross-domain
// info from a daily sample conversation" behaviour.
const OUTING_VERB = /\b(go(?:ing)?|head(?:ing|ed)?|drive|driving|walk(?:ing)?|travel(?:ing|ling)?|commut(?:e|ing)|pop(?:ping)?\s+(?:over|out)|run(?:ning)?\s+(?:out|to))\b/i;
const OUTING_DEST = /\b(?:to|towards?|for|into)\s+(?:the\s+|my\s+|downtown\s+)?(town|downtown|city|city\s*center|market|mall|work|office|uni(?:versity)?|college|school|campus|store|shop|supermarket|grocery|groceries|pharmacy|bank|park)\b/i;
const TRANSPORT_MODE_PRESENT = /\b(by car|by bus|by train|by bike|on foot|walking|driving|cycling|taxi|uber|metro)\b/i;

const prettyPlace = (place) => {
  const p = String(place || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (p === 'uni') return 'university';
  if (p === 'city center' || p === 'downtown' || p === 'city') return 'city';
  return p;
};

const transportModeFromText = (text) => {
  const t = normalize(text);
  if (/\b(walk|walking|on foot|by foot|stroll)\b/.test(t)) return 'walk';
  if (/\b(bus|train|metro|tram|public\s*transport|公交)\b/.test(t)) return 'bus';
  if (/\b(car|driv(?:e|ing)|taxi|uber|ride)\b/.test(t)) return 'car';
  return null;
};

/** Detect an everyday outing with no logged metric. Returns {place, modeAlready} or null. */
const detectOuting = (message) => {
  const text = normalize(message);
  if (!text) return null;
  // If the user already gave money/health facts, let normal logging handle it.
  if (FINANCE_SIGNAL.test(text) || HEALTH_LOG_EVENT.test(text) || FINANCE_LOG_EVENT.test(text)) return null;
  if (!OUTING_VERB.test(text)) return null;
  const dest = text.match(OUTING_DEST);
  if (!dest) return null;
  return { place: prettyPlace(dest[1]), modeAlready: TRANSPORT_MODE_PRESENT.test(text) };
};

const outingRuntime = (routedLabel, started, classification = {}) => ({
  status: 'ready',
  provider: 'bert_local',
  model: classification.model || 'bert_best_model_10pct',
  execution_provider: classification.provider || null,
  raw_label: classification.label || null,
  routed_label: routedLabel,
  rule_override: true,
  feature: 'cross_domain_followup',
  model_latency_ms: classification.latency_ms || null,
});

const buildOutingClarification = (message, outing, started, classification) => ({
  success: false,
  intent: 'unclear',
  candidate_intent: 'log_both',
  domain: 'general',
  entities: [],
  response: `Heading to the ${outing.place}? Nice. Are you going by car, by bus, or on foot? Knowing how you travel lets me keep an eye on both the cost and the movement.`,
  is_cross_domain: false,
  needs_clarification: true,
  clarification_question: `How are you getting to the ${outing.place}?`,
  clarification_options: ['By car', 'By bus', 'Walking'],
  confidence: 0.4,
  processing_time_ms: Date.now() - started,
  original_message: message,
  model_runtime: outingRuntime('outing_ask_mode', started, classification),
});

const buildOutingResolution = (originalMessage, outing, mode, context, started, classification) => {
  const name = context?.profile?.name ? `, ${context.profile.name}` : '';
  let response;
  if (mode === 'walk') {
    response = `Walking to the ${outing.place} is a free win${name} — zero cost for your wallet and real activity for your body. Want me to log the walk? Just tell me the minutes or steps (e.g. "walked 20 minutes"). And how's your mood today on a 1–10 scale?`;
  } else if (mode === 'bus') {
    response = `Taking the bus to the ${outing.place} keeps the cost low and still adds a short walk at each end${name}. Want me to log the fare? Tell me the amount (e.g. "spent $2 on the bus"). How are you feeling about the day ahead?`;
  } else {
    response = `Got it${name} — driving to the ${outing.place}. That usually means a little fuel or parking, so tell me the amount and I'll log it (e.g. "spent $6 on fuel"). Since the car skips the steps, maybe a short walk later to balance it out? What's your energy like today, 1–10?`;
  }

  const memKey = `routine.commute.${outing.place.replace(/\s+/g, '_')}`;
  const modeLabel = mode === 'walk' ? 'on foot' : mode === 'bus' ? 'by bus' : 'by car';

  return {
    success: true,
    intent: 'query_general',
    candidate_intent: 'log_both',
    domain: 'both',
    entities: [],
    response,
    is_cross_domain: true,
    needs_clarification: false,
    clarification_question: null,
    clarification_options: null,
    confidence: 0.8,
    processing_time_ms: Date.now() - started,
    original_message: originalMessage,
    model_runtime: outingRuntime('outing_resolved', started, classification),
    _memory_writes: [{
      mem_key: memKey,
      category: 'routine',
      value: `usually travels to the ${outing.place} ${modeLabel}`,
      confidence: 0.85,
      salience: 3,
    }],
  };
};

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
  if (/lunch|breakfast|dinner|food|restaurant|coffee|meal|smoothie|takeout|snack/.test(text)) return 'Food & Dining';
  if (/bus|taxi|uber|fuel|gas|transport|train/.test(text)) return 'Transportation';
  if (/movie|game|concert|entertainment/.test(text)) return 'Entertainment';
  if (/electric|water bill|internet|rent|utility|utilities|phone bill|\bbills?\b/.test(text)) return 'Bills & Utilities';
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
  const category = financeCategory(text, income ? 'income' : 'expense');
  // A resolved category IS the purpose ("paid 15 shekels bus" / «دفعت ١٥ شيكل
  // للباص» has no on/for connector) — don't make the user answer "what for?".
  const fallbackDesc = income ? 'income' : (category !== 'Other' ? category : null);
  return {
    domain: 'finance',
    activity: purpose || fallbackDesc || 'transaction',
    type: income ? 'income' : 'expense',
    amount,
    currency,
    category,
    description: purpose || fallbackDesc,
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
  // "8000 steps", "8k steps", "walked 5k" (k = thousand steps; not "5 km")
  let match = text.match(/\b(\d+(?:,\d{3})*)\s*steps?\b/)
    || text.match(/\b(\d+(?:\.\d+)?)\s*k\s*steps?\b/);
  if (match) {
    let steps = numberValue(match[1]);
    if (/\bk\s*steps?\b/i.test(match[0])) steps *= 1000;
    pushHealth(entities, {
      domain: 'health', activity: 'walking', type: 'steps', value: steps,
      value_text: null, unit: 'steps', duration: null, category: 'Steps',
    });
  } else {
    match = text.match(/\b(?:walk(?:ed|ing)?|ran|run(?:ning)?)\s+(\d+(?:\.\d+)?)\s*k\b(?!\s*m)/);
    if (match) {
      pushHealth(entities, {
        domain: 'health', activity: 'walking', type: 'steps', value: numberValue(match[1]) * 1000,
        value_text: null, unit: 'steps', duration: null, category: 'Steps',
      });
    }
  }

  match = text.match(/\b(?:slept|sleep(?:ing)?(?:\s+for)?)\s*(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/)
    || text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\s+(?:of\s+)?sleep\b/);
  if (match) {
    const hours = numberValue(match[1]);
    pushHealth(entities, {
      domain: 'health', activity: 'sleep', type: 'sleep', value: hours,
      value_text: null, unit: 'hours', duration: Math.round(hours * 60), category: 'Sleep',
    });
  } else if (/\b(?:poor|bad|little|rough)\s+sleep\b/.test(text)
    || /\bslept?\s+(?:a\s+)?(?:little|poorly|badly|terrible|awful|poor|bad|rough)\b/.test(text)
    || /\bno\s+sleep\b/.test(text)
    // Arabic residual after normalize: "slept little" (قليل→little) without "sleep" noun
    || /\bslept\s+little\b/.test(text)) {
    // Causal phrasing ("poor sleep so I spent…") — soft 5h marker, not a fake 0.
    pushHealth(entities, {
      domain: 'health', activity: 'sleep', type: 'sleep', value: 5,
      value_text: 'poor sleep', unit: 'hours', duration: 300, category: 'Sleep',
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

  const exerciseSignal = /\b(ran|run(?:ning)?|jogg(?:ed|ing)?|walk(?:ed|ing)?|exercis(?:e|ed|ing)|workout|gym|cycled?|cycling)\b/.test(text);
  // Distance → estimated minutes (health unit contract is minutes).
  // "ran 5 km", "walked 3 miles", "5km run". Does NOT steal "walked 5k" (steps).
  const distMatch = text.match(
    /\b(walk(?:ed|ing)?|ran|run(?:ning)?|jogg(?:ed|ing)?)\s+(\d+(?:\.\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?)\b/
  ) || text.match(
    /\b(\d+(?:\.\d+)?)\s*(km|kilometers?|kilometres?|mi|miles?)\s+(run|walk|jog)(?:ning|ing)?\b/
  );
  if (distMatch && !entities.some((e) => e.type === 'exercise' || e.type === 'steps')) {
    let verb;
    let dist;
    let unitTok;
    if (/^(walk|ran|run|jogg)/i.test(distMatch[1])) {
      verb = distMatch[1];
      dist = numberValue(distMatch[2]);
      unitTok = distMatch[3];
    } else {
      dist = numberValue(distMatch[1]);
      unitTok = distMatch[2];
      verb = distMatch[3];
    }
    const isWalk = /^walk/i.test(verb);
    const isKm = /^k/i.test(unitTok);
    // Rough pace: walk ~12 min/km (~20/mi); run/jog ~6 min/km (~10/mi).
    const minPer = isWalk ? (isKm ? 12 : 20) : (isKm ? 6 : 10);
    const minutes = Math.max(1, Math.round(dist * minPer));
    const label = `${dist} ${isKm ? 'km' : 'mi'} ${isWalk ? 'walk' : 'run'}`;
    pushHealth(entities, {
      domain: 'health',
      activity: isWalk ? 'walking' : (/jogg/i.test(verb) ? 'jogging' : 'running'),
      type: 'exercise',
      value: minutes,
      value_text: label,
      unit: 'minutes',
      duration: minutes,
      category: 'Exercise',
    });
  }
  match = exerciseSignal && (text.match(/\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/));
  if (!match && exerciseSignal && allowBareExercise) match = text.match(/\b(\d+(?:\.\d+)?)\b/);
  if (match && !entities.some((e) => e.type === 'exercise')) {
    const raw = numberValue(match[1]);
    const minutes = match[2] && /hour|hr/.test(match[2]) ? raw * 60 : raw;
    pushHealth(entities, {
      domain: 'health', activity: text.match(/ran|run(?:ning)?|jogg(?:ed|ing)?|walking|walked|workout|gym|cycling/)?.[0] || 'exercise',
      type: 'exercise', value: minutes, value_text: null, unit: 'minutes',
      duration: Math.round(minutes), category: 'Exercise',
    });
  }

  match = text.match(/\b(?:mood\s*(?:was|is)?\s*)?(10|[1-9])\s*\/\s*10\b/);
  const moodWords = [
    [/\b(terrible|awful|exhausted|depressed|miserable|overwhelmed)\b/, 2],
    [/\b(bad|poor|sad|stressed|anxious|worried|upset|unwell)\b/, 3],
    [/\b(tired|sleepy|low|down|drained)\b/, 4],
    [/\b(okay|neutral|meh|alright)\b/, 5],
    [/\b(good|fine|nice|well|calm|relaxed)\b/, 6],
    [/\b(great|happy)\b/, 8], [/\b(amazing|excellent|fantastic|wonderful)\b/, 10],
  ];
  let mood = match ? numberValue(match[1]) : null;
  let moodText = match?.[0] || null;
  if (mood === null && /\b(mood|feel|feeling)\b/.test(text)) {
    // "feeling 7", "mood is 8", "I feel a 6" — a 1–10 rating without the /10.
    const bare = text.match(/\b(?:mood|feel(?:ing)?)\s*(?:is|was|like|at|of|a|an)?\s*(10|[1-9])\b/)
      || text.match(/\b(10|[1-9])\s*(?:out of)\s*10\b/);
    if (bare) {
      mood = numberValue(bare[1]);
      moodText = bare[0];
    } else {
      for (const [pattern, value] of moodWords) {
        const word = text.match(pattern);
        if (word) { mood = value; moodText = word[1]; break; }
      }
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

// ─── Goal extraction (set_goal intent) ─────────────────────────────────────
// Deterministic spec for a UserGoal row. Money goals default to monthly,
// health goals to daily — the natural cadence people state them in.
const extractGoal = (message) => {
  const text = normalize(message);
  const period = /\bmonthly\b|\bper month\b|\ba month\b/.test(text) ? 'monthly'
    : /\bdaily\b|\bper day\b|\ba day\b/.test(text) ? 'daily'
      : /\bweekly\b|\bper week\b|\ba week\b/.test(text) ? 'weekly' : null;

  let m = text.match(/([$€£₪])\s*(\d+(?:,\d{3})*(?:\.\d+)?)/)
    || text.match(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(usd|dollars?|ils|nis|shekels?|eur|euros?|gbp|pounds?)\b/);
  if (m && /\b(save|saving|savings|budget)\b/.test(text)) {
    const symbolFirst = /^[$€£₪]$/.test(m[1] || '');
    const amount = numberValue(symbolFirst ? m[2] : m[1]);
    if (Number.isFinite(amount) && amount > 0) {
      return {
        domain: 'finance',
        metric_type: /\bbudget\b/.test(text) ? 'budget' : 'savings',
        target_value: amount,
        unit: currencyFrom(symbolFirst ? m[1] : m[2]),
        period: period || 'monthly',
      };
    }
  }
  m = text.match(/\b(\d+(?:,\d{3})*)\s*steps?\b/);
  if (m) return { domain: 'health', metric_type: 'steps', target_value: numberValue(m[1]), unit: 'steps', period: period || 'daily' };
  m = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/);
  if (m && /\b(sleep|slept)\b/.test(text)) return { domain: 'health', metric_type: 'sleep', target_value: numberValue(m[1]), unit: 'hours', period: period || 'daily' };
  m = text.match(/\b(\d+(?:\.\d+)?)\s*(?:l|liters?)\b/);
  if (m && /\b(water|drink|drank)\b/.test(text)) return { domain: 'health', metric_type: 'water', target_value: numberValue(m[1]), unit: 'liters', period: period || 'daily' };
  return null;
};

const GOAL_PERIOD_AR = { daily: 'يوميًا', weekly: 'أسبوعيًا', monthly: 'شهريًا' };
const GOAL_CUR_AR = { USD: 'دولار', EUR: 'يورو', GBP: 'جنيه', ILS: 'شيكل' };
const goalLabel = (g, ar) => {
  if (g.domain === 'finance') {
    const verb = g.metric_type === 'budget' ? (ar ? 'ميزانية' : 'budget of') : (ar ? 'ادخار' : 'save');
    return ar
      ? `${verb} ${g.target_value} ${GOAL_CUR_AR[g.unit] || g.unit} ${GOAL_PERIOD_AR[g.period]}`
      : `${verb} ${g.unit} ${g.target_value} ${g.period}`;
  }
  const unitAr = { steps: 'خطوة', hours: 'ساعة نوم', liters: 'لتر ماء' }[g.unit] || g.unit;
  return ar
    ? `${g.target_value} ${unitAr} ${GOAL_PERIOD_AR[g.period]}`
    : `${g.target_value} ${g.unit === 'hours' ? 'hours of sleep' : g.unit} ${g.period}`;
};

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

// Native-Arabic mirror of buildContextSummary — get_insight/query_* answers
// must not switch to English mid-conversation for Arabic users.
const buildContextSummaryAr = (context = {}) => {
  const parts = [];
  const goals = Array.isArray(context.active_goals) ? context.active_goals : [];
  const health = context.health || {};
  if (health.mood) parts.push(`متوسط مزاجك ${health.mood.average}/10 من ${health.mood.count} تسجيل`);
  if (health.sleep) parts.push(`متوسط نومك ${health.sleep.average} ساعة`);
  if (health.steps) parts.push(`متوسط خطواتك ${Math.round(health.steps.average)} في اليوم المسجَّل`);
  if (health.water) parts.push(`متوسط شرب الماء ${health.water.average} لتر`);
  const financeEntries = Object.entries(context.finance || {})
    .sort((a, b) => b[1].transactions - a[1].transactions);
  if (financeEntries.length) {
    const [currency, summary] = financeEntries[0];
    parts.push(`إنفاقك خلال ${context.window_days || 30} يومًا هو ${summary.expense} ${GOAL_CUR_AR[currency] || currency} ودخلك ${summary.income}`);
  }
  if (goals.length) parts.push(`لديك ${goals.length} هدف نشط`);
  if (!parts.length) return 'لا أملك سجلات حديثة كافية لعرض اتجاه مخصّص بعد — واصل التسجيل وستظهر الأنماط.';
  return `سياقك الأخير: ${parts.join('؛ ')}.`;
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

// One line of what the assistant remembers, if anything.
const memoryLine = (context) => {
  const summary = context?.memory?.summary;
  return summary ? ` I remember ${summary}.` : '';
};

// Human, specific description of what was just logged.
const describeLogged = (entities) => {
  const parts = entities.map((e) => {
    if (e.domain === 'finance') {
      const label = e.type === 'income' ? 'income' : 'expense';
      const tail = e.description ? ` for ${e.description}` : (e.category ? ` (${e.category})` : '');
      return `${e.currency || 'USD'} ${e.amount} ${label}${tail}`;
    }
    if (e.type === 'sleep') return `${e.value} hours of sleep`;
    if (e.type === 'steps') return `${Number(e.value).toLocaleString()} steps`;
    if (e.type === 'water') return `${e.value} L of water`;
    if (e.type === 'exercise') {
      if (e.value_text) return `${e.value_text} (~${e.value} min)`;
      return `${e.value} minutes of ${e.activity || 'exercise'}`;
    }
    if (e.type === 'mood') return `mood ${e.value}/10`;
    if (e.type === 'heart_rate') return `heart rate ${e.value} bpm`;
    if (e.type === 'nutrition') return e.value ? `${e.value} kcal` : 'a meal';
    return e.activity || e.type;
  });
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
};

// Arabic equivalent of describeLogged — native units, not transliteration.
const describeLoggedAr = (entities) => {
  const cur = (c) => ({ USD: 'دولار', EUR: 'يورو', GBP: 'جنيه', ILS: 'شيكل' }[c] || c || 'دولار');
  const parts = entities.map((e) => {
    if (e.domain === 'finance') {
      const label = e.type === 'income' ? 'دخل' : 'مصروف';
      return `${e.amount} ${cur(e.currency)} ${label}`;
    }
    if (e.type === 'sleep') return `${e.value} ساعات نوم`;
    if (e.type === 'steps') return `${e.value} خطوة`;
    if (e.type === 'water') return `${e.value} لتر ماء`;
    if (e.type === 'exercise') {
      if (e.value_text) return `${e.value_text} (≈${e.value} دقيقة)`;
      return `${e.value} دقيقة ${e.activity ? '' : 'تمرين'}`.trim();
    }
    if (e.type === 'mood') return `المزاج ${e.value}/10`;
    if (e.type === 'heart_rate') return `نبض ${e.value}`;
    if (e.type === 'nutrition') return e.value ? `${e.value} سعرة` : 'وجبة';
    return e.activity || e.type;
  });
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join('، ')} و${parts[parts.length - 1]}`;
};

// Deterministic mood / creative follow-up so every reply feels like a daily
// assistant. If the user just logged a mood, ask something creative instead.
const CREATIVE_NUDGES = [
  "What's one small win you're hoping for today?",
  'Want a quick tip to make tomorrow a little easier?',
  'Anything else you want to plan for the rest of the day?',
  'Want me to check how this fits your weekly goals?',
];
const moodOrCreativeNudge = (entities, message) => {
  const loggedMood = entities.some((entity) => entity.type === 'mood');
  if (!loggedMood) return "By the way, how's your mood today on a 1–10 scale?";
  const idx = (String(message || '').length + entities.length) % CREATIVE_NUDGES.length;
  return CREATIVE_NUDGES[idx];
};

const crossDomainHint = (entities) => {
  const hasFinance = entities.some((e) => e.domain === 'finance' && e.type === 'expense');
  const hasHealth = entities.some((e) => e.domain === 'health');
  if (hasFinance && hasHealth) return ' I linked the health and money sides of this so your insights can spot patterns.';
  if (hasFinance) return ' Tip: small daily expenses add up — want a weekly view?';
  return '';
};

// Smarter on-device "small talk" so the default BERT assistant feels
// conversational, not like a bare classifier. Deterministic + memory-aware.
const GENERAL_PATTERNS = {
  thanks: /\b(thanks|thank you|thx|appreciate(d)?|cheers)\b/i,
  who: /\b(who are you|what are you|your name|are you (a )?(bot|ai|robot))\b/i,
  capabilities: /\b(what can you do|how (do|can) i use|what do you do|your features?|help me (use|with)|how does this work)\b/i,
  howareyou: /\b(how are you|how'?re you|how is it going|how'?s it going|what'?s up|sup)\b/i,
  bye: /\b(bye|goodbye|see you|good ?night|talk later|that'?s all)\b/i,
  positiveMood: /\b(i'?m|i am|feeling|feel)\s+(great|good|fine|ok(ay)?|happy|amazing|fantastic|excellent|relaxed|calm)\b/i,
  negativeMood: /\b(i'?m|i am|feeling|feel)\s+(tired|sad|stressed|anxious|bad|terrible|awful|exhausted|sick|down|low|depressed|overwhelmed|burnt? ?out)\b/i,
};

// Arabic intent cues matched on the RAW message (normalize() strips Arabic).
const AR_GENERAL = {
  thanks: /شكر|متشكر|مشكور|ممنون/,
  who: /من\s*أنت|من\s*انت|ما\s*أنت|اسمك|مين\s*انت/,
  capabilities: /ماذا\s*(?:تفعل|تستطيع)|ما\s*وظيفتك|كيف\s*أستخدم|ماذا\s*يمكنك/,
  bye: /وداع|مع\s*السلامة|إلى\s*اللقاء|الى\s*اللقاء|تصبح\s*على\s*خير|باي/,
  howareyou: /كيف\s*حالك|كيفك|أخبارك|اخبارك|شخبارك|شو\s*أخبارك/,
  negative: /حزين|تعبان|متعب|قلق|مكتئب|سيّئ|سيئ|متوتر|مرهق|زعلان|مضايق/,
  positive: /بخير|سعيد|رائع|ممتاز|جيد|تمام|مبسوط|مرتاح/,
};

const buildArabicGeneral = (message, context = {}) => {
  const raw = String(message || '');
  const name = context?.profile?.name ? ` ${context.profile.name}` : '';
  const health = context?.health || {};
  if (AR_GENERAL.thanks.test(raw)) return `على الرحب والسعة${name}! أتريد تسجيل شيء أو عرض اتجاهات صحتك ومالك لهذا الأسبوع؟`;
  if (AR_GENERAL.who.test(raw)) return `أنا LifeSync — مساعدك اليومي الخاص على جهازك${name}. أتتبّع صحتك ومالك معاً، وأتذكّر ما يهمّك، وأربط بينهما. ماذا تريد أن نفعل؟`;
  if (AR_GENERAL.capabilities.test(raw)) return `أستطيع تسجيل الصحة (خطوات، نوم، مزاج، ماء، تمارين) والمال (دخل/مصروفات) من لغتك الطبيعية، والإجابة عن أسئلتك، ورصد الأنماط بين المجالين (مثل: نوم أقل ← إنفاق أعلى)، وتتبّع أهدافك. جرّب: «مشيت 6000 خطوة» أو «صرفت 12 دولار على الغداء».`;
  if (AR_GENERAL.bye.test(raw)) return `اعتنِ بنفسك${name}! سأُبقي كل شيء جاهزاً للمرة القادمة. حتى تسجيل سريع قبل أن تذهب يفيد تحليلاتك الأسبوعية.`;
  if (AR_GENERAL.negative.test(raw)) {
    const sleepHint = health.sleep?.average && health.sleep.average < 7
      ? ` نومك يبلغ متوسطه ${health.sleep.average} ساعة مؤخراً، وروتين نوم أثبت قد يساعد.` : '';
    return `يؤسفني شعورك بهذا${name}.${sleepHint} أتريد تسجيل مزاجك (1–10) لنتابع النمط؟ القليل من الماء أو مشي قصير أو بعض ضوء النهار قد يساعد.`;
  }
  if (AR_GENERAL.positive.test(raw)) return `يسعدني ذلك${name}! أتريد أن أسجّل مزاجك ليظهر على لوحتك؟ هل فعلت اليوم ما يستحق التتبّع — مشي أو وجبة صحية؟`;
  if (AR_GENERAL.howareyou.test(raw)) return `أنا هنا وجاهز${name}. والأهم — كيف حالك اليوم (1–10)؟ أخبرني عن يومك وسأتتبّع الجانب الصحي والمالي.`;
  const greet = context?.profile?.name ? `مرحباً ${context.profile.name}!` : 'مرحباً!';
  return `${greet} أنا مساعد LifeSync اليومي — أتتبّع صحتك ومالك معاً وأتذكّر ما يهمّك. كيف تشعر اليوم (1–10)، وما الذي تخطّط له؟`;
};

const buildGeneralResponse = (message, context = {}) => {
  if (wantsArabic(message, context)) return buildArabicGeneral(message, context);
  const text = normalize(message);
  const name = context?.profile?.name ? ` ${context.profile.name}` : '';
  const mem = memoryLine(context);
  const health = context?.health || {};

  if (GENERAL_PATTERNS.thanks.test(text)) {
    return `You're welcome${name}! Want me to log something, or show this week's health and money trends?`;
  }
  if (GENERAL_PATTERNS.who.test(text)) {
    return `I'm LifeSync — your private, on-device daily assistant${name}. I track your health and money together, remember what matters to you, and connect the dots between them.${mem} What would you like to do?`;
  }
  if (GENERAL_PATTERNS.capabilities.test(text)) {
    return `Here's what I can do${name}: log health (steps, sleep, mood, water, exercise) and money (income/expenses) from plain language, answer questions about your data, spot cross-domain patterns (e.g. poor sleep → higher spending), and track goals. Try: "walked 6000 steps", "spent $12 on lunch", or "how did I sleep this week?".`;
  }
  if (GENERAL_PATTERNS.bye.test(text)) {
    return `Take care${name}! I'll keep everything ready for next time. Even a quick log before you go helps your weekly insights.`;
  }
  if (GENERAL_PATTERNS.negativeMood.test(text)) {
    const sleepHint = health.sleep?.average && health.sleep.average < 7
      ? ` Your logged sleep is averaging ${health.sleep.average}h — a steadier sleep routine often helps.`
      : '';
    return `I'm sorry you're feeling that way${name}.${sleepHint} Want to log your mood (1–10) so we can watch the pattern? Small steps — water, a short walk, a little daylight — can help.`;
  }
  if (GENERAL_PATTERNS.positiveMood.test(text)) {
    return `Love to hear that${name}! Want me to log your mood so it shows on your dashboard? Anything good you did today worth tracking — a walk, a healthy meal?`;
  }
  if (GENERAL_PATTERNS.howareyou.test(text)) {
    return `I'm here and ready${name}. More importantly — how are you doing today (1–10)? Tell me about your day and I'll keep track of the health and money side.`;
  }

  // Anti-repeat: if we ALREADY asked the mood question last turn and the reply
  // wasn't a recognizable number/feeling, don't parrot the identical greeting.
  if (assistantAskedMood(lastAssistantTurn(context))) {
    return `No rush${name} — even a quick number from 1 to 10 helps me track how you're doing. Or just tell me about your day and I'll note the health and money side.`;
  }

  const greeting = name ? `Hi${name}!` : 'Hi!';
  return `${greeting} I'm your LifeSync daily assistant — I track health and money together and remember what matters to you.${mem} How are you feeling today (1–10), and what's on your plate?`;
};

const buildResponse = (intent, entities, message, context = {}, adviceRequested = false) => {
  const ar = wantsArabic(message, context);
  if (adviceRequested) return buildAdviceResponse(message, context, entities);
  if (intent === 'query_general') {
    return buildGeneralResponse(message, context);
  }
  if (['get_insight', 'query_finance', 'query_health'].includes(intent)) {
    if (ar) return buildContextSummaryAr(context);
    return `${buildContextSummary(context)}${memoryLine(context)}`;
  }
  if (intent === 'set_goal') {
    const goal = extractGoal(message);
    if (goal) {
      return ar
        ? `تم تحديد هدفك: ${goalLabel(goal, true)}. سأتابع تقدّمك وأحسبه ضمن تحليلاتك الأسبوعية.`
        : `Goal set: ${goalLabel(goal, false)}. I'll track your progress and factor it into your weekly insights.`;
    }
    return ar
      ? 'هدف جميل! أخبرني بالرقم المستهدف — مثلًا «أريد أن أدخر ٥٠٠ شيكل شهريًا» أو «هدفي ١٠٠٠٠ خطوة يوميًا» — وسأتتبّعه لك.'
      : `Love that you're setting a goal.${memoryLine(context)} Give me the target — e.g. "save 500 shekels monthly" or "goal: 10000 steps daily" — and I'll track it.`;
  }
  const health = entities.filter((entity) => entity.domain === 'health');
  const finance = entities.filter((entity) => entity.domain === 'finance');
  if (health.length || finance.length) {
    if (ar) {
      const detail = describeLoggedAr(entities);
      const cross = entities.some((e) => e.domain === 'finance' && e.type === 'expense')
        && entities.some((e) => e.domain === 'health')
        ? ' وربطتُ الجانب الصحي بالمالي حتى ترصد التحليلات الأنماط.' : '';
      const nudge = entities.some((e) => e.type === 'mood') ? '' : ' بالمناسبة، كيف مزاجك اليوم من 1 إلى 10؟';
      return `تم — سجّلت ${detail}. حُدِّثت لوحتك للتو.${cross}${nudge}`.replace(/\s+/g, ' ').trim();
    }
    const detail = describeLogged(entities);
    return `Done — logged ${detail}. Your dashboard just refreshed with it.${crossDomainHint(entities)} ${moodOrCreativeNudge(entities, message)}`.replace(/\s+/g, ' ').trim();
  }
  return ar
    ? 'فهمتُ طلبك لكن لم أجد قيمة كاملة لحفظها. أعطني رقماً وما هو، مثل «صرفت 8 دولار على الغداء» أو «مشيت 4000 خطوة».'
    : 'I understood the request, but found no complete record to save. Tell me a number and what it was for, like "spent $8 on lunch" or "walked 4000 steps".';
};

// Sentiment small-talk: "I'm tired", "I'm great today" → log a mood AND reply
// with empathy/encouragement instead of asking for a numeric value.
const FEELING_TRIGGER = /\b(i'?m|i am|im|i feel|feeling|feel)\b/i;
const FEELING_SCORES = [
  [/\b(amazing|fantastic|excellent|wonderful|awesome)\b/, 10],
  [/\b(great|happy|good|nice|well|calm|relaxed)\b/, 8],
  [/\b(ok|okay|alright|fine|meh|neutral)\b/, 5],
  [/\b(tired|sleepy|low|down|bored|drained)\b/, 4],
  [/\b(sad|stressed|anxious|worried|bad|unwell|sick|nervous|upset)\b/, 3],
  [/\b(terrible|awful|exhausted|depressed|miserable|overwhelmed|burnt\s?out)\b/, 2],
];
// Arabic feeling words (matched on the RAW message — normalize() strips Arabic).
const AR_FEELING_TRIGGER = /أنا|أشعر|اشعر|حاسس|مزاجي|اليوم/;
const AR_FEELING_SCORES = [
  [/ممتاز|رائع|مذهل|سعيد جدا/, 10],
  [/سعيد|مبسوط|بخير|مرتاح|جيد|تمام/, 8],
  [/عادي|لا بأس|نص نص/, 5],
  [/متعب|تعبان|مرهق|نعسان|خامل/, 4],
  [/حزين|زعلان|سيّئ|سيئ|قلق|متوتر|مضايق|مهموم/, 3],
  [/مكتئب|محبط|يائس|فظيع|منهار/, 2],
];
const detectFeeling = (message, { expectingMood = false } = {}) => {
  const raw = String(message || '');
  // Arabic sentiment first (e.g. "أنا حزين" → log mood 3), parity with English.
  if (/[؀-ۿ]/.test(raw) && (AR_FEELING_TRIGGER.test(raw) || raw.trim().split(/\s+/).length <= 4)) {
    for (const [re, score] of AR_FEELING_SCORES) {
      const m = raw.match(re);
      if (m) return { score, negative: score <= 4, word: m[0] };
    }
  }
  const text = normalize(message);
  // Normally we ignore digit-bearing text here (numbers are handled by the
  // health extractor). But when the assistant JUST asked for a 1–10 mood
  // rating, a bare number ("4", "a 4", "feeling 4") IS the answer.
  if (!/\d/.test(text)) {
    if (!FEELING_TRIGGER.test(text)) return null;
  } else if (!expectingMood) {
    return null;
  }
  for (const [re, score] of FEELING_SCORES) {
    const m = text.match(re);
    if (m) return { score, negative: score <= 4, word: m[1] };
  }
  return null;
};

// ─── Conversation-aware follow-up memory ───────────────────────────
// The deterministic engine asks questions ("how do you feel 1–10?",
// "by car, by bus, or on foot?"). When the user answers with a short reply
// ("4", "bus"), we must read the PREVIOUS assistant turn to understand it —
// otherwise the same question gets asked again. `context.conversation` is the
// stored history (oldest→newest) WITHOUT the current turn, so its last
// assistant entry is exactly the question we just asked.
const lastAssistantTurn = (context = {}) => {
  const convo = Array.isArray(context.conversation) ? context.conversation : [];
  for (let i = convo.length - 1; i >= 0; i -= 1) {
    if (convo[i] && convo[i].role === 'assistant' && convo[i].content) {
      return String(convo[i].content);
    }
  }
  const recent = Array.isArray(context.recent_messages) ? context.recent_messages : [];
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (recent[i] && recent[i].role === 'assistant' && recent[i].message) {
      return String(recent[i].message);
    }
  }
  return '';
};

const MOOD_QUESTION = /(\(\s*1\s*[–-]\s*10\s*\)|how are you feeling|how'?s your mood|how are you doing today|log your mood|mood\s*\(1\s*[–-]\s*10\)|1\s*[–-]\s*10\s*scale)/i;
const TRANSPORT_QUESTION = /\bby car\b.*\bby bus\b|\bon foot\b|how you travel|how do you (?:get|travel)/i;
const assistantAskedMood = (text) => MOOD_QUESTION.test(normalize(text || ''));
const assistantAskedTransport = (text) => TRANSPORT_QUESTION.test(normalize(text || ''));

// Map a 0–10 score back to a representative feeling word for the ack reply.
const feelingWordFor = (score) => {
  if (score >= 9) return 'amazing';
  if (score >= 7) return 'good';
  if (score >= 5) return 'ok';
  if (score >= 4) return 'low';
  if (score >= 3) return 'stressed';
  return 'terrible';
};

// Recover the outing place from the assistant's prior question text so a bare
// "bus" reply can be resolved without the in-memory clarification record.
const detectOutingFromHistory = (assistantText) => {
  const t = normalize(assistantText || '');
  const m = t.match(/(?:heading to|going to|to)\s+the\s+([a-z ]+?)\?/);
  if (m && m[1]) return { place: prettyPlace(m[1].trim()), modeAlready: false };
  const dest = t.match(OUTING_DEST);
  if (dest) return { place: prettyPlace(dest[1]), modeAlready: false };
  return null;
};

// Is the whole user message essentially just a mood answer?
// Accepts "4", "4/10", "a 4", or a bare feeling word ("tired", "great").
const parseBareMood = (message) => {
  const text = normalize(message);
  const numMatch = text.match(/^(?:a\s+|i'?m\s+(?:a\s+)?|feeling\s+(?:a\s+)?|i\s+feel\s+(?:a\s+)?)?(10|[0-9])(?:\s*\/\s*10)?[.!]?$/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (n >= 0 && n <= 10) return n;
  }
  // Short bare feeling word with no other content.
  if (text.split(/\s+/).length <= 3) {
    for (const [re, score] of FEELING_SCORES) {
      if (re.test(text)) return score;
    }
  }
  return null;
};
const buildFeelingResult = (message, feeling, context, started) => {
  const name = context?.profile?.name ? ` ${context.profile.name}` : '';
  const health = context?.health || {};
  const entity = {
    domain: 'health', activity: 'mood', type: 'mood', value: feeling.score,
    value_text: feeling.word, unit: 'rating', duration: null, category: 'Mood',
  };
  let response;
  if (wantsArabic(message, context)) {
    if (feeling.negative) {
      const sleepHintAr = health.sleep?.average && health.sleep.average < 7
        ? ` نومك يبلغ متوسطه ${health.sleep.average} ساعة مؤخراً، وهذا قد يستنزف طاقتك.` : '';
      response = `يؤسفني شعورك بهذا${name} — سجّلت مزاجك ${feeling.score}/10.${sleepHintAr} القليل من الماء أو مشي قصير أو بعض ضوء النهار قد يساعد. أتريد أن نتحدّث عن يومك؟`;
    } else {
      response = `سعيد لأنك بخير${name}! سجّلت مزاجك ${feeling.score}/10. هل هناك ما يستحق التتبّع اليوم — مشي أو وجبة صحية أو بعض الادخار؟`;
    }
  } else if (feeling.negative) {
    const sleepHint = health.sleep?.average && health.sleep.average < 7
      ? ` Your sleep is averaging ${health.sleep.average}h lately, which can drag energy down.`
      : '';
    response = `Sorry you're feeling that way${name} — I've noted your mood as ${feeling.score}/10.${sleepHint} A little water, a short walk, or some daylight can help. Want to talk through your day?`;
  } else {
    response = `Glad you're feeling good${name}! Logged your mood as ${feeling.score}/10. Anything worth tracking today — a walk, a healthy meal, or some savings?`;
  }
  return {
    success: true,
    intent: 'log_health',
    candidate_intent: 'log_health',
    domain: 'health',
    entities: [entity],
    response,
    is_cross_domain: false,
    needs_clarification: false,
    clarification_question: null,
    clarification_options: null,
    confidence: 0.7,
    processing_time_ms: Date.now() - started,
    original_message: message,
    model_runtime: {
      status: 'ready', provider: 'bert_local',
      model: process.env.BERT_MODEL_NAME || 'bert_best_model_10pct',
      feature: 'sentiment', routed_label: 'log_mood',
    },
  };
};

const parseMessageWithBert = async (message, pendingClarification = null, context = {}) => {
  const started = Date.now();

  // If the user clearly started a NEW loggable statement (e.g. "earned $500
  // from freelance") instead of answering, abandon the stale clarification so
  // it isn't mistakenly consumed as the answer.
  if (pendingClarification) {
    const fresh = normalize(message);
    const isOption = (pendingClarification.clarificationOptions || [])
      .some((opt) => normalize(opt) === fresh);
    if (!isOption && (HEALTH_LOG_EVENT.test(fresh) || FINANCE_LOG_EVENT.test(fresh))) {
      pendingClarification = null;
    }
  }

  const original = pendingClarification?.originalMessage || message;
  const forcedLabel = pendingClarification ? forcedLabelFromAnswer(message) : null;
  // Answering a clarification: extraction must see BOTH turns — the amount
  // lives in the original message, the purpose in the answer ("صرفت ٢٥ شيكل"
  // then «طعام»). Joined with "on" so the purpose/category regexes parse it.
  const extractionText = pendingClarification ? `${original} on ${message}` : original;

  // Cross-domain daily-assistant follow-up: an everyday plan ("going to town")
  // becomes a question about HOW the user travels, then links the answer to
  // finance (cost) and health (movement).
  const outing = detectOuting(original);
  if (outing && !ADVICE_SIGNAL.test(original)) {
    if (pendingClarification) {
      const mode = transportModeFromText(message);
      if (mode) return buildOutingResolution(original, outing, mode, context, started);
    } else if (outing.modeAlready) {
      const mode = transportModeFromText(original);
      if (mode) return buildOutingResolution(original, outing, mode, context, started);
    } else {
      return buildOutingClarification(original, outing, started);
    }
  }

  // Conversation-aware follow-up: interpret a SHORT reply against the question
  // the assistant just asked, so we never ask the same thing twice.
  if (!pendingClarification && !FINANCE_SIGNAL.test(original) && !HEALTH_LOG_EVENT.test(original)) {
    const lastAsst = lastAssistantTurn(context);
    const expectingMood = assistantAskedMood(lastAsst);

    // (a) We just asked "how do you feel (1–10)?" and they sent a bare number.
    if (expectingMood) {
      const score = parseBareMood(original);
      if (score !== null) {
        const feeling = { score, negative: score <= 4, word: feelingWordFor(score) };
        return buildFeelingResult(original, feeling, context, started);
      }
    }

    // (b) We just asked the outing transport question; a bare "bus"/"car"/"walk"
    //     resolves it into a cross-domain log instead of being forgotten.
    if (assistantAskedTransport(lastAsst)) {
      const mode = transportModeFromText(original);
      const outing = detectOutingFromHistory(lastAsst);
      if (mode && outing) return buildOutingResolution(original, outing, mode, context, started);
    }

    // (c) Sentiment small-talk ("I'm tired", "I'm great today") → log mood.
    //     When a mood was just requested, also accept digit-bearing phrasings.
    const feeling = detectFeeling(original, { expectingMood });
    if (feeling) return buildFeelingResult(original, feeling, context, started);
  }

  let classification;
  let runtimeError = null;
  try {
    classification = await classifyText(pendingClarification ? `${original} ${message}` : message);
  } catch (error) {
    runtimeError = error.message;
    classification = { label: detectRuleLabel(original) || 'general_chat', confidence: 0.5, provider: 'fallback', latency_ms: null };
  }

  // Normalized copy (Arabic → English tokens) for the inline signal tests below
  // so cross-domain/event detection works on native-Arabic input too.
  const normOriginal = normalize(original);
  const ruleLabel = detectRuleLabel(original);
  const adviceRequested = ADVICE_SIGNAL.test(normOriginal);
  const hasHealthEvent = HEALTH_LOG_EVENT.test(normOriginal);
  const hasFinanceEvent = FINANCE_LOG_EVENT.test(normOriginal);
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
    // Match on normalized text so Arabic ("كم أنفقت" → "how much did i spend")
    // gets the same EN intent routing as the English phrasing.
    const asksFinance = /\b(spend|spent|expense|income|budget|finance|money|transaction|how much did i spend)\b/i.test(normOriginal);
    const asksHealth = /\b(health|sleep|steps|mood|water|exercise|heart\s*rate|calories)\b/i.test(normOriginal);
    if (asksFinance && !asksHealth) candidateIntent = 'query_finance';
    else if (asksHealth && !asksFinance) candidateIntent = 'query_health';
  }
  const allowBareFinance = Boolean(forcedLabel)
    || (routedLabel === 'log_expense' && FINANCE_SIGNAL.test(original));
  const allowBareExercise = forcedLabel === 'log_health' || forcedLabel === 'log_both';

  let entities = [];
  if (['log_expense', 'log_both'].includes(routedLabel)) {
    entities.push(...extractFinanceEntities(extractionText, {
      allowBareAmount: allowBareFinance || routedLabel === 'log_both',
    }));
  }
  if (['log_health', 'log_both'].includes(routedLabel)) {
    entities.push(...extractHealth(extractionText, { allowBareExercise }));
  }

  let clarificationResult = null;
  // Bilingual clarifications: ask in the user's language (native Arabic, not a
  // translation). The Arabic answer options resolve back through normalize().
  const arq = wantsArabic(original, context);
  const clar = (enQ, enOpts, arQ, arOpts) => clarification(arq ? arQ : enQ, arq ? arOpts : enOpts);
  const curAr = (c) => ({ USD: 'دولار', EUR: 'يورو', GBP: 'جنيه', ILS: 'شيكل' }[c] || c || 'دولار');
  const ambiguousGym = /\b\d+(?:\.\d+)?\s+for\s+(?:the\s+)?gym\b/i.test(original) && !forcedLabel;
  if (ambiguousGym && !adviceRequested) {
    clarificationResult = clar(
      'Should I log this as a gym expense, exercise minutes, or both?',
      ['Gym expense', 'Exercise minutes', 'Both'],
      'أسجّلها كمصروف نادٍ، أم دقائق تمرين، أم كليهما؟',
      ['مصروف نادٍ', 'دقائق تمرين', 'كليهما']
    );
  } else if (!adviceRequested && routedLabel === 'log_expense' && !entities.some((entity) => entity.domain === 'finance')) {
    clarificationResult = clar('What amount should I log?', ['Add an amount', 'Cancel'], 'ما المبلغ الذي أسجّله؟', ['أضف مبلغاً', 'إلغاء']);
  } else if (!adviceRequested && routedLabel === 'log_expense' && !forcedLabel) {
    const finance = entities.find((entity) => entity.domain === 'finance');
    if (finance && !finance.description && !/\b(income|salary|earned|received)\b/i.test(original)) {
      clarificationResult = clar(
        `What was the ${finance.currency} ${finance.amount} for?`,
        ['Food', 'Transport', 'Shopping', 'Other'],
        `علامَ صرفت ${finance.amount} ${curAr(finance.currency)}؟`,
        ['طعام', 'مواصلات', 'تسوّق', 'أخرى']
      );
    }
  } else if (!adviceRequested && routedLabel === 'log_health' && entities.length === 0) {
    clarificationResult = clar(
      'What value should I record—for example duration, steps, hours, liters, or a mood rating?',
      ['Add duration', 'Add steps', 'Add health value'],
      'ما القيمة التي أسجّلها؟ مثل المدة أو الخطوات أو الساعات أو اللترات أو تقييم المزاج.',
      ['أضف مدة', 'أضف خطوات', 'أضف قيمة صحية']
    );
  } else if (!adviceRequested && routedLabel === 'log_both') {
    let hasHealth = entities.some((entity) => entity.domain === 'health');
    const financeEntity = entities.find((entity) => entity.domain === 'finance');
    // "$50 on a healthy dinner" → finance expense + a meal presence log.
    // unit "meal" (value 1) = qualitative presence, NOT 0 kcal (which polluted charts/links).
    if (!hasHealth && financeEntity && FOOD_CONTEXT.test(normOriginal)) {
      entities.push({
        domain: 'health',
        activity: 'nutrition',
        type: 'nutrition',
        value: 1,
        value_text: financeEntity.description || financeEntity.activity || 'meal',
        unit: 'meal',
        duration: null,
        category: 'Nutrition',
      });
      hasHealth = true;
    }
    if (!hasHealth || !financeEntity) {
      clarificationResult = clar(
        'I need both a measurable health value and a financial amount. What is missing?',
        ['Add health value', 'Add financial amount', 'Log one domain only'],
        'أحتاج قيمة صحية قابلة للقياس ومبلغاً مالياً. ما الناقص؟',
        ['أضف قيمة صحية', 'أضف مبلغاً', 'سجّل مجالاً واحداً']
      );
    }
  }

  const needsClarification = Boolean(clarificationResult);
  if (needsClarification) entities = [];
  const intent = needsClarification ? 'unclear' : candidateIntent;
  // Persisted by chatController as a UserGoal row — the reply promises tracking.
  const goalSpec = intent === 'set_goal' ? extractGoal(original) : null;
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
    // True cross-domain = both health AND finance entities on this turn.
    // Advice-only "both" is domain-level, not a linked log pair.
    is_cross_domain: entities.some((e) => e.domain === 'health')
      && entities.some((e) => e.domain === 'finance'),
    needs_clarification: needsClarification,
    clarification_question: clarificationResult?.clarification_question || null,
    clarification_options: clarificationResult?.clarification_options || null,
    confidence,
    processing_time_ms: Date.now() - started,
    original_message: original,
    ...(goalSpec ? { _goal: goalSpec } : {}),
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
  _extractGoal: extractGoal,
  _detectOuting: detectOuting,
  _transportModeFromText: transportModeFromText,
  _buildResponse: buildResponse,
};
