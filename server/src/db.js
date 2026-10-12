const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

/**
 * Database: Turso (hosted libSQL/SQLite) when TURSO_DATABASE_URL is set,
 * otherwise a local SQLite file — same SQL either way.
 */
function connect() {
  if (process.env.TURSO_DATABASE_URL) {
    return createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tally.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return createClient({ url: `file:${file}` });
}

const client = connect();

const clean = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
function toArgs(params) {
  if (params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0])) {
    return Object.fromEntries(Object.entries(params[0]).map(([k, v]) => [k, clean(v)]));
  }
  return params.map(clean);
}
const toObjects = (rs) => rs.rows.map((r) => ({ ...r }));

/** Small query helpers shared by the client and transactions. */
function wrap(exec) {
  return {
    async all(sql, ...params) {
      return toObjects(await exec({ sql, args: toArgs(params) }));
    },
    async get(sql, ...params) {
      return toObjects(await exec({ sql, args: toArgs(params) }))[0];
    },
    async run(sql, ...params) {
      const rs = await exec({ sql, args: toArgs(params) });
      return { changes: rs.rowsAffected, lastInsertRowid: rs.lastInsertRowid === undefined ? undefined : Number(rs.lastInsertRowid) };
    },
  };
}

const db = {
  ...wrap((stmt) => client.execute(stmt)),
  /** Several writes in one atomic round-trip. */
  batch(statements) {
    return client.batch(statements.map(([sql, ...params]) => ({ sql, args: toArgs(params) })), 'write');
  },
  /** Interactive transaction: fn receives the same all/get/run helpers. */
  async tx(fn) {
    const t = await client.transaction('write');
    try {
      const result = await fn(wrap((stmt) => t.execute(stmt)));
      await t.commit();
      return result;
    } catch (e) {
      await t.rollback().catch(() => {});
      throw e;
    } finally {
      t.close();
    }
  },
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  monthly_budget REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  budget REAL,
  UNIQUE(user_id, slug)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income')),
  category TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  counterparty TEXT,
  settled INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  group_expense_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '✨',
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_members_user ON group_members(user_id);

CREATE TABLE IF NOT EXISTS group_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_by INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  split_type TEXT NOT NULL DEFAULT 'equal',
  category TEXT NOT NULL DEFAULT 'other',
  date TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_expense_shares (
  expense_id INTEGER NOT NULL REFERENCES group_expenses(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  PRIMARY KEY (expense_id, member_id)
);

CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  to_member INTEGER NOT NULL REFERENCES group_members(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const ready = client.executeMultiple(SCHEMA);

const DEFAULT_CATEGORIES = [
  { slug: 'food', name: 'Food & Dining', color: '#FF7A59', icon: 'utensils' },
  { slug: 'groceries', name: 'Groceries', color: '#2BB673', icon: 'shopping-basket' },
  { slug: 'shopping', name: 'Shopping', color: '#E5489B', icon: 'shopping-bag' },
  { slug: 'bills', name: 'Bills & Utilities', color: '#4C6FFF', icon: 'receipt' },
  { slug: 'lending', name: 'Lending', color: '#F2A93B', icon: 'hand-coins' },
  { slug: 'lifestyle', name: 'Lifestyle', color: '#9B5CFF', icon: 'sparkles' },
  { slug: 'transport', name: 'Transport', color: '#14B8C4', icon: 'car' },
  { slug: 'travel', name: 'Travel', color: '#0EA5E9', icon: 'plane' },
  { slug: 'health', name: 'Health', color: '#EF4444', icon: 'heart-pulse' },
  { slug: 'entertainment', name: 'Entertainment', color: '#F97316', icon: 'clapperboard' },
  { slug: 'education', name: 'Education', color: '#6366F1', icon: 'graduation-cap' },
  { slug: 'investment', name: 'Investment', color: '#10B981', icon: 'trending-up' },
  { slug: 'rent', name: 'Rent & Home', color: '#A16207', icon: 'home' },
  { slug: 'subscriptions', name: 'Subscriptions', color: '#DB2777', icon: 'repeat' },
  { slug: 'income', name: 'Income', color: '#16A34A', icon: 'wallet' },
  { slug: 'other', name: 'Other', color: '#64748B', icon: 'circle-dashed' },
];

function seedCategories(userId) {
  return db.batch(
    DEFAULT_CATEGORIES.map((c) => [
      'INSERT OR IGNORE INTO categories (user_id, slug, name, color, icon) VALUES (?, ?, ?, ?, ?)',
      userId, c.slug, c.name, c.color, c.icon,
    ])
  );
}

module.exports = { db, client, ready, seedCategories, DEFAULT_CATEGORIES };
