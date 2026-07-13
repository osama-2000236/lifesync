// server/services/ai/conversationService.js
// ============================================
// Conversation Service (Track B)
// ============================================
// Generates the conversational reply with the user's SELECTED model
// (Gemma / OpenAI / Anthropic / custom), given the full multi-turn history +
// LifeSync context + memory + what the deterministic extractor (Track A) just
// logged. Logging is NOT decided here — that keeps every model reliable and
// makes switching models mid-conversation seamless (only the responder changes;
// history + memory come from the app DB).
// ============================================

const { generateChat, generateChatStream } = require('./providerClient');
const { _buildContextSummary: buildContextSummary } = require('./bertNlpService');
const {
  coverageFromContext,
  formatCoverageLine,
  isSameUtcDay,
} = require('./sameDayCoverage');
const { weekMonthSkip } = require('./longHorizon');

// OpenRouter :free pools are shared and transiently unhealthy — they signal
// "busy" as 429 AND as 503/502, request timeouts, dropped sockets, or an empty
// completion body. We may RETRY the same user-picked model; we never swap to a
// different model (that would lie about the picker label).
const isRetryableError = (err) => {
  // providerClient classifies its own errors (toProviderError, stall watchdog)
  // and marks them retryable — honor that flag first. Without this, a pre-token
  // stream stall ("stream stalled — no tokens for 12s", retryable:true) failed
  // the message regex and hard-stopped a turn a same-slug retry would save.
  if (err?.retryable === true) return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return /\b(429|500|502|503|408|409|522|524|529)\b/.test(msg)
    || msg.includes('rate limit') || msg.includes('rate-limit')
    || msg.includes('timeout') || msg.includes('timed out')
    || msg.includes('econnreset') || msg.includes('econnaborted') || msg.includes('socket hang up')
    || msg.includes('overloaded') || msg.includes('busy')
    || msg.includes('empty response') || msg.includes('empty streamed');
};

const isFreeSlug = (slug) => String(slug || '').includes(':free');

/**
 * Honest picker: the model the user picked is the ONLY model we call.
 * Never hop Gemma → gpt-oss or free → paid — that made the label a lie.
 * Same-slug retries only (free-pool 429 flap); then surface an error.
 */
const modelCandidates = (model) => (model ? [model] : []);

