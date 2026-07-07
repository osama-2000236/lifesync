// server/services/ai/insightLocalizer.js
// ============================================
// Arabic localization for Insight Engine output.
//
// The engine composes English strings from a FIXED template set (all defined
// in insightEngine.js) and joins/branches on them internally, so the engine
// stays English inside. This module translates at the output edge by matching
// those exact templates and re-emitting them in Arabic with the interpolated
// numbers preserved. Additive: callers attach `_ar` fields next to the
// English ones; anything that doesn't match a known template falls through in
// English rather than breaking.
//
// ⚠ If you add/change a template in insightEngine.js, add/update its rule
// here — insightLocalizer.test.js locks the two files together.
// ============================================

// DB category names are seeded in English (server/seeders/seed.js) and get
// interpolated into templates. Mirror of client/src/i18n/categoryNames.js —
// keep both in sync when seed.js changes.
const CATEGORY_AR = {
  'Food & Dining': 'الطعام والمطاعم',
  Transportation: 'المواصلات',
  Entertainment: 'الترفيه',
  Shopping: 'التسوق',
  'Bills & Utilities': 'الفواتير والخدمات',
  Healthcare: 'الرعاية الصحية',
  Education: 'التعليم',
  Groceries: 'البقالة',
  'Income - Salary': 'دخل — راتب',
  'Income - Freelance': 'دخل — عمل حر',
  Savings: 'الادخار',
  Other: 'أخرى',
};
const arCat = (name) => CATEGORY_AR[name] || name;

