// server/services/ai/insightTemplates.js
// ============================================
// Single source of truth for Insight Engine English strings + Arabic RULES.
// insightEngine.js builds text via `T.*` builders; insightLocalizer applies RULES.
// tests/insightEval.test.js fails if a sample is not fully localized.
// ============================================

// DB category names (seed.js) — keep in sync with client/src/i18n/categoryNames.js
const CATEGORY_AR = {
  'Food & Dining': 'طعام ومطاعم',
  Transportation: 'مواصلات',
  Entertainment: 'ترفيه',
  Shopping: 'تسوق',
  'Bills & Utilities': 'فواتير وخدمات',
  Healthcare: 'رعاية صحية',
  Education: 'تعليم',
  Groceries: 'بقالة',
  'Income - Salary': 'دخل — راتب',
  'Income - Freelance': 'دخل — عمل حر',
  Savings: 'ادخار',
  Other: 'أخرى',
  Uncategorized: 'غير مصنّف',
};
const arCat = (name) => CATEGORY_AR[name] || name;

// ─── English builders (used by insightEngine) ───
const T = {
  sleepSpendNegative: (r, avg) => (
    `When you sleep less, spending often goes up (r=${r}). Low-sleep days averaged about $${avg}.`
  ),
  sleepSpendPositive: (r) => (
    `Better sleep lines up with steadier spending for you (r=${r}).`
  ),
  sleepSpendNone: (r) => (
    `No clear sleep–spending link this week yet (r=${r}).`
  ),
  moodNutritionPositive: (r) => (
    `Better mood days go with logging more of what you eat (r=${r})`
  ),
  moodNutritionEmotional: (r) => (
    `Lower mood days go with more eating (r=${r}) — that can be emotional eating`
  ),
  moodWaterPositive: (r) => (
    `Higher-water days line up with better mood (r=${r})`
  ),
  moodNutritionNone: (avg) => (
    `No clear mood–food link this week. Average mood: ${avg}/10.`
  ),
  savingsLow: (n) => (
    `You're saving about ${n}% right now — try aiming for 20% by trimming non-essentials.`
  ),
  weekInOut: (inc, exp) => `This week: $${inc} in, $${exp} out`,
  categoryShare: (cat, pct) => (
    `${cat} is ${pct}% of your spending. A weekly cap could help.`
  ),
  categorySpend: (amt, cat) => `$${amt} on ${cat} this week`,
  spendingJump: (pct) => (
    `Spending jumped ${pct}% from last week. Worth a quick look for non-essentials.`
  ),
  weekCompare: (a, b) => `This week $${a} · last week $${b}`,
  activityMoodPositive: (r) => (
    `Active days go with better mood (r=${r}). Keep it up!`
  ),
  activityMoodNegative: (r) => (
    `Odd one: busier days show a slightly lower mood (r=${r}). You might be pushing too hard.`
  ),
  activityMoodNone: (r) => (
    `No clear activity–mood link this week (r=${r}).`
  ),
  recSleepSpend: () => (
    'Aim for 7+ hours of sleep — tired days often come with more impulse spending.'
  ),
  recActivityMood: () => (
    'You feel better on active days. Try for 30 minutes of movement most days.'
  ),
  recWaterMood: () => (
    'Days you drink more water often look better for mood. Aim for 2L+.'
  ),
  reasonWaterMood: () => 'Water and mood seem linked in your logs',
  moodTrendingUp: () => 'Your mood is trending up — nice work!',
  scoresFallback: (h, f) => (
    `Health ${h}/100 · Money ${f}/100. Keep logging for tips that fit you better.`
  ),
  crossDomainNone: () => (
    'Nothing strong linking health and money this week. Keep logging — links show up with more history.'
  ),
  alsoJoin: () => ' Also, ',
};

// Golden samples for the eval harness (every builder, fixed numbers).
const SAMPLES = [
  T.sleepSpendNegative(-0.62, 45),
  T.sleepSpendPositive(0.55),
  T.sleepSpendNone(0.1),
  T.moodNutritionPositive(0.5),
  T.moodNutritionEmotional(-0.5),
  T.moodWaterPositive(0.44),
  T.moodNutritionNone('6.5'),
  T.savingsLow(5),
  T.weekInOut(200, 190),
  T.categoryShare('Food & Dining', '42.5'),
  T.categorySpend(80, 'Shopping'),
  T.spendingJump(35),
  T.weekCompare(120, 80),
  T.activityMoodPositive(0.61),
  T.activityMoodNegative(-0.35),
  T.activityMoodNone(0.05),
  T.recSleepSpend(),
  T.recActivityMood(),
  T.recWaterMood(),
  T.reasonWaterMood(),
  T.moodTrendingUp(),
  T.scoresFallback(72, 55),
  T.crossDomainNone(),
  // Joined observation (Also, join)
  `${T.moodNutritionPositive(0.5)}.${T.alsoJoin()}${T.moodWaterPositive(0.44)}`,
];