// :free pools flap second-by-second — retry the SAME slug a couple times before
// failing honestly. Env-tunable; passes=1 disables retry.
const freePoolPasses = () => Math.max(1, parseInt(process.env.FREE_POOL_PASSES, 10) || 2);
const freePoolRetryMs = () => {
  const n = parseInt(process.env.FREE_POOL_RETRY_MS, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 600;
};
// Wall-clock cap across ALL retry passes for one turn — voice cannot sit
// "thinking" for minutes while free attempts serially time out. When the
// budget is spent, remaining passes are skipped and the turn fails honestly.
const freeRetryBudgetMs = () => {
  const n = parseInt(process.env.FREE_RETRY_BUDGET_MS, 10);
  return Number.isFinite(n) ? Math.max(0, n) : 45_000;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Per-picked-model knobs (same harness, different capacity).
 * Free OpenRouter slugs flap and ramble under long outputs — tighter budget.
 */
const genParamsForModel = (modelSlug) => {
  const free = String(modelSlug || '').includes(':free');
  return { free, temperature: free ? 0.3 : 0.4, maxTokens: free ? 800 : 1200 };
};

const describeLoggedFacts = (entities = []) => {
  if (!Array.isArray(entities) || entities.length === 0) return '';
  const parts = entities.map((e) => {
    if (e.domain === 'finance') {
      return `${e.currency || 'USD'} ${e.amount} ${e.type === 'income' ? 'income' : 'expense'}${e.description ? ` for ${e.description}` : ''}`;
    }
    if (e.type === 'mood') return `mood ${e.value}/10`;
    if (e.type === 'sleep') return `${e.value} hours of sleep`;
    if (e.type === 'steps') return `${e.value} steps`;
    if (e.type === 'water') return `${e.value} L water`;
    if (e.type === 'exercise') return `${e.value} min ${e.activity || 'exercise'}`;
    if (e.type === 'heart_rate') return `heart rate ${e.value} bpm`;
    if (e.type === 'nutrition') {
      // unit "meal" is qualitative presence (food expense XD), not kcal.
      if (e.unit === 'meal' || e.value_text) return e.value_text || 'a meal';
      return e.value ? `${e.value} kcal` : 'a meal';
    }
    return e.activity || e.type;
  });
  return parts.join(', ');
};

/** Language directive: native, not translated. Real-time switch: THIS turn's
 *  language wins even when earlier history was the other language. */
const buildLanguageDirective = (locale) => {
  const lc = String(locale || '').toLowerCase();
  // Free/open models drift into Chinese or stick to the previous turn's language —
  // lock hard and restate after the history is in view.
  if (lc.startsWith('ar')) {
    return [
      'LANGUAGE LOCK (THIS TURN): The user\'s latest message is in Arabic.',
      'Reply ENTIRELY in fluent, natural Modern Standard Arabic (فصحى) — native phrasing, not literal translationese.',
      'Do NOT reply in English even if earlier messages in this chat were English.',
      'Do NOT use Chinese or any third language. Proper nouns and numerals may stay as-is.',
      'Units and currency stay natural in Arabic.',
    ].join(' ');
  }
  if (lc.startsWith('en')) {
    return [
      'LANGUAGE LOCK (THIS TURN): The user\'s latest message is in English.',
      'Reply ENTIRELY in English. Match the user\'s tone.',
      'Do NOT reply in Arabic even if earlier messages in this chat were Arabic.',
      'Do NOT use Chinese or any third language under any circumstances.',
    ].join(' ');
  }
  return 'LANGUAGE: Reply in the SAME language as the user\'s latest message — Arabic → natural Modern Standard Arabic, English → English. Never switch to a third language such as Chinese. Ignore the language of earlier turns if it differs.';
};

/**
 * Gaps for digger — ONLY metrics NOT already logged today (UTC day).
 * Code-enforced: mood 3/10 today → mood never appears in DATA GAPS today.
 * @param {object} context
 * @param {Date} [now]
 * @param {{ health: Set, finance: Set }} [today] precomputed coverage
 */
const buildDataGaps = (context = {}, now = new Date(), today = null) => {
  const cov = today || coverageFromContext(context, now);
  const cadence = weekMonthSkip(context.horizon || {});
  const last = context.horizon?.last_days_ago || {};
  const healthGaps = [];
  const financeGaps = [];
  const rf = context.recent_finance_entries || [];

  // Daily metrics: skip if logged today. Prefer re-engage if last log is 3+ days stale.
  if (!cov.health.has('sleep')) {
    healthGaps.push(last.sleep != null && last.sleep >= 3
      ? `sleep hours (last logged ${last.sleep}d ago)`
      : 'sleep hours');
  }
  if (!cov.health.has('mood')) {
    healthGaps.push(last.mood != null && last.mood >= 2
      ? `mood 1-10 (last logged ${last.mood}d ago)`
      : 'mood 1-10');
  }
  if (!cov.health.has('steps') && !cov.health.has('exercise')) {
    healthGaps.push('steps or exercise');
  }
  if (!cov.health.has('water')) healthGaps.push('water');

  // Expense: not today → dig; if today missing purpose → purpose only.
  if (!cov.finance.has('expense')) {
    financeGaps.push(last.expense != null && last.expense >= 3
      ? `expense amount + what for (quiet ${last.expense}d)`
      : 'expense amount + what for (e.g. coffee, bus, food)');
  } else {
    const todayExp = rf.filter((r) => r?.type === 'expense' && isSameUtcDay(r.logged_at, now));
    if (todayExp.length && !todayExp.some((r) => r.description || r.category)) {
      financeGaps.push("what today's spends were for (category/purpose)");
    }
  }
  // Income: weekly cadence — do not re-dig income if already logged this week.
  if (!cov.finance.has('income') && !cadence.skipIncomeWeek) {
    financeGaps.push('income or salary amount (this week)');
  }

  const fGoals = (context.active_goals || []).filter(
    (g) => g.domain === 'finance' || /budget|save|spend|money/i.test(String(g.metric || '')),
  );
  if (!fGoals.length && !cadence.skipBudgetMonth) {
    financeGaps.push('budget or savings target');
  }

  // Second-mind digs: trend follow-ups instead of raw re-collection when data is
  // rich. Cite the REAL numbers so the model asks "spend +67% WoW (200 vs 120) —
  // what drove it" instead of a generic "log more".
  const trendGaps = [];
  const w = context.horizon?.week;
  if (w?.expense_trend === 'up' && w.expense_delta_pct > 15 && cov.finance.has('expense')) {
    trendGaps.push(`spend up ${w.expense_delta_pct}% WoW (${w.expense_total} vs ${w.expense_prev}) — what drove it (second mind)`);
  }
  if (w?.sleep_trend === 'down' && w.sleep_avg != null && w.sleep_avg < 7) {
    trendGaps.push(`sleep avg ${w.sleep_avg}h, down ${Math.abs(w.sleep_delta_pct ?? 0)}% WoW — what changed at night (second mind)`);
  }

  // Trend digs FIRST: they only exist on strong deltas and are the second-mind
  // differentiator — raw re-collection must not push them past the cap below.
  const out = [...trendGaps];
  // Interleave the FULL lists (health can hold 4: sleep/mood/steps/water) —
  // the slice(0, 7) below is the only cap, so no gap is silently unreachable.
  const rounds = Math.max(healthGaps.length, financeGaps.length);
  for (let i = 0; i < rounds; i += 1) {
    if (healthGaps[i]) out.push(healthGaps[i]);
    if (financeGaps[i]) out.push(financeGaps[i]);
  }
  if (!(context.memory?.count > 0) && !context.memory?.summary) out.push('name or daily routine');
  if (!context.active_goals?.length) out.push('a simple health or money goal');
  return [...new Set(out)].slice(0, 7);
};

/** System prompt: full data access + curious digger + dashboard logging contract. */
const buildSystemPrompt = (context = {}, loggedEntities = [], locale = null, modelSlug = null, ambiguity = null) => {
  // Privacy boundary: the user's name/username never enter the cloud prompt.
  // Personalized greetings stay in the local deterministic replies
  // (bertNlpService), which never leave the server.
  const memory = context?.memory?.summary;
  const resolvedLocale = locale || context?.locale || null;
  // Locale-aware data picture so AR turns get Arabic fact lines (clearer grounding).
  const summary = buildContextSummary(context, resolvedLocale);
  const logged = describeLoggedFacts(loggedEntities);
  const memCount = Number(context?.memory?.count) || 0;
  const win = context?.context_window;
  const winHint = win?.mode
    ? `Context window: ${win.mode} (~${win.days || '?'} days, ${win.messages || '?'} chat turns, ${win.entries || '?'} log rows, ${win.links || 0} XD links).`
    : '';
  const counts = context?.source_counts;
  const countHint = counts
    ? `Loaded for this reply: ${counts.messages || 0} prior messages, ${counts.health_logs || 0} health logs, ${counts.finance_logs || 0} finance logs, ${counts.goals || 0} goals, ${counts.linked_domains || 0} linked health↔money pairs.`
    : '';
  const nLinks = Array.isArray(context?.linked_domains) ? context.linked_domains.length : 0;
  // Same-day coverage includes this turn's entities so we never re-ask mood just logged.
  const today = coverageFromContext({
    ...context,
    this_turn_entities: loggedEntities,
  });
  const gaps = buildDataGaps({ ...context, this_turn_entities: loggedEntities }, new Date(), today);
  const loggedTodayLine = formatCoverageLine(today);
  const { free } = genParamsForModel(modelSlug);
  // Free models get one dig — 7 gap options is noise. Trends are already first.
  const shownGaps = free ? gaps.slice(0, 4) : gaps;
  const gapHint = shownGaps.length
    ? `DATA GAPS (only metrics NOT logged today — dig here): ${shownGaps.join('; ')}.`
    : 'DATA GAPS: all core metrics already logged today — dig deeper on patterns or cross-domain links using numbers you already have; do not re-ask today\'s values.';
  const digBudget = free ? 'ONE dig question' : '1–2 dig questions';

  return [
    'You are LifeSync — a warm, curious personal daily assistant for health, money, mood, and everyday planning. You speak with the user (voice or chat) as someone who already knows their dashboard.',
    // Honest engine identity: each picked model must feel (and be) different.
    modelSlug ? `You are currently powered by the "${modelSlug}" model. If the user asks which AI model you run on, tell them this honestly.` : '',
    // Free-tier capacity: same harness, tighter delivery so :free models stay coherent.
    free
      ? 'MODEL CAPACITY (free): Keep 2–4 short sentences. Obey LANGUAGE LOCK strictly. Cite at most 2 numbers from the data. One dig question max. No lists unless asked.'
      : 'MODEL CAPACITY (paid/standard): You may use 2–5 sentences and up to two dig questions; still prefer concrete numbers from the data over generalities.',
    // Memory is model-agnostic — switching models keeps the same remembered facts + chat history.
    'MEMORY TRANSFER: User memories and history live in LifeSync, not in the model. The same session stays on one model for a consistent voice; a new chat may use another model and still has full memory — never claim amnesia because the engine changed.',
    'REAL-TIME LANGUAGE: Only Arabic or English. Match THIS turn\'s language even if earlier turns differ. Digit-only follow-ups keep the previous turn\'s language.',
    buildLanguageDirective(resolvedLocale),
    'Speak like a warm, normal person who tracks the user\'s health and money — natural everyday Arabic (فصحى عصرية واضحة) or natural everyday English, never stiff translationese or robotic lists unless asked.',
    'Keep replies short (2–5 sentences) unless asked for detail. Output ONLY your final reply — never show reasoning or a "thinking process".',
    // Direct data access contract (Track A logger + this context = dashboard truth).
    'DASHBOARD ACCESS: You have direct access to the user\'s real LifeSync data below (health logs, finance logs, goals, memory, linked health↔money pairs, chat history). Cite exact numbers from that data. Never invent logs, amounts, or stats.',
    'LOGGING: When the user states health OR money facts, the app AUTOMATICALLY logs them to the dashboard. Health: sleep hours, mood 1-10, steps, water, exercise. Money: expense/income amounts + purpose (spent 20 on coffee, earned 500 salary). Invite BOTH domains. After something is logged this turn, acknowledge it. Never claim you logged something the app did not log.',
    `CURIOUS DIGGER: Equal curiosity for health AND finance. Ask ${digBudget} ONLY from DATA GAPS. Never re-ask LOGGED_TODAY metrics (if mood is already 3/10 today, do not ask mood again). Cite today's values if relevant instead of re-collecting them. Warm, not an interrogation.`,
    'FINANCE HARNESS: Treat money with the same depth as health. Cite spend totals, income, net, avg expense, and top spend categories from data when present. Dig for amount + purpose only when expense is not LOGGED_TODAY.',
    'NO RE-ASK RULE: If a metric appears in LOGGED_TODAY, you already have it for this calendar day — reference it, do not ask the user for it again. Prefer week/month TREND questions over re-collecting the same number.',
    'SECOND MIND: Act like a companion who has tracked this user for months/years. Use LONG-HORIZON trends (week vs prior week, month spend, streaks). Notice shifts (sleep down + spend up). Celebrate log streaks. Cross-domain logging should feel automatic — invite one concrete log that completes a pattern, not a form.',
    memory ? `What you remember about the user (${memCount || 'some'} facts): ${memory}.` : '',
    winHint,
    countHint,
    // No standalone LONG-HORIZON line: the data picture below already ends with
    // the same trends (buildContextSummary appends formatHorizonLine) — saying
    // the numbers twice was pure token bloat for free models.
    summary ? `The user's LifeSync data (dashboard truth — use exact numbers, never invent): ${summary}` : '',
    loggedTodayLine
      ? `LOGGED_TODAY (do NOT re-ask): ${loggedTodayLine}.`
      : 'LOGGED_TODAY: (none yet today).',
    gapHint,
    logged ? `IMPORTANT: this turn the app already logged to the database (dashboard will show it): ${logged}. Acknowledge it naturally; do not claim to log anything else.` : '',
    ambiguity ? `The app's logger found this message ambiguous and did NOT log anything (it wanted to ask: "${ambiguity}"). If the user really is reporting health/finance data, weave ONE natural clarifying question into your reply so they give a loggable number; if they are just chatting, answer normally.` : '',
    'Never invent numbers or facts. Do not diagnose medical conditions or promise financial outcomes.',
    // Max XD harness: prefer stored LinkedDomain pairs; else soft co-presence.
    nLinks > 0
      ? `CROSS-DOMAIN HARNESS (MAX): ${nLinks} stored health↔money link(s) are in the data picture (LINKED lines). Prefer those real links. (1) Cite one linked pair with numbers, (2) one small action, (3) ${digBudget}. Never invent a link that is not in the data.`
      : `CROSS-DOMAIN HARNESS: Health and money are one life. When both domains appear in data or this turn, (1) name the link with numbers from the data, (2) one small action, (3) ${digBudget} filling gaps or inviting a loggable follow-up. Never invent a link without data.`,
    // Restate at the end — last instruction wins for many small models.
    buildLanguageDirective(resolvedLocale),
  ].filter(Boolean).join('\n');
};

// Some local models (e.g. reasoning Gemma builds) emit their chain-of-thought
// before the answer. Keep only the final reply so the chat stays clean.
const stripReasoning = (raw) => {
  let t = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const head = t.slice(0, 400).toLowerCase();
  if (/(thinking process|drafting iteration|final output|let me (think|analyze)|step-by-step)/.test(head)) {
    // Prefer text after an explicit "final ..." marker, else the last paragraph.
    const afterMarker = t.split(/final (?:output|answer|response)[^\n:]*:?/i).pop();
    const paragraphs = t.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    let candidate = (afterMarker && afterMarker.length < t.length) ? afterMarker : paragraphs[paragraphs.length - 1];
    candidate = String(candidate || '').replace(/^\d+\.\s*/, '').replace(/^[*>\-\s"]+|["\s]+$/g, '').trim();
    if (candidate && candidate.length > 8) return candidate;
  }
  return t;
};

// Cap the injected context before any cloud call (~6k tokens ≈ 24k chars).
// Oldest history is dropped first; memory.summary is never touched —
// remembering the user is the product, stale small talk is not.
// Binary-search how many oldest turns to drop → O(log n) stringifies instead of
// O(n) shifts each re-measuring the full payload (was quadratic on long threads).
const contextCharBudget = () => parseInt(process.env.CHAT_CONTEXT_CHAR_BUDGET, 10) || 24_000;
const MIN_HISTORY_TURNS = 4;
const contextSize = (ctx) => {
  try {
    return JSON.stringify(ctx).length;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
};
const capContextBudget = (context = {}) => {
  const budget = contextCharBudget();
  if (contextSize(context) <= budget) return context;

  const conversation = Array.isArray(context.conversation) ? context.conversation : [];
  const base = { ...context };
  const maxDrop = Math.max(0, conversation.length - MIN_HISTORY_TURNS);

  // Binary search: smallest drop count that fits under budget (keep max history).
  let lo = 0;
  let hi = maxDrop;
  let bestDrop = maxDrop;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const trial = { ...base, conversation: conversation.slice(mid) };
    if (contextSize(trial) <= budget) {
      bestDrop = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }

  const capped = {
    ...base,
    conversation: conversation.slice(bestDrop),
  };

  // Rare: still over with minimal history — thin dense row arrays (newest kept).
  // Memory is never dropped.
  for (const key of ['recent_messages', 'recent_health_entries', 'recent_finance_entries', 'linked_domains']) {
    if (contextSize(capped) <= budget) break;
    if (!Array.isArray(capped[key]) || capped[key].length <= 6) continue;
    // recent_messages is oldest→newest; the row arrays are newest-first.
    capped[key] = key === 'recent_messages' ? capped[key].slice(-6) : capped[key].slice(0, 6);
  }
  return capped;
};

/** Map prior turns + the current message into a provider-agnostic messages array.
 *  History is already windowed by buildBertContext (standard/deep/max up to 120).
 *  Hard-cap 120 — do NOT re-shrink or voice/chat max harness loses turns. */
const HISTORY_HARD_CAP = 120;
const buildMessages = (conversation = [], currentMessage, locale = null) => {
  const history = (Array.isArray(conversation) ? conversation : [])
    .filter((m) => m && m.content && (m.role === 'user' || m.role === 'assistant'))
    .slice(-HISTORY_HARD_CAP);
  // Soft prefix on the LAST user turn only (not stored history) — free models
  // obey the final user line more reliably than system alone. AR|EN only.
  const lc = String(locale || '').toLowerCase();
  let content = String(currentMessage || '');
  if (lc.startsWith('ar')) content = `أجب بالعربية فقط (هذا الدور).\n${content}`;
  else if (lc.startsWith('en')) content = `Reply in English only (this turn).\n${content}`;
  return [...history, { role: 'user', content }];
};

/**
 * Generate the assistant reply with the selected generative model.
 * Returns the prose string, or null on failure (caller falls back to the
 * deterministic reply so a missing API key / offline model never breaks chat).
 */
const generateAssistantReply = async ({ provider, model, context = {}, loggedEntities = [], message, locale = null, ambiguity = null }) => {
  context = capContextBudget(context);
  const messages = buildMessages(context.conversation, message, locale);
  // Always the user-picked slug only (no cross-model hop).
  const candidates = provider === 'openrouter' ? modelCandidates(model) : [model];
  const passes = provider === 'openrouter' ? freePoolPasses() : 1;
  let lastError = null;
  // Ops diagnostics: upstream call count + wall time (free-pool retries visible).
  const startedAt = Date.now();
  let attempts = 0;
  const diag = () => ({ attempts, latency_ms: Date.now() - startedAt });
  for (let pass = 0; pass < passes; pass++) {
    for (const candidate of candidates) {
      try {
        const system = buildSystemPrompt(context, loggedEntities, locale, candidate, ambiguity);
        const { temperature, maxTokens } = genParamsForModel(candidate);
        attempts += 1;
        const result = await generateChat({
          system,
          messages,
          providerOverride: provider,
          model: candidate,
          temperature,
          maxTokens,
        });
        const text = stripReasoning(result?.text).trim();
        // Report the slug we requested (picker honesty), not a provider alias.
        if (text) return { text, provider: result.provider, model: candidate, path: 'nonstream', ...diag() };
        lastError = new Error(`empty response from ${candidate}`);
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error)) return { error: lastError.message, ...diag() };
      }
    }
    // Whole pass failed on transient errors — retry same slug after a short
    // wait, but never past the wall-clock budget (voice cannot hang for minutes).
    if (Date.now() - startedAt >= freeRetryBudgetMs()) break;
    if (pass < passes - 1) await sleep(freePoolRetryMs());
  }
  return { error: lastError?.message || 'generation failed', ...diag() };
};

// Streaming variant of stripReasoning: swallows a leading <think>...</think>
// block across chunk boundaries, then passes everything after it straight
// through. (The non-streaming heuristic for malformed local models is skipped
// here — it needs the full text to detect, which defeats the point of streaming.)
const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';
// If a reasoning block never closes (truncated/broken model output), stop
// waiting after this many buffered chars and surface what's left — silently
// swallowing the whole reply forever is worse than showing raw reasoning text.
const MAX_THINK_BUFFER = 4000;
const makeReasoningFilter = (onChunk) => {
  let raw = '';
  let decided = false;
  let inThink = false;

  return (delta) => {
    if (decided) { onChunk(delta); return; }
    raw += delta;
    const trimmedStart = raw.replace(/^\s+/, '');

    if (!inThink && trimmedStart.startsWith(THINK_OPEN)) {
      inThink = true;
      raw = trimmedStart.slice(THINK_OPEN.length);
    }

    if (inThink) {
      const closeIdx = raw.indexOf(THINK_CLOSE);
      if (closeIdx !== -1) {
        const after = raw.slice(closeIdx + THINK_CLOSE.length);
        inThink = false;
        decided = true;
        raw = '';
        if (after) onChunk(after);
      } else if (raw.length > MAX_THINK_BUFFER) {
        // Reasoning block never closed within budget — stop swallowing and
        // surface what's buffered so the caller isn't met with dead air,
        // whether the overflow arrived in one chunk or many.
        decided = true;
        const flushed = raw;
        raw = '';
        onChunk(flushed);
      }
      return;
    }

    if (THINK_OPEN.startsWith(trimmedStart) && trimmedStart.length < THINK_OPEN.length) {
      return; // ambiguous prefix — wait for more characters before deciding
    }

    decided = true;
    const flushed = raw;
    raw = '';
    if (flushed) onChunk(flushed);
  };
};

/**
 * Streaming variant of generateAssistantReply — calls onDelta(text) as tokens
 * arrive so the caller (voice assistant) can start speaking before the full
 * reply has finished generating. Same fallback contract as the non-streaming
 * version: returns null/{error} instead of throwing so chat never breaks.
 */
/**
 * Voice uses SSE streaming. OpenRouter :free pools often 429 streams while
 * non-stream still answers (live probe 2026-07-09). Try non-stream once and
 * emit as a single delta so voice TTS still works without hopping to paid.
 */
const tryNonStreamFallback = async ({
  provider, candidate, system, messages, onDelta, signal,
}) => {
  if (signal?.aborted) return null;
  const { temperature, maxTokens } = genParamsForModel(candidate);
  const result = await generateChat({
    system,
    messages,
    providerOverride: provider,
    model: candidate,
    temperature,
    maxTokens,
  });
  const text = stripReasoning(result?.text).trim();
  if (!text) return null;
  onDelta?.(text);
  return { text, provider: result.provider, model: candidate };
};

const generateAssistantReplyStream = async ({
  provider, model, context = {}, loggedEntities = [], message, locale = null, ambiguity = null, onDelta, signal,
}) => {
  context = capContextBudget(context);
  const messages = buildMessages(context.conversation, message, locale);
  const candidates = provider === 'openrouter' ? modelCandidates(model) : [model];
  const passes = provider === 'openrouter' ? freePoolPasses() : 1;
  let lastError = null;
  // Ops diagnostics: upstream call count + wall time (free-pool retries visible).
  const startedAt = Date.now();
  let attempts = 0;
  const diag = () => ({ attempts, latency_ms: Date.now() - startedAt });
  for (let pass = 0; pass < passes; pass++) {
    let hardStop = false;
    for (const candidate of candidates) {
      // Hop only when nothing streamed to the client yet — after first delta the
      // UI is already rendering this model's reply, so surface the error instead.
      let streamed = false;
      const system = buildSystemPrompt(context, loggedEntities, locale, candidate, ambiguity);

      // Live fact (OpenRouter free): SSE often 429s while non-stream still works.
      // Still the same user-picked free slug — never a different model.
      if (!signal?.aborted && isFreeSlug(candidate)) {
        try {
          attempts += 1;
          const recovered = await tryNonStreamFallback({
            provider, candidate, system, messages, onDelta, signal,
          });
          if (recovered) return { ...recovered, path: 'nonstream', ...diag() };
          lastError = new Error(`empty non-stream response from ${candidate}`);
        } catch (nsErr) {
          lastError = nsErr;
          if (!isRetryableError(nsErr) || signal?.aborted) { hardStop = true; break; }
          // retryable → try stream on the same free slug only
        }
      }

      if (signal?.aborted) { hardStop = true; break; }

      try {
        let text = '';
        const filter = makeReasoningFilter((chunk) => { text += chunk; streamed = true; onDelta?.(chunk); });
        const { temperature, maxTokens } = genParamsForModel(candidate);
        attempts += 1;
        const result = await generateChatStream({
          system,
          messages,
          providerOverride: provider,
          model: candidate,
          temperature,
          maxTokens,
          signal,
          onDelta: filter,
        });
        const finalText = text.trim() || stripReasoning(result?.text).trim();
        if (finalText) return { text: finalText, provider: result.provider, model: candidate, path: 'stream', ...diag() };
        lastError = new Error(`empty response from ${candidate}`);
      } catch (error) {
        lastError = error;
        // Streamed/aborted/hard errors stop; retryable pre-stream errors retry same slug.
        if (streamed || signal?.aborted || !isRetryableError(error)) { hardStop = true; break; }
      }
    }
    if (hardStop || signal?.aborted) break;
    // Same wall-clock budget as the non-stream path — bounded, then honest.
    if (Date.now() - startedAt >= freeRetryBudgetMs()) break;
    if (pass < passes - 1) await sleep(freePoolRetryMs());
  }
  return { error: lastError?.message || 'generation failed', ...diag() };
};

module.exports = {
  generateAssistantReply,
  generateAssistantReplyStream,
  _buildSystemPrompt: buildSystemPrompt,
  _buildMessages: buildMessages,
  _describeLoggedFacts: describeLoggedFacts,
  _stripReasoning: stripReasoning,
  _makeReasoningFilter: makeReasoningFilter,
  _isRetryableError: isRetryableError,
  _buildLanguageDirective: buildLanguageDirective,
  _modelCandidates: modelCandidates,
  _buildDataGaps: buildDataGaps,
  _capContextBudget: capContextBudget,
  _genParamsForModel: genParamsForModel,
  _MAX_THINK_BUFFER: MAX_THINK_BUFFER,
};
