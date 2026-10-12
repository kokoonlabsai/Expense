const LOCALES = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB', AED: 'en-AE', SGD: 'en-SG', AUD: 'en-AU', CAD: 'en-CA', JPY: 'ja-JP' };
export const CURRENCIES = Object.keys(LOCALES);

const cache = new Map();
function fmt(currency, opts) {
  const key = currency + JSON.stringify(opts);
  if (!cache.has(key)) {
    cache.set(key, new Intl.NumberFormat(LOCALES[currency] || 'en-US', { style: 'currency', currency, ...opts }));
  }
  return cache.get(key);
}

export function money(n, currency = 'INR', { compact = false, decimals } = {}) {
  const v = Number(n) || 0;
  if (compact && Math.abs(v) >= 10000) {
    // en-US compact reads as K/M everywhere (en-IN would render "T" for thousand).
    const key = 'compact' + currency;
    if (!cache.has(key)) cache.set(key, new Intl.NumberFormat('en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }));
    return cache.get(key).format(v);
  }
  const whole = decimals === undefined ? Number.isInteger(Math.round(v * 100) / 100) : decimals === 0;
  return fmt(currency, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(v);
}

export function currencySymbol(currency = 'INR') {
  return fmt(currency, {}).formatToParts(0).find((p) => p.type === 'currency')?.value || currency;
}

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const thisMonth = () => todayISO().slice(0, 7);
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };

export function shiftMonth(ym, delta) {
  const d = parseISO(ym + '-01');
  d.setMonth(d.getMonth() + delta);
  return toISO(d).slice(0, 7);
}
export const monthLabel = (ym, style = 'long') => parseISO(ym + '-01').toLocaleDateString('en-US', { month: style, year: 'numeric' });
export const monthShort = (ym) => parseISO(ym + '-01').toLocaleDateString('en-US', { month: 'short' });

export function dayLabel(iso) {
  const t = todayISO();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === t) return 'Today';
  if (iso === toISO(y)) return 'Yesterday';
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}
export const shortDate = (iso) => parseISO(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('') || '?';
}
const AVATAR_COLORS = ['#7C5CFF', '#E5489B', '#FF7A59', '#1FB88A', '#3BA7FF', '#F2A93B', '#14B8C4', '#9B5CFF'];
export function colorFor(seed = '') {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
export function tint(hex, alpha = 0.12) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
