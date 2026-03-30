// server/services/ai/insightEngine.js
// ============================================
// AI Insight Engine — Behavioral Pattern Detection
// Requirement: UR12 & UR7
//
// Analyzes 7-day combined Health + Finance data
// to detect cross-domain correlations and generate
// actionable "Insight Cards" for the dashboard.
// ============================================

const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../../config/database');
const HealthLog = require('../../models/HealthLog');
const FinancialLog = require('../../models/FinancialLog');
const Category = require('../../models/Category');
const AISummary = require('../../models/AISummary');

// ────────────────────────────────────────────
// STATISTICAL HELPERS
// ────────────────────────────────────────────

/** Pearson correlation coefficient between two arrays */
function pearsonCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { r: 0, significance: 'insufficient_data' };

  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return { r: 0, significance: 'no_variance' };

  const r = num / den;

  // Rough significance: |r| > 0.5 with n >= 5 is meaningful
  let significance = 'weak';
  if (Math.abs(r) > 0.7 && n >= 5) significance = 'strong';
  else if (Math.abs(r) > 0.5 && n >= 4) significance = 'moderate';
  else if (Math.abs(r) > 0.3) significance = 'weak';
  else significance = 'negligible';

  return { r: Math.round(r * 1000) / 1000, significance, n };
}

/** Simple moving average */
function trend(values) {
  if (values.length < 2) return 'insufficient_data';
  const first = values.slice(0, Math.ceil(values.length / 2));
  const second = values.slice(Math.floor(values.length / 2));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
  const pctChange = ((avgSecond - avgFirst) / (avgFirst || 1)) * 100;

  if (pctChange > 10) return 'improving';
  if (pctChange < -10) return 'declining';
  return 'stable';
}

/** Bucket items by calendar date string */
function bucketByDay(rows, dateField = 'logged_at') {
  const buckets = {};
  rows.forEach((row) => {
    const day = new Date(row[dateField] || row.created_at).toISOString().slice(0, 10);
    if (!buckets[day]) buckets[day] = [];
    buckets[day].push(row);
  });
  return buckets;
}

// ────────────────────────────────────────────
// DATA GATHERING
// ────────────────────────────────────────────

async function gatherWeekData(userId) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const whereThisWeek = { user_id: userId, logged_at: { [Op.gte]: weekAgo } };
  const whereLastWeek = { user_id: userId, logged_at: { [Op.gte]: twoWeeksAgo, [Op.lt]: weekAgo } };

  // Raw daily health records (this week)
  const healthRows = await HealthLog.findAll({
    where: whereThisWeek,
    order: [['logged_at', 'ASC']],
    raw: true,
  });

  // Raw daily finance records (this week)
  const financeRows = await FinancialLog.findAll({
    where: whereThisWeek,
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
    order: [['logged_at', 'ASC']],
    raw: true,
    nest: true,
  });

  // Aggregated health by type (this week + last week for comparison)
  const healthAgg = await HealthLog.findAll({
    where: whereThisWeek,
    attributes: ['type',
      [fn('AVG', col('value')), 'avg_value'],
      [fn('SUM', col('value')), 'total_value'],
      [fn('COUNT', col('id')), 'entry_count'],
      [fn('MIN', col('value')), 'min_value'],
      [fn('MAX', col('value')), 'max_value'],
    ],
    group: ['type'],
    raw: true,
  });

  const healthAggPrev = await HealthLog.findAll({
    where: whereLastWeek,
    attributes: ['type',
      [fn('AVG', col('value')), 'avg_value'],
      [fn('SUM', col('value')), 'total_value'],
    ],
    group: ['type'],
    raw: true,
  });

  // Aggregated finance by type + category
  const financeAgg = await FinancialLog.findAll({
    where: whereThisWeek,
    include: [{ model: Category, as: 'category', attributes: ['name'] }],
    attributes: ['type', 'category_id',
      [fn('SUM', col('amount')), 'total'],
      [fn('COUNT', col('financial_logs.id')), 'count'],
    ],
    group: ['type', 'category_id', 'category.id'],
    raw: true,
    nest: true,
  });

  const financeAggPrev = await FinancialLog.findAll({
    where: whereLastWeek,
    attributes: ['type',
      [fn('SUM', col('amount')), 'total'],
    ],
    group: ['type'],
    raw: true,
  });

  return {
    healthRows, financeRows, healthAgg, healthAggPrev,
    financeAgg, financeAggPrev,
    period: { start: weekAgo, end: now },
  };
}

// ────────────────────────────────────────────
// PATTERN DETECTORS
// ────────────────────────────────────────────

