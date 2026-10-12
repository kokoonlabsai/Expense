const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbFile = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tally.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

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
  const insert = db.prepare(
    'INSERT OR IGNORE INTO categories (user_id, slug, name, color, icon) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const c of DEFAULT_CATEGORIES) insert.run(userId, c.slug, c.name, c.color, c.icon);
  });
  tx();
}

module.exports = { db, seedCategories, DEFAULT_CATEGORIES };
