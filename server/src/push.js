/**
 * Web Push notifications (works on Android, desktop, and iPhone when Tally is added to the Home Screen).
 * VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or are generated once and kept in the database.
 */
const webpush = require('web-push');
const { db, ready } = require('./db');

let keys = null;

async function vapid() {
  if (keys) return keys;
  await ready;
  let publicKey = process.env.VAPID_PUBLIC_KEY;
  let privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    const fresh = webpush.generateVAPIDKeys();
    // INSERT OR IGNORE + re-read: if two instances race, both end up with the same stored pair.
    await db.run("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('vapid', ?)", JSON.stringify(fresh));
    ({ publicKey, privateKey } = JSON.parse((await db.get("SELECT value FROM app_settings WHERE key = 'vapid'")).value));
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:notifications@tally.app', publicKey, privateKey);
  keys = { publicKey };
  return keys;
}

/**
 * Send a notification to every device of the given users. Never throws; dead subscriptions are removed.
 * payload: { title, body, url, tag }
 */
async function sendTo(userIds, payload) {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))];
  if (!ids.length) return 0;
  await vapid();
  const subs = await db.all(`SELECT * FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await db.run('DELETE FROM push_subscriptions WHERE id = ?', s.id).catch(() => {});
        } else {
          console.warn('[push] send failed', e.statusCode || '', e.body || e.message);
        }
      }
    })
  );
  return sent;
}

/** Fire-and-forget: notifications must never slow down or break the request that caused them. */
function notify(userIds, payload) {
  return sendTo(userIds, payload).catch((e) => console.warn('[push]', e.message));
}

module.exports = { vapid, sendTo, notify, webpush };