/**
 * Detector 1: Sleep Duration ↔ Spending Habits
 * Groups by day, correlates avg sleep with total spending
 */
function detectSleepSpendingCorrelation(healthRows, financeRows) {
  const healthByDay = bucketByDay(healthRows);
  const financeByDay = bucketByDay(financeRows);

  const allDays = [...new Set([...Object.keys(healthByDay), ...Object.keys(financeByDay)])].sort();
  if (allDays.length < 3) return null;

  const sleepValues = [];
  const spendValues = [];
  const dayDetails = [];

  allDays.forEach((day) => {
    const sleepEntries = (healthByDay[day] || []).filter((e) => e.type === 'sleep');
    const expenses = (financeByDay[day] || []).filter((e) => e.type === 'expense');

    const avgSleep = sleepEntries.length > 0
      ? sleepEntries.reduce((s, e) => s + Number(e.value), 0) / sleepEntries.length
      : null;
    const totalSpend = expenses.reduce((s, e) => s + Number(e.amount), 0);

    if (avgSleep !== null) {
      sleepValues.push(avgSleep);
      spendValues.push(totalSpend);
      dayDetails.push({ day, sleep: avgSleep, spend: totalSpend });
    }
  });

  if (sleepValues.length < 3) return null;

  const corr = pearsonCorrelation(sleepValues, spendValues);

  // Find low-sleep high-spend days
  const avgSleep = sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length;
  const lowSleepHighSpend = dayDetails.filter((d) => d.sleep < avgSleep * 0.85 && d.spend > 0);

  let observation = '';
  let severity = 'neutral';

  if (corr.r < -0.4 && corr.significance !== 'negligible') {
    observation = `Negative correlation detected (r=${corr.r}): you tend to spend more on days you sleep less. ` +
      `Low-sleep days averaged $${(lowSleepHighSpend.reduce((s, d) => s + d.spend, 0) / (lowSleepHighSpend.length || 1)).toFixed(0)} in spending.`;
    severity = 'concerning';
  } else if (corr.r > 0.4) {
    observation = `Positive pattern: better sleep aligns with steady spending habits (r=${corr.r}).`;
    severity = 'positive';
  } else {
    observation = `No strong link found between sleep and spending this week (r=${corr.r}).`;
    severity = 'neutral';
  }

  return {
    pattern: 'sleep_spending_correlation',
    domain: 'both',
    correlation: corr,
    observation,
    severity,
    trend: trend(spendValues),
    data_points: dayDetails.length,
  };
}

/**
 * Detector 2: Mood ↔ Nutrition/Water Intake
 * Correlates daily mood with caloric/water intake
 */
function detectMoodNutritionImpact(healthRows) {
  const byDay = bucketByDay(healthRows);
  const days = Object.keys(byDay).sort();

  const moodValues = [];
  const nutritionValues = [];
  const waterValues = [];
  const details = [];

  days.forEach((day) => {
    const entries = byDay[day];
    const moods = entries.filter((e) => e.type === 'mood');
    const nutrition = entries.filter((e) => e.type === 'nutrition');
    const water = entries.filter((e) => e.type === 'water');

    const avgMood = moods.length > 0
      ? moods.reduce((s, e) => s + Number(e.value), 0) / moods.length
      : null;
    const totalNutrition = nutrition.reduce((s, e) => s + Number(e.value), 0);
    const totalWater = water.reduce((s, e) => s + Number(e.value), 0);

    if (avgMood !== null) {
      moodValues.push(avgMood);
      nutritionValues.push(totalNutrition);
      waterValues.push(totalWater);
      details.push({ day, mood: avgMood, nutrition: totalNutrition, water: totalWater });
    }
  });

  if (moodValues.length < 3) return null;

  const moodNutritionCorr = pearsonCorrelation(moodValues, nutritionValues);
  const moodWaterCorr = pearsonCorrelation(moodValues, waterValues);

  const observations = [];

  if (moodNutritionCorr.r > 0.4 && moodNutritionCorr.significance !== 'negligible') {
    observations.push(`Better mood correlates with higher nutrition tracking (r=${moodNutritionCorr.r})`);
  } else if (moodNutritionCorr.r < -0.4) {
    observations.push(`Lower mood correlates with more eating (r=${moodNutritionCorr.r}) — possible emotional eating pattern`);
  }

  if (moodWaterCorr.r > 0.4) {
    observations.push(`Higher water intake days align with better mood (r=${moodWaterCorr.r})`);
  }

  const avgMood = moodValues.reduce((a, b) => a + b, 0) / moodValues.length;

  return {
    pattern: 'mood_nutrition_impact',
    domain: 'health',
    mood_nutrition_correlation: moodNutritionCorr,
    mood_water_correlation: moodWaterCorr,
    observation: observations.length > 0
      ? observations.join('. ') + '.'
      : `No strong link between mood and nutrition this week. Avg mood: ${avgMood.toFixed(1)}/10.`,
    severity: observations.length > 0 ? 'informative' : 'neutral',
    trend: trend(moodValues),
    avg_mood: Math.round(avgMood * 10) / 10,
  };
}

