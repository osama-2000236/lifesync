// Minimal i18n layer (no dependency). EN + AR dictionaries; AR drives RTL.
// Extend the dictionaries per page — keys missing in `ar` fall back to `en`,
// and a missing key falls back to the key itself so nothing ever renders blank.
import { en } from './en';
import { ar } from './ar';

export const DICTS = { en, ar };
export const LOCALES = [
  { code: 'en', label: 'English', native: 'EN', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', native: 'ع', dir: 'rtl' },
];

export const dirFor = (locale) => (locale === 'ar' ? 'rtl' : 'ltr');

// Intl locale for dates: Arabic month/day names but Latin digits (-u-nu-latn),
// so numerals stay one system across the whole UI.
export const dateLocale = (locale) => (locale === 'ar' ? 'ar-u-nu-latn' : 'en-US');

/** Resolve a dotted key against a locale, with EN + key fallbacks. */
export const translate = (locale, key, vars) => {
  const dict = DICTS[locale] || DICTS.en;
  let val = dict[key];
  if (val === undefined) val = DICTS.en[key];
  if (val === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return val;
};
