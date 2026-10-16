/**
 * Public automation API (iOS Shortcuts, Android Tasker / MacroDroid, scripts).
 * Authenticate with `Authorization: Bearer tly_...` or `X-API-Key: tly_...`.
 */
const express = require('express');
const { db } = require('../db');
const { HttpError, requireAuth, today } = require('../util');
const { loadCategories, normalizeTransaction, insertTransaction } = require('../transactions');
const { afterExpenses } = require('../budgets');

const router = express.Router();
router.use(requireAuth({ allowApiKey: true }));

router.get('/ping', (req, res) => res.json({ ok: true, user: req.user.name }));

router.get('/categories', async (req, res) => {
  const categories = await db.all('SELECT slug, name FROM categories WHERE user_id = ? ORDER BY id', req.user.id);
  res.json({ categories });
});

async function createMany(req, payloads) {
  const results = await insertMany(req, payloads);
  afterExpenses(req.user, results.map((r) => r.transaction));
  return results;
}

async function insertMany(req, payloads) {
  if (payloads.length > 200) throw new HttpError(413, 'Send at most 200 transactions per request');
  // Validate everything first so a batch is all-or-nothing.
  const cats = await loadCategories(req.user.id);
  const prepared = [];
  for (const [i, p] of payloads.entries()) {
    try {
      prepared.push(await normalizeTransaction(req.user.id, p || {}, { cats }));
    } catch (e) {
      if (e instanceof HttpError) throw new HttpError(e.status, `Item ${i}: ${e.message}`, { index: i, ...e.details });
      throw e;
    }
  }
  const source = String(req.get('x-source') || req.body?.source || 'api').slice(0, 30);
  if (prepared.length === 1) {
    const { data, warnings } = prepared[0];
    return [{ transaction: await insertTransaction(req.user.id, data, source), warnings }];
  }
  return db.tx(async (t) => {
    const out = [];
    for (const { data, warnings } of prepared) out.push({ transaction: await insertTransaction(req.user.id, data, source, t), warnings });
    return out;
  });
}

router.post('/transactions', async (req, res) => {
  const body = req.body;
  const list = Array.isArray(body) ? body : Array.isArray(body?.transactions) ? body.transactions : null;
  if (list) {
    const results = await createMany(req, list);
    return res.status(201).json({
      ok: true,
      count: results.length,
      transactions: results.map((r) => r.transaction),
      warnings: results.flatMap((r) => r.warnings),
    });
  }
  const [result] = await createMany(req, [body]);
  const t = result.transaction;
  res.status(201).json({
    ok: true,
    transaction: t,
    warnings: result.warnings,
    message: `Saved ${t.name} · ${t.amount} · ${t.category}`,
  });
});

// Minimal GET variant for automation apps that can only open URLs.
router.get('/add', async (req, res) => {
  const [result] = await createMany(req, [req.query]);
  res.status(201).json({ ok: true, transaction: result.transaction, warnings: result.warnings });
});

router.get('/summary', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : today().slice(0, 7);
  const row = await db.get(
    `SELECT COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS spent,
            COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
            COUNT(*) AS count
     FROM transactions WHERE user_id = ? AND substr(date,1,7) = ?`,
    req.user.id, month
  );
  res.json({ month, currency: req.user.currency, ...row, budget: req.user.monthly_budget });
});

module.exports = router;