/**
 * Detector 3: Smart Budget Suggestions
 * Compares income vs expenses, projects monthly, finds top categories
 */
function detectBudgetPatterns(financeAgg, financeAggPrev) {
  const income = financeAgg
    .filter((f) => f.type === 'income')
    .reduce((s, f) => s + Number(f.total), 0);

  const expenses = financeAgg
    .filter((f) => f.type === 'expense')
    .reduce((s, f) => s + Number(f.total), 0);

  const prevIncome = financeAggPrev
    .filter((f) => f.type === 'income')
    .reduce((s, f) => s + Number(f.total), 0);

  const prevExpenses = financeAggPrev
    .filter((f) => f.type === 'expense')
    .reduce((s, f) => s + Number(f.total), 0);

  // Weekly savings rate
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
  const prevSavingsRate = prevIncome > 0 ? ((prevIncome - prevExpenses) / prevIncome) * 100 : 0;

  // Top spending categories
  const topCategories = financeAgg
    .filter((f) => f.type === 'expense')
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 3)
    .map((f) => ({
      category: f.category?.name || 'Uncategorized',
      amount: Number(f.total),
      percentage: expenses > 0 ? ((Number(f.total) / expenses) * 100).toFixed(1) : 0,
    }));

  // Monthly projection
  const monthlyProjectedExpenses = expenses * (30 / 7);
  const monthlyProjectedIncome = income * (30 / 7);

  const suggestions = [];

  if (savingsRate < 10) {
    suggestions.push({
      text: `Your savings rate is ${savingsRate.toFixed(0)}% — aim for at least 20% by reducing discretionary spending.`,
      priority: 'high',
      domain: 'finance',
      reason: `Weekly: $${income.toFixed(0)} income vs $${expenses.toFixed(0)} expenses`,
    });
  }

  if (topCategories.length > 0 && Number(topCategories[0].percentage) > 35) {
    suggestions.push({
      text: `${topCategories[0].category} accounts for ${topCategories[0].percentage}% of spending. Consider setting a weekly cap.`,
      priority: 'medium',
      domain: 'finance',
      reason: `$${topCategories[0].amount.toFixed(0)} this week on ${topCategories[0].category}`,
    });
  }

  if (expenses > prevExpenses * 1.2 && prevExpenses > 0) {
    const increase = ((expenses - prevExpenses) / prevExpenses * 100).toFixed(0);
    suggestions.push({
      text: `Spending increased ${increase}% compared to last week. Review recent transactions for non-essentials.`,
      priority: 'medium',
      domain: 'finance',
      reason: `This week: $${expenses.toFixed(0)} vs last week: $${prevExpenses.toFixed(0)}`,
    });
  }

  return {
    pattern: 'smart_budget',
    domain: 'finance',
    income_this_week: income,
    expenses_this_week: expenses,
    savings_rate: Math.round(savingsRate * 10) / 10,
    prev_savings_rate: Math.round(prevSavingsRate * 10) / 10,
    monthly_projected: {
      income: Math.round(monthlyProjectedIncome),
      expenses: Math.round(monthlyProjectedExpenses),
      net: Math.round(monthlyProjectedIncome - monthlyProjectedExpenses),
    },
    top_categories: topCategories,
    suggestions,
    spending_trend: expenses > prevExpenses * 1.1 ? 'increasing' : expenses < prevExpenses * 0.9 ? 'decreasing' : 'stable',
  };
}

/**
 * Detector 4: Activity ↔ Mood Correlation
 */
