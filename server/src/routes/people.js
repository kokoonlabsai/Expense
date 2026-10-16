/**
 * People search for adding someone to a split.
 * Privacy: you only find people you already share a group with (by name or number),
 * plus anyone on Tally whose full phone number you type — never a browsable user list.
 */
const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../util');

const router = express.Router();
router.use(requireAuth());

const mask = (phone) => (phone ? `•••• ${phone.slice(-4)}` : '');

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 40);
  if (!q) return res.json({ people: [] });
  const digits = q.replace(/\D/g, '');
  const me = req.user.id;

  const contacts = await db.all(
    `SELECT DISTINCT u.id, u.name, u.phone FROM users u
     JOIN group_members b ON b.user_id = u.id
     JOIN group_members a ON a.group_id = b.group_id AND a.user_id = ?
     WHERE u.id != ? AND (u.name LIKE ? ${digits.length >= 3 ? 'OR u.phone LIKE ?' : ''})
     ORDER BY u.name LIMIT 8`,
    me, me, `%${q}%`, ...(digits.length >= 3 ? [`%${digits}%`] : [])
  );

  // A full number (with or without the country code) finds anyone on Tally.
  let byPhone = [];
  if (digits.length >= 10) {
    byPhone = await db.all('SELECT id, name, phone FROM users WHERE id != ? AND phone LIKE ? LIMIT 3', me, `%${digits.slice(-10)}`);
  }

  const seen = new Set();
  const people = [...contacts.map((p) => ({ ...p, known: true })), ...byPhone.map((p) => ({ ...p, known: false }))]
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      phone_hint: mask(p.phone),
      known: p.known,
      // Contacts are added by id; strangers only by the number the searcher already typed.
      ...(p.known ? {} : { phone: p.phone }),
    }));
  res.json({ people });
});

module.exports = router;
