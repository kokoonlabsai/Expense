const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tally-splits-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret';
const app = require('../src/index');

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
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const signup = async (name, phone) =>
  (await call('POST', '/api/auth/signup', { body: { name, phone, password: 'secret1' } })).body.token;

test('people search, invites and confirmed settle-ups', async () => {
  const asha = await signup('Asha', '+919800000001');
  const ben = await signup('Ben', '+919800000002');
  const cara = await signup('Cara', '+919800000003');

  // Logging in works with or without the country code.
  let login = await call('POST', '/api/auth/login', { body: { phone: '98000 00002', password: 'secret1' } });
  assert.equal(login.status, 200);

  // Strangers are only found by their full number, never by name.
  let r = await call('GET', '/api/people?q=Ben', { token: asha });
  assert.equal(r.body.people.length, 0);
  r = await call('GET', '/api/people?q=98000 00002', { token: asha });
  assert.equal(r.body.people.length, 1);
  assert.equal(r.body.people[0].name, 'Ben');
  assert.equal(r.body.people[0].known, false);
  assert.equal(r.body.people[0].phone_hint, '•••• 0002');
  const benPhone = r.body.people[0].phone;

  // Adding a stranger by user id (without knowing their number) is refused.
  r = await call('POST', '/api/groups', { token: asha, body: { name: 'Trip', members: [{ user_id: 2 }] } });
  assert.equal(r.status, 403);

  r = await call('POST', '/api/groups', { token: asha, body: { name: 'Trip', members: [{ phone: benPhone }, { name: 'Dev' }] } });
  assert.equal(r.status, 201);
  const gid = r.body.id;

  // Ben now sees the group automatically, and is a known contact for Asha.
  r = await call('GET', '/api/groups', { token: ben });
  assert.equal(r.body.groups[0].id, gid);
  r = await call('GET', '/api/people?q=be', { token: asha });
  assert.equal(r.body.people[0].known, true);
  assert.equal(r.body.people[0].phone, undefined);

  r = await call('GET', `/api/groups/${gid}`, { token: asha });
  const [me, benM, dev] = r.body.members;
  assert.equal(dev.registered, false);

  r = await call('POST', `/api/groups/${gid}/expenses`, { token: asha, body: { description: 'Hotel', amount: 900, paid_by: me.id } });
  assert.equal(r.status, 201);

  // Ben records that he paid Asha → waits for Asha's confirmation, balances unchanged.
  r = await call('POST', `/api/groups/${gid}/settlements`, { token: ben, body: { from_member: benM.id, to_member: me.id, amount: 300 } });
  assert.equal(r.body.status, 'pending');
  assert.equal(r.body.awaiting, 'Asha');
  const sid = r.body.id;
  r = await call('GET', '/api/groups', { token: asha });
  assert.equal(r.body.groups[0].to_confirm, 1);
  assert.equal(r.body.groups[0].my_balance, 600);
  r = await call('POST', `/api/groups/${gid}/settlements/${sid}/confirm`, { token: ben });
  assert.equal(r.status, 403);
  r = await call('POST', `/api/groups/${gid}/settlements/${sid}/confirm`, { token: asha });
  assert.equal(r.status, 200);
  r = await call('GET', '/api/groups', { token: asha });
  assert.equal(r.body.groups[0].my_balance, 300);
  assert.equal(r.body.groups[0].to_confirm, 0);

  // Asha (the receiver) records Dev's cash → confirmed straight away.
  r = await call('POST', `/api/groups/${gid}/settlements`, { token: asha, body: { from_member: dev.id, to_member: me.id, amount: 100 } });
  assert.equal(r.body.status, 'confirmed');

  // Personal invite for Dev: Cara opens it and takes over Dev's spot with its history.
  r = await call('POST', `/api/groups/${gid}/members/${benM.id}/invite`, { token: asha });
  assert.equal(r.status, 400);
  r = await call('POST', `/api/groups/${gid}/members/${dev.id}/invite`, { token: asha });
  const devToken = r.body.token;
  r = await call('GET', `/api/invites/${devToken}`);
  assert.equal(r.body.kind, 'member');
  assert.equal(r.body.invited_as, 'Dev');
  assert.equal(r.body.group.name, 'Trip');
  r = await call('POST', `/api/invites/${devToken}/accept`);
  assert.equal(r.status, 401);
  r = await call('POST', `/api/invites/${devToken}/accept`, { token: cara });
  assert.equal(r.body.group_id, gid);
  r = await call('GET', `/api/groups/${gid}`, { token: cara });
  const caraM = r.body.members.find((m) => m.is_me);
  assert.equal(caraM.id, dev.id);
  assert.equal(caraM.name, 'Cara');
  assert.equal(caraM.balance, -200);
  r = await call('GET', `/api/invites/${devToken}`);
  assert.equal(r.status, 404);

  // Group link: a brand-new user joins as a new member.
  r = await call('POST', `/api/groups/${gid}/invite`, { token: ben });
  const groupToken = r.body.token;
  const eve = await signup('Eve', '+919800000005');
  r = await call('POST', `/api/invites/${groupToken}/accept`, { token: eve });
  assert.equal(r.body.group_id, gid);
  r = await call('POST', `/api/invites/${groupToken}/accept`, { token: eve });
  assert.equal(r.body.already, true);
  r = await call('GET', `/api/groups/${gid}`, { token: eve });
  assert.equal(r.body.members.length, 4);

  // Only people involved can delete a payment.
  r = await call('DELETE', `/api/groups/${gid}/settlements/${sid}`, { token: eve });
  assert.equal(r.status, 403);
});