function detectActivityMoodLink(healthRows) {
  const byDay = bucketByDay(healthRows);
  const days = Object.keys(byDay).sort();

  const moodVals = [];
  const activityVals = [];

  days.forEach((day) => {
    const entries = byDay[day];
    const moods = entries.filter((e) => e.type === 'mood');
    const activities = entries.filter((e) => ['steps', 'exercise'].includes(e.type));

    const avgMood = moods.length > 0
      ? moods.reduce((s, e) => s + Number(e.value), 0) / moods.length
      : null;

    let totalActivity = 0;
    activities.forEach((e) => {
      if (e.type === 'steps') totalActivity += Number(e.value) / 100; // Normalize steps to ~minutes
      if (e.type === 'exercise') totalActivity += Number(e.duration || e.value);
    });

    if (avgMood !== null && totalActivity > 0) {
      moodVals.push(avgMood);
      activityVals.push(totalActivity);
    }
  });

  if (moodVals.length < 3) return null;

  const corr = pearsonCorrelation(moodVals, activityVals);

  return {
    pattern: 'activity_mood_link',
    domain: 'health',
    correlation: corr,
    observation: corr.r > 0.4
      ? `Active days correlate with better mood (r=${corr.r}). Keep moving!`
      : corr.r < -0.3
      ? `Interestingly, higher activity days show slightly lower mood (r=${corr.r}). You might be over-exerting.`
      : `No strong activity-mood link this week (r=${corr.r}).`,
    severity: corr.r > 0.4 ? 'positive' : 'neutral',
  };
}

// ────────────────────────────────────────────
// SCORE CALCULATIONS
// ────────────────────────────────────────────

