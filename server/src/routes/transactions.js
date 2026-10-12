const express = require('express');
const { db } = require('../db');
const { HttpError, requireAuth } = require('../util');
const { normalizeTransaction, insertTransaction, buildFilters, SORTS, slugify } = require('../transactions');

const router = express.Router();
router.use(requireAuth());

// ---- Transactions ----
router.get('/transactions', (req, res) => {
  const { where, params } = buildFilters(req.user.id, req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 500);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);
  const order = SORTS[req.query.sort] || SORTS.date_desc;
  const items = db
    .prepare(`SELECT * FROM transactions WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) AS expense,
        COALESCE(SUM(CASE WHEN type='income' THEN amount END), 0) AS income
       FROM transactions WHERE ${where}`
    )
    .get(...params);
  res.json({ items, totals, limit, offset });
});

router.get('/transactions/export.csv', (req, res) => {
  const { where, params } = buildFilters(req.user.id, req.query);
  const rows = db.prepare(`SELECT * FROM transactions WHERE ${where} ORDER BY date DESC, id DESC`).all(...params);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['date', 'name', 'amount', 'type', 'category', 'note', 'counterparty', 'source'];
  const csv = [header.join(',')].concat(rows.map((r) => header.map((h) => esc(r[h])).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
  res.send(csv);
});

router.post('/transactions', (req, res) => {
  const { data, warnings } = normalizeTransaction(req.user.id, req.body || {});
  const tx = insertTransaction(req.user.id, data, 'manual');
  res.status(201).json({ transaction: tx, warnings });
});

router.patch('/transactions/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) throw new HttpError(404, 'Transaction not found');
  const { data, warnings } = normalizeTransaction(req.user.id, req.body || {}, { partial: true });
  const keys = Object.keys(data);
  if (keys.length) {
    db.prepare(`UPDATE transactions SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({
      ...data,
      id: existing.id,
    });
  }
  res.json({ transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(existing.id), warnings });
});

router.delete('/transactions/:id', (req, res) => {
  const r = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!r.changes) throw new HttpError(404, 'Transaction not found');
  res.status(204).end();
});

// ---- Categories ----
router.get('/categories', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : null;
  const cats = db
    .prepare(
      `SELECT c.*, COALESCE(s.spent, 0) AS spent, COALESCE(s.count, 0) AS count
       FROM categories c
       LEFT JOIN (
         SELECT category, SUM(amount) AS spent, COUNT(*) AS count FROM transactions
         WHERE user_id = ? AND type = 'expense' ${month ? 'AND substr(date,1,7) = ?' : ''}
         GROUP BY category
       ) s ON s.category = c.slug
       WHERE c.user_id = ? ORDER BY c.id`
    )
    .all(...(month ? [req.user.id, month, req.user.id] : [req.user.id, req.user.id]));
  res.json({ categories: cats });
});

router.post('/categories', (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(422, 'Name is required', { name: 'Name is required' });
  const slug = slugify(name);
  if (!slug) throw new HttpError(422, 'Name must contain letters or numbers');
  if (db.prepare('SELECT 1 FROM categories WHERE user_id = ? AND slug = ?').get(req.user.id, slug)) {
    throw new HttpError(409, 'That category already exists');
  }
  const color = /^#[0-9a-f]{6}$/i.test(req.body?.color) ? req.body.color : '#64748B';
  const icon = String(req.body?.icon || 'tag').slice(0, 40);
  const budget = req.body?.budget ? Number(req.body.budget) : null;
  const info = db
    .prepare('INSERT INTO categories (user_id, slug, name, color, icon, budget) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, slug, name.slice(0, 40), color, icon, budget);
  res.status(201).json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/categories/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!cat) throw new HttpError(404, 'Category not found');
  const b = req.body || {};
  const next = {
    name: b.name !== undefined ? String(b.name).trim().slice(0, 40) || cat.name : cat.name,
    color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : cat.color,
    icon: b.icon ? String(b.icon).slice(0, 40) : cat.icon,
    budget: b.budget !== undefined ? (b.budget === null || b.budget === '' ? null : Math.max(0, Number(b.budget)) || null) : cat.budget,
  };
  db.prepare('UPDATE categories SET name=@name, color=@color, icon=@icon, budget=@budget WHERE id=@id').run({ ...next, id: cat.id });
  res.json({ category: db.prepare('SELECT * FROM categories WHERE id = ?').get(cat.id) });
});

router.delete('/categories/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!cat) throw new HttpError(404, 'Category not found');
  if (['other', 'income'].includes(cat.slug)) throw new HttpError(400, 'This category is required and cannot be removed');
  db.transaction(() => {
    db.prepare("UPDATE transactions SET category = 'other' WHERE user_id = ? AND category = ?").run(req.user.id, cat.slug);
    db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
  })();
  res.status(204).end();
});

module.exports = router;
