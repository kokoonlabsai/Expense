const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[tally] JWT_SECRET is not set — using an insecure default. Set it in production.');
}

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function normalizePhone(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  const plus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return (plus ? '+' : '') + digits;
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function userFromApiKey(key) {
  if (!key || !key.startsWith('tly_')) return null;
  const row = db.prepare('SELECT id, user_id FROM api_keys WHERE key_hash = ?').get(hashKey(key));
  if (!row) return null;
  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
}

function userFromJwt(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) || null;
  } catch {
    return null;
  }
}

/** Session auth for the web app (JWT). Set allowApiKey to also accept API keys. */
function requireAuth({ allowApiKey = false } = {}) {
  return (req, res, next) => {
    const header = req.get('authorization') || '';
    const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
    const apiKey = req.get('x-api-key') || (bearer && bearer.startsWith('tly_') ? bearer : null) ||
      (allowApiKey ? req.query.api_key : null);

    let user = null;
    if (allowApiKey && apiKey) user = userFromApiKey(apiKey);
    if (!user && bearer && !bearer.startsWith('tly_')) user = userFromJwt(bearer);
    if (!user) return next(new HttpError(401, 'Not authenticated'));
    req.user = user;
    next();
  };
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    currency: u.currency,
    monthly_budget: u.monthly_budget,
    created_at: u.created_at,
  };
}

const pad = (n) => String(n).padStart(2, '0');
function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function today() {
  return toISODate(new Date());
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Accepts the many shapes phone automations produce:
 * 2026-10-12, 2026-10-12T10:30:00Z, 12/10/2026 (DD/MM/YYYY), 12-10-2026,
 * "12 Oct 2026", "Oct 12, 2026 at 10:30 AM", unix seconds/ms, "today", "yesterday".
 */
function parseDate(input) {
  if (input === undefined || input === null || input === '') return today();
  if (typeof input === 'number' || /^\d{9,13}$/.test(String(input).trim())) {
    const n = Number(input);
    const d = new Date(n < 1e11 ? n * 1000 : n);
    return isNaN(d) ? null : toISODate(d);
  }
  let s = String(input).trim();
  const lower = s.toLowerCase();
  if (lower === 'today' || lower === 'now') return today();
  if (lower === 'yesterday') {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toISODate(d);
  }

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validYMD(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m.map(Number);
    if (y < 100) y += 2000;
    // Default to DD/MM/YYYY; fall back to MM/DD when the first part can't be a day-of-month pair.
    if (b > 12 && a <= 12) return validYMD(y, a, b);
    return validYMD(y, b, a);
  }

  // Strip Apple Shortcuts-style " at 10:30 AM"
  s = s.replace(/\s+at\s+/i, ' ');
  m = s.match(/^(\d{1,2})\s+([a-z]{3,})\.?,?\s+(\d{4})/i);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) return validYMD(+m[3], mi + 1, +m[1]);
  }
  m = s.match(/^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) return validYMD(+m[3], mi + 1, +m[2]);
  }
  const d = new Date(s);
  return isNaN(d) ? null : toISODate(d);
}

function validYMD(y, mo, d) {
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return toISODate(dt);
}

function parseAmount(input) {
  if (typeof input === 'number') return isFinite(input) ? input : null;
  if (input === undefined || input === null) return null;
  const cleaned = String(input).replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = {
  HttpError,
  wrap,
  normalizePhone,
  signToken,
  hashKey,
  requireAuth,
  publicUser,
  parseDate,
  parseAmount,
  today,
  toISODate,
  round2,
};
