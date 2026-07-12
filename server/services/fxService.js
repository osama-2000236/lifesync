// server/services/fxService.js
// ============================================
// FX rates for multi-currency finance totals.
// Source: Frankfurter (ECB reference rates) — no API key.
// Convert: amount * rates[to] / rates[from] with a single base table.
// ============================================

const DEFAULT_BASE = () => String(process.env.FX_BASE_CURRENCY || 'USD').toUpperCase();
const DEFAULT_URL = () => process.env.FX_RATES_URL || 'https://api.frankfurter.dev/v1/latest';
const TTL_MS = () => {
  const n = parseInt(process.env.FX_RATES_TTL_MS, 10);
  return Number.isFinite(n) && n > 0 ? n : 12 * 60 * 60 * 1000; // 12h
};

/** Health/goal units that are never ISO money codes. */
const NON_MONEY_UNITS = new Set([
  'steps', 'hours', 'hour', 'hrs', 'liters', 'liter', 'l',
  'rating', 'bpm', 'min', 'mins', 'minutes', 'kcal', 'calories',
  'kg', 'lb', 'lbs', 'm', 'km', 'mi',
]);

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isMoneyUnit = (unit) => {
  if (unit == null || unit === '') return false;
  const raw = String(unit).trim();
  if (NON_MONEY_UNITS.has(raw.toLowerCase())) return false;
  return /^[A-Za-z]{3}$/.test(raw);
};

const normalizeCurrency = (unit) => (isMoneyUnit(unit) ? String(unit).trim().toUpperCase() : null);

// In-process cache: one table per base.
const cacheByBase = new Map();

const clearFxCache = () => cacheByBase.clear();

/**
 * Build rates map where rates[C] = units of C per 1 unit of base (base itself = 1).
 * @returns {{ base: string, date: string|null, source: string, rates: Record<string, number>, error?: string }}
 */
const getRatesTable = async ({
  base = DEFAULT_BASE(),
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  force = false,
} = {}) => {
  const b = String(base || 'USD').toUpperCase();
  const hit = cacheByBase.get(b);
  if (!force && hit && (now - hit.fetchedAt) < TTL_MS()) {
    return hit.table;
  }

  if (typeof fetchImpl !== 'function') {
    const table = { base: b, date: null, source: 'fallback', rates: { [b]: 1 }, error: 'fetch_unavailable' };
    cacheByBase.set(b, { fetchedAt: now, table });
    return table;
  }

  try {
    const root = DEFAULT_URL();
    const url = new URL(root);
    if (!url.searchParams.has('from')) url.searchParams.set('from', b);
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout
        ? AbortSignal.timeout(8000)
        : undefined,
    });
    if (!res.ok) throw new Error(`fx_http_${res.status}`);
    const data = await res.json();
    const raw = data && typeof data.rates === 'object' ? data.rates : {};
    const rates = { [b]: 1 };
    for (const [code, value] of Object.entries(raw)) {
      const n = num(value);
      if (n != null && n > 0 && /^[A-Za-z]{3}$/.test(code)) {
        rates[String(code).toUpperCase()] = n;
      }
    }
    // API may return a different base than requested — normalize via that base if present.
    const apiBase = data.base ? String(data.base).toUpperCase() : b;
    if (apiBase !== b && rates[apiBase] != null) {
      // Rebuild so all values are "per 1 unit of requested base b".
      // rates currently: 1 apiBase = rates[C] C. We need 1 b = ? C.
      // If b is in rates: 1 apiBase = rates[b] b ⇒ 1 b = rates[C]/rates[b] C.
      if (rates[b] == null || rates[b] === 0) {
        throw new Error('fx_base_missing_in_rates');
      }
      const scale = rates[b];
      const rebuilt = { [b]: 1 };
      for (const [code, value] of Object.entries(rates)) {
        rebuilt[code] = value / scale;
      }
      Object.assign(rates, rebuilt);
    }

    const table = {
      base: b,
      date: data.date ? String(data.date) : null,
      source: 'frankfurter',
      rates,
    };
    cacheByBase.set(b, { fetchedAt: now, table });
    return table;
  } catch (err) {
    const table = {
      base: b,
      date: null,
      source: 'fallback',
      rates: { [b]: 1 },
      error: err?.message || 'fx_fetch_failed',
    };
    // Short cache on failure so we do not hammer a dead endpoint every goal load.
    cacheByBase.set(b, { fetchedAt: now, table });
    return table;
  }
};

/**
 * Convert amount from → to using a rates table (same base).
 * @returns {number|null} null when either currency is missing from the table
 */
const convertAmount = (amount, from, to, ratesTable) => {
  const a = num(amount);
  if (a == null) return null;
  const f = normalizeCurrency(from);
  const t = normalizeCurrency(to);
  if (!f || !t) return null;
  if (f === t) return a;
  const rates = ratesTable?.rates || ratesTable;
  if (!rates || typeof rates !== 'object') return null;
  const rFrom = num(rates[f]);
  const rTo = num(rates[t]);
  if (rFrom == null || rTo == null || rFrom <= 0 || rTo <= 0) return null;
  return a * (rTo / rFrom);
};

/**
 * Sum a { CUR: amount } map into target currency.
 * @returns {{ total: number, missing: string[], converted: boolean }}
 */
const sumInCurrency = (byCurrency = {}, target, ratesTable) => {
  const t = normalizeCurrency(target);
  if (!t) return { total: 0, missing: [], converted: false };
  let total = 0;
  const missing = [];
  let converted = false;
  for (const [cur, raw] of Object.entries(byCurrency || {})) {
    const code = normalizeCurrency(cur) || String(cur || '').toUpperCase();
    const convertedAmt = convertAmount(raw, code, t, ratesTable);
    if (convertedAmt == null) {
      if (num(raw) != null && num(raw) !== 0) missing.push(code);
      continue;
    }
    total += convertedAmt;
    if (code !== t) converted = true;
  }
  return { total: Math.round(total * 100) / 100, missing, converted };
};

module.exports = {
  isMoneyUnit,
  normalizeCurrency,
  getRatesTable,
  convertAmount,
  sumInCurrency,
  clearFxCache,
  _NON_MONEY_UNITS: NON_MONEY_UNITS,
};
