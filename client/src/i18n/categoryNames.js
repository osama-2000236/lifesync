// Category NAMES come from DB rows seeded in English (server/seeders/seed.js),
// so the key-based i18n dictionaries never see them. Localize at display time;
// data, colors, and API payloads keep the canonical English name.
// Adding a category to seed.js? Add its Arabic name here.
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
  // health categories (rarely shown by name, but complete the set)
  Steps: 'خطوات',
  Sleep: 'نوم',
  Mood: 'مزاج',
  Water: 'ماء',
  Nutrition: 'تغذية',
  Exercise: 'تمارين',
  'Heart Rate': 'نبض القلب',
};

export const localizeCategory = (name, locale) =>
  (locale === 'ar' && name && CATEGORY_AR[name]) || name;
