const express = require('express');
const { db } = require('../db');
const { HttpError, requireAuth } = require('../util');
const { vapid, sendTo } = require('../push');

const router = express.Router();

router.get('/key', async (req, res) => {
  res.json(await vapid());
});

router.post('/subscribe', requireAuth(), async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !/^https:\/\//.test(endpoint) || !keys?.p256dh || !keys?.auth) {
    throw new HttpError(422, 'Invalid push subscription');
  }
  // One row per device; a device that switches accounts moves to the new user.
  await db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    req.user.id, String(endpoint).slice(0, 1000), String(keys.p256dh).slice(0, 200), String(keys.auth).slice(0, 100)
  );
  res.status(201).json({ ok: true });
});

router.delete('/subscribe', requireAuth(), async (req, res) => {
  await db.run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', String(req.body?.endpoint || ''), req.user.id);
  res.status(204).end();
});

router.post('/test', requireAuth(), async (req, res) => {
  const sent = await sendTo([req.user.id], {
    title: 'Notifications are on 🎉',
    body: "You'll hear from Tally when friends split or settle with you.",
    url: '/settings',
    tag: 'test',
  });
  res.json({ sent });
});

module.exports = router;
