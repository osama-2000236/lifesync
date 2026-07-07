// Category NAMES come from DB rows seeded in English (server/seeders/seed.js),
// so the key-based i18n dictionaries never see them. Localize at display time;
// data, colors, and API payloads keep the canonical English name.
// Adding a category to seed.js? Add its Arabic name here.
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
  // health categories (rarely shown by name, but complete the set)
  Steps: 'الخطوات',
  Sleep: 'النوم',
  Mood: 'المزاج',
  Water: 'الماء',
  Nutrition: 'التغذية',
  Exercise: 'التمارين',
  'Heart Rate': 'نبض القلب',
};

export const localizeCategory = (name, locale) =>
  (locale === 'ar' && name && CATEGORY_AR[name]) || name;