function calculateHealthScore(healthAgg) {
  let score = 50; // Base
  const getAvg = (type) => {
    const entry = healthAgg.find((h) => h.type === type);
    return entry ? Number(entry.avg_value) : null;
  };

  const sleepAvg = getAvg('sleep');
  if (sleepAvg !== null) {
    if (sleepAvg >= 7 && sleepAvg <= 9) score += 15;
    else if (sleepAvg >= 6) score += 8;
    else score -= 5;
  }

  const moodAvg = getAvg('mood');
  if (moodAvg !== null) {
    score += Math.min(15, Math.round((moodAvg / 10) * 15));
  }

  const stepsTotal = healthAgg.find((h) => h.type === 'steps');
  if (stepsTotal) {
    const dailyAvg = Number(stepsTotal.total_value) / 7;
    if (dailyAvg >= 10000) score += 10;
    else if (dailyAvg >= 7000) score += 6;
    else if (dailyAvg >= 4000) score += 3;
  }

  const waterAvg = getAvg('water');
  if (waterAvg !== null) {
    if (waterAvg >= 2) score += 10;
    else if (waterAvg >= 1.5) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function calculateFinancialScore(financeAgg) {
  let score = 50;
  const income = financeAgg.filter((f) => f.type === 'income').reduce((s, f) => s + Number(f.total), 0);
  const expenses = financeAgg.filter((f) => f.type === 'expense').reduce((s, f) => s + Number(f.total), 0);

  if (income > 0) {
    const savingsRate = (income - expenses) / income;
    if (savingsRate > 0.3) score += 25;
    else if (savingsRate > 0.2) score += 20;
    else if (savingsRate > 0.1) score += 10;
    else if (savingsRate > 0) score += 5;
    else score -= 10;
  }

  // Category diversification: not spending >50% on a single category is healthy
  const totalExpense = expenses || 1;
  const topCategory = financeAgg
    .filter((f) => f.type === 'expense')
    .sort((a, b) => Number(b.total) - Number(a.total))[0];

  if (topCategory && (Number(topCategory.total) / totalExpense) < 0.35) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

// ────────────────────────────────────────────
// MAIN ENGINE: Orchestrates all detectors
// ────────────────────────────────────────────

/**
 * Run the full Insight Engine for a user.
 * Returns a structured insight object ready for the dashboard.
 *
 * @param {number} userId
 * @returns {Object} Insight cards payload
 */
async function runInsightEngine(userId) {
  const data = await gatherWeekData(userId);
  const {
    healthRows, financeRows, healthAgg, healthAggPrev,
    financeAgg, financeAggPrev, period,
  } = data;

  // Run all pattern detectors
  const patterns = [
    detectSleepSpendingCorrelation(healthRows, financeRows),
    detectMoodNutritionImpact(healthRows),
    detectBudgetPatterns(financeAgg, financeAggPrev),
    detectActivityMoodLink(healthRows),
  ].filter(Boolean);

  // Calculate composite scores
  const healthScore = calculateHealthScore(healthAgg);
  const financialScore = calculateFinancialScore(financeAgg);

  // Determine trend labels
  const moodEntries = healthRows.filter((h) => h.type === 'mood').map((h) => Number(h.value));
  const moodTrend = moodEntries.length >= 2 ? trend(moodEntries) : 'insufficient_data';

  const budgetPattern = patterns.find((p) => p.pattern === 'smart_budget');
  const spendingTrend = budgetPattern?.spending_trend || 'stable';

  // Build the cross-domain narrative
  const sleepSpendPattern = patterns.find((p) => p.pattern === 'sleep_spending_correlation');
  const moodNutritionPattern = patterns.find((p) => p.pattern === 'mood_nutrition_impact');

  let crossDomainInsights = '';
  if (sleepSpendPattern && sleepSpendPattern.severity === 'concerning') {
    crossDomainInsights = sleepSpendPattern.observation;
  }
  if (moodNutritionPattern && moodNutritionPattern.observation.includes('emotional eating')) {
    crossDomainInsights += (crossDomainInsights ? ' Additionally, ' : '') + moodNutritionPattern.observation;
  }
  if (!crossDomainInsights) {
    crossDomainInsights = 'No strong cross-domain patterns detected this week. Keep logging for better insights!';
  }

  // Build summary text
  const summaryParts = [];
  if (sleepSpendPattern?.severity === 'concerning') {
    summaryParts.push(sleepSpendPattern.observation);
  }
  if (budgetPattern?.suggestions?.length > 0) {
    summaryParts.push(budgetPattern.suggestions[0].text);
  }
  if (moodTrend === 'improving') {
    summaryParts.push('Your mood has been trending upward — great job!');
  }
  if (summaryParts.length === 0) {
    summaryParts.push(`Health score: ${healthScore}/100. Financial score: ${financialScore}/100. Keep tracking for more personalized insights.`);
  }

  // Aggregate recommendations from all patterns
  const recommendations = [];
  if (budgetPattern?.suggestions) recommendations.push(...budgetPattern.suggestions);

  if (sleepSpendPattern?.severity === 'concerning') {
    recommendations.push({
      text: 'Try to get 7+ hours of sleep to reduce impulse spending on low-energy days.',
      priority: 'high',
      domain: 'both',
      reason: sleepSpendPattern.observation,
    });
  }

  const activityMoodPattern = patterns.find((p) => p.pattern === 'activity_mood_link');
  if (activityMoodPattern?.correlation?.r > 0.4) {
    recommendations.push({
      text: 'Your mood improves on active days. Aim for at least 30 min of movement daily.',
      priority: 'medium',
      domain: 'health',
      reason: activityMoodPattern.observation,
    });
  }

  if (moodNutritionPattern?.mood_water_correlation?.r > 0.4) {
    recommendations.push({
      text: 'Staying hydrated correlates with better mood. Try to drink 2L+ daily.',
      priority: 'medium',
      domain: 'health',
      reason: 'Water-mood correlation detected',
    });
  }

  const result = {
    summary: summaryParts.join(' '),
    patterns: patterns.map((p) => ({
      observation: p.observation,
      domain: p.domain,
      trend: p.trend || p.spending_trend || 'stable',
      severity: p.severity || 'neutral',
    })),
    recommendations: recommendations.slice(0, 5),
    cross_domain_insights: crossDomainInsights,
    mood_trend: moodTrend,
    spending_trend: spendingTrend,
    health_score: healthScore,
    financial_health_score: financialScore,
    budget_summary: budgetPattern ? {
      income: budgetPattern.income_this_week,
      expenses: budgetPattern.expenses_this_week,
      savings_rate: budgetPattern.savings_rate,
      top_categories: budgetPattern.top_categories,
      monthly_projected: budgetPattern.monthly_projected,
    } : null,
    period,
    generated_at: new Date().toISOString(),
  };

  return result;
}

/**
 * Run engine + persist to AISummary table
 */
async function generateAndPersistInsights(userId) {
  const insights = await runInsightEngine(userId);

  const summary = await AISummary.create({
    user_id: userId,
    type: 'combined',
    period_start: insights.period.start.toISOString().split('T')[0],
    period_end: insights.period.end.toISOString().split('T')[0],
    summary: insights.summary,
    patterns: insights.patterns,
    recommendations: insights.recommendations,
    metrics_snapshot: {
      health_score: insights.health_score,
      financial_health_score: insights.financial_health_score,
      mood_trend: insights.mood_trend,
      spending_trend: insights.spending_trend,
      cross_domain: insights.cross_domain_insights,
      budget: insights.budget_summary,
    },
    is_read: false,
    generated_at: new Date(),
  });

  return { ...insights, id: summary.id };
}

module.exports = {
  runInsightEngine,
  generateAndPersistInsights,
  // Exported for testing
  pearsonCorrelation,
  detectSleepSpendingCorrelation,
  detectMoodNutritionImpact,
  detectBudgetPatterns,
  detectActivityMoodLink,
  calculateHealthScore,
  calculateFinancialScore,
};
