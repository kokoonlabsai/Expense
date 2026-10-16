const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jellyfish-push-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
const app = require('../src/index');
const { webpush } = require('../src/push');

// Capture pushes instead of calling real push services.
const sent = [];
const dead = new Set();
webpush.sendNotification = async (sub, body) => {
  if (dead.has(sub.endpoint)) throw Object.assign(new Error('gone'), { statusCode: 410 });
  sent.push({ endpoint: sub.endpoint, ...JSON.parse(body) });
};
const settle = () => new Promise((r) => setTimeout(r, 150));
const take = (endpoint) => {
  const mine = sent.filter((s) => s.endpoint === endpoint);
  sent.length = 0;
  return mine;
};

let server;
let base;
before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function call(method, url, { token, body } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const signup = async (name, phone) => (await call('POST', '/api/auth/signup', { body: { name, phone, password: 'secret1' } })).body.token;
const sub = (endpoint) => ({ endpoint, keys: { p256dh: 'BPk' + 'x'.repeat(84), auth: 'abcdefghijklmnop' } });

test('push notifications for splits, payments, reminders and budgets', async () => {
  let r = await call('GET', '/api/push/key');
  assert.match(r.body.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  const key = r.body.publicKey;
  assert.equal((await call('GET', '/api/push/key')).body.publicKey, key, 'VAPID key is stable');

  const asha = await signup('Asha Rao', '+919700000001');
  const ben = await signup('Ben Thomas', '+919700000002');
  const A = 'https://push.example/asha';
  const B = 'https://push.example/ben';
  assert.equal((await call('POST', '/api/push/subscribe', { token: asha, body: { endpoint: 'http://insecure', keys: {} } })).status, 422);
  assert.equal((await call('POST', '/api/push/subscribe', { token: asha, body: sub(A) })).status, 201);
  assert.equal((await call('POST', '/api/push/subscribe', { token: ben, body: sub(B) })).status, 201);

  r = await call('POST', '/api/push/test', { token: asha });
  assert.equal(r.body.sent, 1);
  await settle();
  take(A);

  // Added to a group
  r = await call('POST', '/api/groups', { token: asha, body: { name: 'Goa', emoji: '🏖️', members: [{ phone: '+919700000002' }] } });
  const gid = r.body.id;
  await settle();
  let got = take(B);
  assert.equal(got.length, 1);
  assert.equal(got[0].body, 'Asha Rao added you to the group');
  assert.equal(got[0].url, `/splits/${gid}`);

  r = await call('GET', `/api/groups/${gid}`, { token: asha });
  const [aM, bM] = r.body.members;

  // New expense → Ben hears his share; Asha (who added it) doesn't.
  await call('POST', `/api/groups/${gid}/expenses`, { token: asha, body: { description: 'Villa', amount: 1000, paid_by: aM.id } });
  await settle();
  assert.equal(sent.filter((s) => s.endpoint === A).length, 0);
  got = take(B);
  assert.equal(got.length, 1);
  assert.match(got[0].body, /Asha added "Villa" \(₹1,000, paid by Asha\) · your share ₹500/);

  // Ben says he paid → Asha asked to confirm → Ben told it's confirmed.
  r = await call('POST', `/api/groups/${gid}/settlements`, { token: ben, body: { from_member: bM.id, to_member: aM.id, amount: 500 } });
  const sid = r.body.id;
  await settle();
  got = take(A);
  assert.equal(got[0].title, 'Did you get paid?');
  assert.match(got[0].body, /Ben Thomas says they paid you ₹500/);
  await call('POST', `/api/groups/${gid}/settlements/${sid}/confirm`, { token: asha });
  await settle();
  got = take(B);
  assert.equal(got[0].title, 'Payment confirmed ✓');

  // Rejected payment notifies the person who recorded it.
  r = await call('POST', `/api/groups/${gid}/settlements`, { token: ben, body: { from_member: bM.id, to_member: aM.id, amount: 50 } });
  await settle();
  take(A);
  await call('DELETE', `/api/groups/${gid}/settlements/${r.body.id}`, { token: asha });
  await settle();
  assert.equal(take(B)[0].title, 'Payment not received');

  // Reminder, rate-limited.
  r = await call('POST', `/api/groups/${gid}/remind`, { token: asha, body: { member_id: bM.id, amount: 120 } });
  assert.equal(r.body.sent, 1);
  assert.match(take(B)[0].body, /friendly reminder: you owe ₹120/);
  r = await call('POST', `/api/groups/${gid}/remind`, { token: asha, body: { member_id: bM.id } });
  assert.equal(r.status, 429);

  // Budget alert fires once, when the expense crosses the line.
  const cats = (await call('GET', '/api/categories', { token: asha })).body.categories;
  const food = cats.find((c) => c.slug === 'food');
  await call('PATCH', `/api/categories/${food.id}`, { token: asha, body: { budget: 100 } });
  await call('POST', '/api/transactions', { token: asha, body: { name: 'Lunch', amount: 80, category: 'food' } });
  await settle();
  assert.equal(take(A).length, 0);
  await call('POST', '/api/transactions', { token: asha, body: { name: 'Dinner', amount: 60, category: 'food' } });
  await settle();
  got = take(A);
  assert.equal(got.length, 1);
  assert.equal(got[0].title, 'Food & Dining is over budget');
  await call('POST', '/api/transactions', { token: asha, body: { name: 'Snack', amount: 10, category: 'food' } });
  await settle();
  assert.equal(take(A).length, 0);

  // Expired subscriptions are cleaned up.
  dead.add(B);
  r = await call('POST', '/api/push/test', { token: ben });
  assert.equal(r.body.sent, 0);
  dead.delete(B);
  r = await call('POST', '/api/push/test', { token: ben });
  assert.equal(r.body.sent, 0, 'dead subscription was removed');

  // A device that switches accounts moves to the new user.
  await call('POST', '/api/push/subscribe', { token: ben, body: sub(A) });
  assert.equal((await call('POST', '/api/push/test', { token: asha })).body.sent, 0);
  assert.equal((await call('POST', '/api/push/test', { token: ben })).body.sent, 1);
});
