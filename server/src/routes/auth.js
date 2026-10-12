const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, seedCategories } = require('../db');
const { deleteUser } = require('../cleanup');
const { HttpError, wrap, normalizePhone, signToken, hashKey, requireAuth, publicUser } = require('../util');

const router = express.Router();

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'];

router.post(
  '/signup',
  wrap(async (req, res) => {
    const { name, password, currency } = req.body || {};
    const phone = normalizePhone(req.body?.phone);
    const errors = {};
    if (!name || !String(name).trim()) errors.name = 'Tell us your name';
    if (!phone) errors.phone = 'Enter a valid phone number';
    if (!password || String(password).length < 6) errors.password = 'Use at least 6 characters';
    if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);
    if (await db.get('SELECT 1 FROM users WHERE phone = ?', phone)) {
      throw new HttpError(409, 'An account with this phone number already exists', { phone: 'Already registered' });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const cur = CURRENCIES.includes(currency) ? currency : 'INR';
    const info = await db.run(
      'INSERT INTO users (name, phone, password_hash, currency) VALUES (?, ?, ?, ?)',
      String(name).trim(), phone, hash, cur
    );
    const user = await db.get('SELECT * FROM users WHERE id = ?', info.lastInsertRowid);
    await seedCategories(user.id);
    // Anyone who already added this phone number to a split group now sees it.
    await db.run('UPDATE group_members SET user_id = ? WHERE phone = ? AND user_id IS NULL', user.id, phone);
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const user = phone && (await db.get('SELECT * FROM users WHERE phone = ?', phone));
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Phone number or password is incorrect');
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get('/me', requireAuth(), (req, res) => res.json({ user: publicUser(req.user) }));

router.patch(
  '/me',
  requireAuth(),
  wrap(async (req, res) => {
    const { name, currency, monthly_budget, current_password, new_password } = req.body || {};
    const u = req.user;
    if (name !== undefined) {
      if (!String(name).trim()) throw new HttpError(422, 'Name cannot be empty');
      await db.run('UPDATE users SET name = ? WHERE id = ?', String(name).trim(), u.id);
    }
    if (currency !== undefined) {
      if (!CURRENCIES.includes(currency)) throw new HttpError(422, 'Unsupported currency');
      await db.run('UPDATE users SET currency = ? WHERE id = ?', currency, u.id);
    }
    if (monthly_budget !== undefined) {
      const b = monthly_budget === null || monthly_budget === '' ? null : Number(monthly_budget);
      if (b !== null && (!isFinite(b) || b < 0)) throw new HttpError(422, 'Budget must be a positive number');
      await db.run('UPDATE users SET monthly_budget = ? WHERE id = ?', b, u.id);
    }
    if (new_password !== undefined) {
      if (!(await bcrypt.compare(String(current_password || ''), u.password_hash))) {
        throw new HttpError(403, 'Current password is incorrect');
      }
      if (String(new_password).length < 6) throw new HttpError(422, 'Use at least 6 characters');
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(String(new_password), 10), u.id);
    }
    const fresh = await db.get('SELECT * FROM users WHERE id = ?', u.id);
    res.json({ user: publicUser(fresh) });
  })
);

router.delete('/me', requireAuth(), async (req, res) => {
  await deleteUser(req.user.id);
  res.status(204).end();
});

// ---- API keys for phone automations ----
router.get('/keys', requireAuth(), async (req, res) => {
  const keys = await db.all(
    'SELECT id, label, prefix, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY id DESC',
    req.user.id
  );
  res.json({ keys });
});

router.post('/keys', requireAuth(), async (req, res) => {
  const label = String(req.body?.label || 'Automation').trim().slice(0, 60) || 'Automation';
  const key = 'tly_' + crypto.randomBytes(24).toString('hex');
  const info = await db.run(
    'INSERT INTO api_keys (user_id, label, key_hash, prefix) VALUES (?, ?, ?, ?)',
    req.user.id, label, hashKey(key), key.slice(0, 10)
  );
  res.status(201).json({ id: info.lastInsertRowid, label, key, prefix: key.slice(0, 10) });
});

router.delete('/keys/:id', requireAuth(), async (req, res) => {
  await db.run('DELETE FROM api_keys WHERE id = ? AND user_id = ?', req.params.id, req.user.id);
  res.status(204).end();
});

module.exports = router;
module.exports.CURRENCIES = CURRENCIES;
