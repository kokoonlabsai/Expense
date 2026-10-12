const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tally-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';

const app = require('../src/index');
const { computeShares, simplify } = require('../src/routes/groups');
const { parseDate } = require('../src/util');

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

async function call(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

test('date parsing handles automation formats', () => {
  assert.equal(parseDate('2026-03-05'), '2026-03-05');
  assert.equal(parseDate('2026-03-05T22:10:00'), '2026-03-05');
  assert.equal(parseDate('05/03/2026'), '2026-03-05');
  assert.equal(parseDate('12/25/2026'), '2026-12-25');
  assert.equal(parseDate('5 Mar 2026'), '2026-03-05');
  assert.equal(parseDate('Mar 5, 2026 at 10:30 PM'), '2026-03-05');
  assert.equal(parseDate('31/02/2026'), null);
});

test('split math always sums exactly', () => {
  const ids = new Set([1, 2, 3]);
  const eq = computeShares(100, 'equal', [], ids);
  assert.deepEqual(eq.map((s) => s.amount).sort(), [33.33, 33.33, 33.34]);
  const pct = computeShares(99.99, 'percent', [{ member_id: 1, value: 50 }, { member_id: 2, value: 50 }], ids);
  assert.equal(Math.round(pct.reduce((a, s) => a + s.amount, 0) * 100), 9999);
  assert.throws(() => computeShares(100, 'exact', [{ member_id: 1, value: 40 }], ids));
  const debts = simplify({ 1: 6000, 2: -3000, 3: -3000 });
  assert.deepEqual(debts, [{ from: 2, to: 1, amount: 30 }, { from: 3, to: 1, amount: 30 }]);
});

test('end-to-end: auth, automation API, filters, groups', async () => {
  let r = await call('POST', '/api/auth/signup', { body: { name: 'Asha', phone: '+91 98765 43210', password: 'secret1' } });
  assert.equal(r.status, 201);
  const token = r.body.token;
  assert.equal(r.body.user.phone, '+919876543210');

  r = await call('POST', '/api/auth/signup', { body: { name: 'Dup', phone: '+919876543210', password: 'secret1' } });
  assert.equal(r.status, 409);

  r = await call('POST', '/api/auth/login', { body: { phone: '+91-98765-43210', password: 'wrong' } });
  assert.equal(r.status, 401);
  r = await call('POST', '/api/auth/login', { body: { phone: '+91-98765-43210', password: 'secret1' } });
  assert.equal(r.status, 200);

  r = await call('POST', '/api/auth/keys', { token, body: { label: 'iPhone' } });
  assert.equal(r.status, 201);
  const key = r.body.key;
  assert.match(key, /^tly_/);

  // Automation: single item, aliases and loose formats
  r = await call('POST', '/api/v1/transactions', {
    headers: { 'x-api-key': key },
    body: { amount: '₹1,250.50', date: '05/10/2026', name: 'Electricity', category: 'Bills' },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.transaction.amount, 1250.5);
  assert.equal(r.body.transaction.category, 'bills');
  assert.equal(r.body.transaction.date, '2026-10-05');
  assert.equal(r.body.transaction.source, 'api');

  // Batch
  r = await call('POST', '/api/v1/transactions', {
    token: key,
    body: {
      transactions: [
        { amount: 500, date: '2026-10-06', name: 'Zara', category: 'shopping' },
        { amount: 2000, date: '2026-10-07', name: 'Rahul', category: 'lent', person: 'Rahul' },
        { amount: 300, date: '2026-09-20', name: 'Pizza', category: 'food' },
        { amount: 80, date: '2026-10-08', name: 'Mystery', category: 'unicorns' },
      ],
    },
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.count, 4);
  assert.equal(r.body.transactions[1].category, 'lending');
  assert.equal(r.body.transactions[3].category, 'other');
  assert.equal(r.body.warnings.length, 1);

  // Bad batch is all-or-nothing
  r = await call('POST', '/api/v1/transactions', { token: key, body: [{ amount: 10, name: 'ok' }, { amount: 'abc', name: 'bad' }] });
  assert.equal(r.status, 422);

  // API keys must not unlock the web session API
  r = await call('GET', '/api/transactions', { token: key });
  assert.equal(r.status, 401);

  // Filters
  r = await call('GET', '/api/transactions?category=lending,shopping', { token });
  assert.equal(r.body.items.length, 2);
  r = await call('GET', '/api/transactions?month=2026-09', { token });
  assert.equal(r.body.items.length, 1);
  r = await call('GET', '/api/transactions?from=2026-10-06&to=2026-10-07&sort=amount_desc', { token });
  assert.deepEqual(r.body.items.map((t) => t.name), ['Rahul', 'Zara']);
  r = await call('GET', '/api/transactions?q=elec', { token });
  assert.equal(r.body.items.length, 1);

  r = await call('GET', '/api/stats/summary?month=2026-10', { token });
  assert.equal(r.status, 200);
  assert.equal(r.body.totals.spent, 3830.5);
  assert.equal(r.body.lending.outstanding, 2000);

  // Second user to join a group by phone
  r = await call('POST', '/api/auth/signup', { body: { name: 'Ben', phone: '9000000001', password: 'secret2' } });
  const token2 = r.body.token;

  r = await call('POST', '/api/groups', {
    token,
    body: { name: 'Goa Trip', emoji: '🏖️', members: [{ name: 'Ben', phone: '9000000001' }, { name: 'Cara' }] },
  });
  assert.equal(r.status, 201);
  const gid = r.body.id;
  r = await call('GET', `/api/groups/${gid}`, { token });
  const [me, ben, cara] = r.body.members;
  assert.equal(ben.registered, true);
  assert.equal(cara.registered, false);

  r = await call('POST', `/api/groups/${gid}/expenses`, {
    token,
    body: { description: 'Villa', amount: 900, paid_by: me.id, split_type: 'equal', add_to_ledger: true, date: '2026-10-09', category: 'travel' },
  });
  assert.equal(r.status, 201);
  r = await call('POST', `/api/groups/${gid}/expenses`, {
    token: token2,
    body: { description: 'Dinner', amount: 300, paid_by: ben.id, split_type: 'exact', splits: [{ member_id: me.id, value: 100 }, { member_id: ben.id, value: 50 }, { member_id: cara.id, value: 150 }] },
  });
  assert.equal(r.status, 201);

  r = await call('GET', `/api/groups/${gid}`, { token: token2 });
  const bal = Object.fromEntries(r.body.members.map((m) => [m.name, m.balance]));
  assert.deepEqual(bal, { Asha: 500, Ben: -50, Cara: -450 });

  r = await call('POST', `/api/groups/${gid}/settlements`, { token, body: { from_member: cara.id, to_member: me.id, amount: 450 } });
  assert.equal(r.status, 201);
  r = await call('GET', `/api/groups/${gid}`, { token });
  assert.deepEqual(r.body.debts, [{ from: ben.id, to: me.id, amount: 50 }]);

  // My share landed in my personal ledger
  r = await call('GET', '/api/transactions?source=split', { token });
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].amount, 300);

  // Outsiders can't see the group
  r = await call('POST', '/api/auth/signup', { body: { name: 'Eve', phone: '9000000099', password: 'secret3' } });
  r = await call('GET', `/api/groups/${gid}`, { token: r.body.token });
  assert.equal(r.status, 404);
});