// Ordered rules: [regex, arabic-replacer]. Applied with .replace(g) so
// concatenated observations ("A. Additionally, B.") localize piecewise.
const RULES = [
  // ─── Budget suggestions ───
  [/Your savings rate is (-?\d+)% — aim for at least 20% by reducing discretionary spending\./g,
    (_, n) => `معدل ادخارك ${n}٪ — استهدف ٢٠٪ على الأقل عبر تقليل الإنفاق غير الضروري.`],
  [/Weekly: \$(\d+) income vs \$(\d+) expenses/g,
    (_, inc, exp) => `أسبوعيًا: ${inc}$ دخل مقابل ${exp}$ مصروفات`],
  [/(.+?) accounts for ([\d.]+)% of spending\. Consider setting a weekly cap\./g,
    (_, cat, pct) => `فئة «${arCat(cat)}» تمثل ${pct}٪ من الإنفاق. فكّر في وضع سقف أسبوعي لها.`],
  [/\$(\d+) this week on (.+)/g,
    (_, amt, cat) => `${amt}$ هذا الأسبوع على «${arCat(cat)}»`],
  [/Spending increased (\d+)% compared to last week\. Review recent transactions for non-essentials\./g,
    (_, pct) => `ارتفع الإنفاق ${pct}٪ مقارنة بالأسبوع الماضي. راجع أحدث المعاملات بحثًا عن غير الضروريات.`],
  [/This week: \$(\d+) vs last week: \$(\d+)/g,
    (_, a, b) => `هذا الأسبوع: ${a}$ مقابل الأسبوع الماضي: ${b}$`],

  // ─── Cross-domain recommendations ───
  [/Try to get 7\+ hours of sleep to reduce impulse spending on low-energy days\./g,
    () => 'حاول النوم ٧ ساعات أو أكثر لتقليل الشراء الاندفاعي في أيام الطاقة المنخفضة.'],
  [/Your mood improves on active days\. Aim for at least 30 min of movement daily\./g,
    () => 'مزاجك يتحسن في الأيام النشطة. استهدف ٣٠ دقيقة حركة يوميًا على الأقل.'],
  [/Staying hydrated correlates with better mood\. Try to drink 2L\+ daily\./g,
    () => 'شرب الماء بانتظام يرتبط بمزاج أفضل. حاول شرب لترين أو أكثر يوميًا.'],
  [/Water-mood correlation detected/g,
    () => 'رُصد ارتباط بين شرب الماء والمزاج'],

  // ─── Sleep ↔ spending observations ───
  [/Negative correlation detected \(r=(-?[\d.]+)\): you tend to spend more on days you sleep less\. Low-sleep days averaged \$(\d+) in spending\./g,
    (_, r, avg) => `رُصد ارتباط سلبي (r=${r}): تميل إلى إنفاق أكثر في الأيام التي تنام فيها أقل. متوسط الإنفاق في أيام قلة النوم ${avg}$.`],
  [/Positive pattern: better sleep aligns with steady spending habits \(r=(-?[\d.]+)\)\./g,
    (_, r) => `نمط إيجابي: النوم الأفضل يترافق مع عادات إنفاق مستقرة (r=${r}).`],
  [/No strong link found between sleep and spending this week \(r=(-?[\d.]+)\)\./g,
    (_, r) => `لا يوجد ارتباط قوي بين النوم والإنفاق هذا الأسبوع (r=${r}).`],

  // ─── Mood ↔ nutrition/water observations ───
  [/Better mood correlates with higher nutrition tracking \(r=(-?[\d.]+)\)/g,
    (_, r) => `المزاج الأفضل يرتبط بتسجيل تغذية أعلى (r=${r})`],
  [/Lower mood correlates with more eating \(r=(-?[\d.]+)\) — possible emotional eating pattern/g,
    (_, r) => `المزاج المنخفض يرتبط بأكل أكثر (r=${r}) — قد يكون نمط أكل عاطفي`],
  [/Higher water intake days align with better mood \(r=(-?[\d.]+)\)/g,
    (_, r) => `أيام شرب الماء الأكثر تترافق مع مزاج أفضل (r=${r})`],
  [/No strong link between mood and nutrition this week\. Avg mood: ([\d.]+)\/10\./g,
    (_, avg) => `لا يوجد ارتباط قوي بين المزاج والتغذية هذا الأسبوع. متوسط المزاج: ${avg}/10.`],

  // ─── Activity ↔ mood observations ───
  [/Active days correlate with better mood \(r=(-?[\d.]+)\)\. Keep moving!/g,
    (_, r) => `الأيام النشطة تترافق مع مزاج أفضل (r=${r}). واصل الحركة!`],
  [/Interestingly, higher activity days show slightly lower mood \(r=(-?[\d.]+)\)\. You might be over-exerting\./g,
    (_, r) => `لافت: أيام النشاط الأعلى تُظهر مزاجًا أقل قليلًا (r=${r}). ربما تُجهد نفسك.`],
  [/No strong activity-mood link this week \(r=(-?[\d.]+)\)\./g,
    (_, r) => `لا يوجد ارتباط قوي بين النشاط والمزاج هذا الأسبوع (r=${r}).`],

  // ─── Summary / misc ───
  [/Your mood has been trending upward — great job!/g,
    () => 'مزاجك في تحسّن مستمر — أحسنت!'],
  [/Health score: (\d+)\/100\. Financial score: (\d+)\/100\. Keep tracking for more personalized insights\./g,
    (_, h, f) => `مؤشر الصحة: ${h}/100. المؤشر المالي: ${f}/100. واصل التسجيل للحصول على رؤى أدق.`],
  [/No strong cross-domain patterns detected this week\. Keep logging for better insights!/g,
    () => 'لم تُرصد أنماط قوية بين الصحة والمال هذا الأسبوع. واصل التسجيل للحصول على رؤى أفضل!'],
  [/ Additionally, /g, () => ' إضافة إلى ذلك، '],
];

/** Translate one engine-produced string to Arabic. Unknown parts stay English. */
const localizeInsightText = (text) => {
  if (!text) return text;
  let out = String(text);
  for (const [re, replacer] of RULES) out = out.replace(re, replacer);
  return out;
};

/**
 * Attach `_ar` fields to a full insight payload (additive, never mutates the
 * English fields): summary_ar, cross_domain_insights_ar, and per-recommendation
 * text_ar / reason_ar.
 */
const localizeInsights = (insights) => {
  if (!insights || typeof insights !== 'object') return insights;
  return {
    ...insights,
    summary_ar: localizeInsightText(insights.summary),
    cross_domain_insights_ar: localizeInsightText(insights.cross_domain_insights),
    recommendations: (insights.recommendations || []).map((r) => ({
      ...r,
      text_ar: localizeInsightText(r.text),
      reason_ar: localizeInsightText(r.reason),
    })),
  };
};

module.exports = { localizeInsightText, localizeInsights };
