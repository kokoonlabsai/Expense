const { db } = require('./db');
const { HttpError, parseDate, parseAmount, round2 } = require('./util');

const CATEGORY_ALIASES = {
  bill: 'bills', utilities: 'bills', utility: 'bills', electricity: 'bills', recharge: 'bills', phone: 'bills', internet: 'bills',
  shop: 'shopping', clothes: 'shopping', amazon: 'shopping',
  lend: 'lending', lent: 'lending', loan: 'lending', borrow: 'lending',
  dining: 'food', restaurant: 'food', eating: 'food', 'eating out': 'food', cafe: 'food', coffee: 'food', swiggy: 'food', zomato: 'food',
  grocery: 'groceries', supermarket: 'groceries',
  uber: 'transport', ola: 'transport', cab: 'transport', taxi: 'transport', fuel: 'transport', petrol: 'transport', commute: 'transport',
  trip: 'travel', flight: 'travel', hotel: 'travel',
  medical: 'health', medicine: 'health', doctor: 'health', gym: 'health', fitness: 'health',
  movie: 'entertainment', movies: 'entertainment', games: 'entertainment', fun: 'entertainment',
  salary: 'income', refund: 'income', cashback: 'income',
  subscription: 'subscriptions', netflix: 'subscriptions', spotify: 'subscriptions',
  home: 'rent', house: 'rent',
  invest: 'investment', investments: 'investment', sip: 'investment', stocks: 'investment',
  misc: 'other', miscellaneous: 'other', others: 'other',
};

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Resolve free text to one of the user's category slugs. Returns { slug, matched }. */
function resolveCategory(userId, input) {
  const cats = db.prepare('SELECT slug, name FROM categories WHERE user_id = ?').all(userId);
  if (input === undefined || input === null || String(input).trim() === '') return { slug: 'other', matched: false };
  const raw = String(input).toLowerCase().trim();
  const slug = slugify(raw);
  const bySlug = cats.find((c) => c.slug === slug);
  if (bySlug) return { slug: bySlug.slug, matched: true };
  const byName = cats.find((c) => c.name.toLowerCase() === raw || slugify(c.name) === slug);
  if (byName) return { slug: byName.slug, matched: true };
  const alias = CATEGORY_ALIASES[raw] || CATEGORY_ALIASES[slug];
  if (alias && cats.find((c) => c.slug === alias)) return { slug: alias, matched: true };
  const partial = cats.find((c) => c.name.toLowerCase().split(/[^a-z]+/).includes(raw));
  if (partial) return { slug: partial.slug, matched: true };
  return { slug: 'other', matched: false };
}

/**
 * Validate a transaction payload. With partial=true only provided fields are validated
 * (used for PATCH). Returns { data, warnings }.
 */
function normalizeTransaction(userId, body, { partial = false } = {}) {
  const errors = {};
  const warnings = [];
  const data = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('name') || has('title') || has('merchant') || has('description')) {
    const name = body.name ?? body.title ?? body.merchant ?? body.description;
    if (!name || !String(name).trim()) errors.name = 'Name is required';
    else data.name = String(name).trim().slice(0, 140);
  }

  if (!partial || has('amount')) {
    const amount = parseAmount(body.amount);
    if (amount === null || amount === 0) errors.amount = 'Amount must be a non-zero number';
    else data.amount = round2(Math.abs(amount));
  }

  if (!partial || has('date')) {
    const date = parseDate(body.date);
    if (!date) errors.date = 'Unrecognised date. Use YYYY-MM-DD.';
    else data.date = date;
  }

  if (!partial || has('category')) {
    const { slug, matched } = resolveCategory(userId, body.category);
    if (!matched && body.category) warnings.push(`Unknown category "${body.category}" — filed under "other".`);
    data.category = slug;
  }

  if (has('type') && body.type !== null && body.type !== '') {
    const t = String(body.type).toLowerCase();
    if (['income', 'credit', 'credited', 'in'].includes(t)) data.type = 'income';
    else if (['expense', 'debit', 'debited', 'out', 'spend'].includes(t)) data.type = 'expense';
    else errors.type = 'Type must be "expense" or "income"';
  } else if (!partial) {
    data.type = data.category === 'income' ? 'income' : 'expense';
  }

  if (has('note') || has('notes')) data.note = (body.note ?? body.notes) ? String(body.note ?? body.notes).slice(0, 500) : null;
  if (has('counterparty') || has('person')) {
    const p = body.counterparty ?? body.person;
    data.counterparty = p ? String(p).trim().slice(0, 80) : null;
  }
  if (has('settled')) data.settled = body.settled === true || body.settled === 1 || body.settled === 'true' ? 1 : 0;

  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
  return { data, warnings };
}

function insertTransaction(userId, data, source = 'manual') {
  const info = db
    .prepare(
      `INSERT INTO transactions (user_id, name, amount, type, category, date, note, counterparty, settled, source, group_expense_id)
       VALUES (@user_id, @name, @amount, @type, @category, @date, @note, @counterparty, @settled, @source, @group_expense_id)`
    )
    .run({
      user_id: userId,
      note: null,
      counterparty: null,
      settled: 0,
      group_expense_id: null,
      ...data,
      source,
    });
  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid);
}

/** Build a WHERE clause from query-string filters shared by list, export and totals. */
function buildFilters(userId, q) {
  const where = ['user_id = ?'];
  const params = [userId];
  const list = (v) => (Array.isArray(v) ? v : String(v).split(',')).map((s) => s.trim()).filter(Boolean);

  if (q.category) {
    const cats = list(q.category);
    if (cats.length) {
      where.push(`category IN (${cats.map(() => '?').join(',')})`);
      params.push(...cats);
    }
  }
  if (q.type && ['expense', 'income'].includes(q.type)) {
    where.push('type = ?');
    params.push(q.type);
  }
  if (q.month && /^\d{4}-\d{2}$/.test(q.month)) {
    where.push("substr(date, 1, 7) = ?");
    params.push(q.month);
  }
  if (q.from) {
    const d = parseDate(q.from);
    if (d) { where.push('date >= ?'); params.push(d); }
  }
  if (q.to) {
    const d = parseDate(q.to);
    if (d) { where.push('date <= ?'); params.push(d); }
  }
  if (q.min !== undefined && q.min !== '') { where.push('amount >= ?'); params.push(Number(q.min)); }
  if (q.max !== undefined && q.max !== '') { where.push('amount <= ?'); params.push(Number(q.max)); }
  if (q.q) {
    where.push('(name LIKE ? OR note LIKE ? OR counterparty LIKE ?)');
    const like = `%${q.q}%`;
    params.push(like, like, like);
  }
  if (q.source) { where.push('source = ?'); params.push(q.source); }
  if (q.settled === 'true' || q.settled === 'false') {
    where.push('settled = ?');
    params.push(q.settled === 'true' ? 1 : 0);
  }
  return { where: where.join(' AND '), params };
}

const SORTS = {
  date_desc: 'date DESC, id DESC',
  date_asc: 'date ASC, id ASC',
  amount_desc: 'amount DESC, id DESC',
  amount_asc: 'amount ASC, id ASC',
};

module.exports = { normalizeTransaction, insertTransaction, resolveCategory, buildFilters, SORTS, slugify };