// Regex rules — must fully cover SAMPLES (no residual Latin words of substance).
const RULES = [
  [/You're saving about (-?\d+)% right now — try aiming for 20% by trimming non-essentials\./g,
    (_, n) => `حاليًا تدّخر نحو ${n}٪ — حاول بلوغ ٢٠٪ بتقليل الإنفاق غير الضروري.`],
  [/This week: \$(\d+) in, \$(\d+) out/g,
    (_, inc, exp) => `هذا الأسبوع: ${inc}$ دخلًا، و${exp}$ مصروفًا`],
  [/(.+?) is ([\d.]+)% of your spending\. A weekly cap could help\./g,
    (_, cat, pct) => `«${arCat(cat)}» يشكّل ${pct}٪ من إنفاقك. قد يفيدك سقف أسبوعي.`],
  [/\$(\d+) on (.+) this week/g,
    (_, amt, cat) => `${amt}$ على «${arCat(cat)}» هذا الأسبوع`],
  [/Spending jumped (\d+)% from last week\. Worth a quick look for non-essentials\./g,
    (_, pct) => `ارتفع الإنفاق ${pct}٪ عن الأسبوع الماضي. يستحق نظرة سريعة على غير الضروري.`],
  [/This week \$(\d+) · last week \$(\d+)/g,
    (_, a, b) => `هذا الأسبوع ${a}$ · الأسبوع الماضي ${b}$`],
  [/Aim for 7\+ hours of sleep — tired days often come with more impulse spending\./g,
    () => 'حاول النوم ٧ ساعات أو أكثر — أيام التعب غالبًا تصاحبها مشتريات عشوائية.'],
  [/You feel better on active days\. Try for 30 minutes of movement most days\./g,
    () => 'تشعر بتحسن في أيام الحركة. جرّب ٣٠ دقيقة حركة في معظم الأيام.'],
  [/Days you drink more water often look better for mood\. Aim for 2L\+\./g,
    () => 'الأيام التي تشرب فيها ماءً أكثر غالبًا يكون مزاجها أفضل. استهدف لترين أو أكثر.'],
  [/Water and mood seem linked in your logs/g,
    () => 'يبدو أن الماء والمزاج مرتبطان في سجلك'],
  [/When you sleep less, spending often goes up \(r=(-?[\d.]+)\)\. Low-sleep days averaged about \$(\d+)\./g,
    (_, r, avg) => `عندما تنام أقل، غالبًا يرتفع إنفاقك (r=${r}). متوسط أيام قلة النوم نحو ${avg}$.`],
  [/Better sleep lines up with steadier spending for you \(r=(-?[\d.]+)\)\./g,
    (_, r) => `نومك الأفضل يتوافق مع إنفاق أوضح لديك (r=${r}).`],
  [/No clear sleep–spending link this week yet \(r=(-?[\d.]+)\)\./g,
    (_, r) => `لا رابط واضح بعد بين النوم والإنفاق هذا الأسبوع (r=${r}).`],
  [/Better mood days go with logging more of what you eat \(r=(-?[\d.]+)\)/g,
    (_, r) => `أيام المزاج الأفضل تترافق مع تسجيل طعام أكثر (r=${r})`],
  [/Lower mood days go with more eating \(r=(-?[\d.]+)\) — that can be emotional eating/g,
    (_, r) => `أيام المزاج المنخفض تترافق مع أكل أكثر (r=${r}) — قد يكون أكلًا عاطفيًا`],
  [/Higher-water days line up with better mood \(r=(-?[\d.]+)\)/g,
    (_, r) => `أيام شرب الماء الأكثر تتوافق مع مزاج أفضل (r=${r})`],
  [/No clear mood–food link this week\. Average mood: ([\d.]+)\/10\./g,
    (_, avg) => `لا رابط واضح بين المزاج والطعام هذا الأسبوع. متوسط المزاج: ${avg}/10.`],
  [/Active days go with better mood \(r=(-?[\d.]+)\)\. Keep it up!/g,
    (_, r) => `أيام الحركة تتوافق مع مزاج أفضل (r=${r}). واصل هكذا!`],
  [/Odd one: busier days show a slightly lower mood \(r=(-?[\d.]+)\)\. You might be pushing too hard\./g,
    (_, r) => `ملاحظة: أيام الزحام يظهر فيها مزاج أقل قليلًا (r=${r}). قد تكون تجهد نفسك.`],
  [/No clear activity–mood link this week \(r=(-?[\d.]+)\)\./g,
    (_, r) => `لا رابط واضح بين الحركة والمزاج هذا الأسبوع (r=${r}).`],
  [/Your mood is trending up — nice work!/g,
    () => 'مزاجك في تحسّن — أحسنت!'],
  [/Health (\d+)\/100 · Money (\d+)\/100\. Keep logging for tips that fit you better\./g,
    (_, h, f) => `الصحة ${h}/100 · المال ${f}/100. واصل التسجيل لنصائح أنسب لك.`],
  [/Nothing strong linking health and money this week\. Keep logging — links show up with more history\./g,
    () => 'لا رابط قوي بين الصحة والمال هذا الأسبوع. واصل التسجيل — تظهر الروابط مع المزيد من السجل.'],
  [/ Also, /g, () => ' وكذلك، '],
  [/ Additionally, /g, () => ' وكذلك، '],
];

module.exports = {
  T,
  RULES,
  SAMPLES,
  CATEGORY_AR,
  arCat,
};
