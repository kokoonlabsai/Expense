const express = require('express');
const { db } = require('../db');
const crypto = require('crypto');
const { HttpError, requireAuth, normalizePhone, parseDate, parseAmount, round2, formatMoney } = require('../util');
const { notify, sendTo } = require('../push');
const { insertTransaction, resolveCategory } = require('../transactions');
const { deleteGroup } = require('../cleanup');

const router = express.Router();
router.use(requireAuth());

const groupUrl = (id) => `/splits/${id}`;
const firstName = (name) => String(name || '').split(' ')[0];

// ---------- helpers ----------

async function loadGroupForUser(groupId, userId) {
  const [group, me] = await Promise.all([
    db.get('SELECT * FROM groups WHERE id = ?', groupId),
    db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId),
  ]);
  if (!group || !me) throw new HttpError(404, 'Group not found');
  return { group, me };
}

/** Split `cents` across weights using the largest-remainder method so shares always sum exactly. */
function allocate(cents, weights) {
  const W = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (cents * w) / W);
  const base = raw.map(Math.floor);
  let rem = cents - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rem > 0; k = (k + 1) % order.length, rem--) base[order[k][1]]++;
  return base;
}

function computeShares(amount, splitType, splits, memberIds) {
  const cents = Math.round(amount * 100);
  const list = (Array.isArray(splits) ? splits : [])
    .map((s) => (typeof s === 'object' && s !== null ? s : { member_id: s }))
    .map((s) => ({ member_id: Number(s.member_id), value: s.value === undefined ? undefined : Number(s.value) }))
    .filter((s) => memberIds.has(s.member_id));

  const seen = new Set();
  for (const s of list) {
    if (seen.has(s.member_id)) throw new HttpError(422, 'Each person can appear only once in a split');
    seen.add(s.member_id);
  }

  if (splitType === 'equal') {
    const people = list.length ? list : [...memberIds].map((id) => ({ member_id: id }));
    const parts = allocate(cents, people.map(() => 1));
    return people.map((p, i) => ({ member_id: p.member_id, amount: parts[i] / 100 }));
  }

  const used = list.filter((s) => isFinite(s.value) && s.value > 0);
  if (!used.length) throw new HttpError(422, 'Add at least one person to the split');

  if (splitType === 'exact') {
    const sum = used.reduce((a, s) => a + Math.round(s.value * 100), 0);
    if (sum !== cents) {
      throw new HttpError(422, `Exact amounts add up to ${round2(sum / 100)}, but the expense is ${round2(amount)}`);
    }
    return used.map((s) => ({ member_id: s.member_id, amount: Math.round(s.value * 100) / 100 }));
  }
  if (splitType === 'percent') {
    const total = used.reduce((a, s) => a + s.value, 0);
    if (Math.abs(total - 100) > 0.01) throw new HttpError(422, `Percentages add up to ${round2(total)}%, they need to total 100%`);
  } else if (splitType !== 'shares') {
    throw new HttpError(422, 'split_type must be equal, exact, percent or shares');
  }
  const parts = allocate(cents, used.map((s) => s.value));
  return used.map((s, i) => ({ member_id: s.member_id, amount: parts[i] / 100 }));
}

/**
 * Net balance per member for several groups at once (4 queries total).
 * Positive = they are owed money, negative = they owe. Values in cents.
 */
async function balancesForGroups(groupIds) {
  const out = Object.fromEntries(groupIds.map((id) => [id, { members: [], cents: {} }]));
  if (!groupIds.length) return out;
  const inList = groupIds.map(() => '?').join(',');
  const [members, paid, owed, settles] = await Promise.all([
    db.all(`SELECT * FROM group_members WHERE group_id IN (${inList}) ORDER BY id`, ...groupIds),
    db.all(`SELECT paid_by AS id, SUM(amount) AS total FROM group_expenses WHERE group_id IN (${inList}) GROUP BY paid_by`, ...groupIds),
    db.all(
      `SELECT s.member_id AS id, SUM(s.amount) AS total FROM group_expense_shares s
       JOIN group_expenses e ON e.id = s.expense_id WHERE e.group_id IN (${inList}) GROUP BY s.member_id`,
      ...groupIds
    ),
    // Payments still waiting for the receiver's confirmation don't move balances.
    db.all(`SELECT * FROM settlements WHERE group_id IN (${inList}) AND status = 'confirmed'`, ...groupIds),
  ]);
  const cents = {};
  for (const m of members) {
    out[m.group_id].members.push(m);
    cents[m.id] = 0;
  }
  for (const p of paid) cents[p.id] = (cents[p.id] || 0) + Math.round(p.total * 100);
  for (const o of owed) cents[o.id] = (cents[o.id] || 0) - Math.round(o.total * 100);
  for (const st of settles) {
    const c = Math.round(st.amount * 100);
    cents[st.from_member] += c;
    cents[st.to_member] -= c;
  }
  for (const m of members) out[m.group_id].cents[m.id] = cents[m.id];
  return out;
}

async function balancesFor(groupId) {
  return (await balancesForGroups([groupId]))[groupId];
}

/** Greedy debt simplification — minimal-ish set of payments to settle everyone. */
function simplify(cents) {
  const creditors = [];
  const debtors = [];
  for (const [id, c] of Object.entries(cents)) {
    if (c > 0) creditors.push({ id: Number(id), c });
    else if (c < 0) debtors.push({ id: Number(id), c: -c });
  }
  creditors.sort((a, b) => b.c - a.c);
  debtors.sort((a, b) => b.c - a.c);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].c, creditors[j].c);
    if (x > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: x / 100 });
    debtors[i].c -= x;
    creditors[j].c -= x;
    if (debtors[i].c === 0) i++;
    if (creditors[j].c === 0) j++;
  }
  return out;
}

/** Groups the user belongs to, with their own member id. */
function myGroups(userId) {
  return db.all(
    `SELECT g.*, m.id AS me FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = ?
     ORDER BY g.id DESC`,
    userId
  );
}

/** Aggregated "you owe / you are owed" across all of a user's groups (used by the dashboard). */
async function userGroupBalances(userId) {
  const rows = await myGroups(userId);
  const balances = await balancesForGroups(rows.map((g) => g.id));
  let owed = 0;
  let owe = 0;
  const groups = rows.map((g) => {
    const b = (balances[g.id].cents[g.me] || 0) / 100;
    if (b > 0) owed += b;
    else owe += -b;
    return { id: g.id, name: g.name, emoji: g.emoji, balance: round2(b) };
  });
  return { owed: round2(owed), owe: round2(owe), groups };
}

const newToken = () => crypto.randomBytes(16).toString('base64url');

/** True when the two users already share at least one group. */
async function isContact(userId, otherId, q = db) {
  return !!(await q.get(
    `SELECT 1 FROM group_members a JOIN group_members b ON a.group_id = b.group_id
     WHERE a.user_id = ? AND b.user_id = ? LIMIT 1`,
    userId, otherId
  ));
}

/**
 * Add someone to a group. Accepts one of:
 *  - { user_id }  a Jellyfish user the requester already shares a group with (from people search)
 *  - { phone }    looked up among registered users; becomes a linked member if found
 *  - { name }     a placeholder person who gets a personal invite link to claim the spot
 */
async function addMember(groupId, { user_id, name, phone }, requesterId, q = db) {
  let user = null;
  let p = null;
  if (user_id) {
    if (Number(user_id) !== requesterId && !(await isContact(requesterId, Number(user_id), q))) {
      throw new HttpError(403, 'Search for this person by their phone number to add them');
    }
    user = await q.get('SELECT id, name, phone FROM users WHERE id = ?', Number(user_id));
    if (!user) throw new HttpError(404, 'That person no longer has an account');
    p = user.phone;
  } else if (phone) {
    p = normalizePhone(phone);
    if (!p) throw new HttpError(422, `"${phone}" isn't a valid phone number`);
    user = await q.get('SELECT id, name, phone FROM users WHERE phone = ?', p);
  }
  const display = String(name || '').trim() || user?.name;
  if (!display) throw new HttpError(422, 'Each member needs a name or a phone number');
  const dup = user
    ? await q.get('SELECT 1 FROM group_members WHERE group_id = ? AND (user_id = ? OR phone = ?)', groupId, user.id, p)
    : p && (await q.get('SELECT 1 FROM group_members WHERE group_id = ? AND phone = ?', groupId, p));
  if (dup) throw new HttpError(409, `${user?.name || display} is already in this group`);
  const info = await q.run(
    'INSERT INTO group_members (group_id, name, phone, user_id, invite_token) VALUES (?, ?, ?, ?, ?)',
    groupId, (user?.name || display).slice(0, 60), p, user?.id || null, user ? null : newToken()
  );
  return q.get('SELECT id, group_id, name, phone, user_id, invite_token FROM group_members WHERE id = ?', info.lastInsertRowid);
}

// ---------- routes ----------

router.get('/', async (req, res) => {
  const groups = await myGroups(req.user.id);
  const ids = groups.map((g) => g.id);
  const [balances, totals, pending] = await Promise.all([
    balancesForGroups(ids),
    ids.length
      ? db.all(
          `SELECT group_id, COALESCE(SUM(amount),0) AS t, COUNT(*) AS n FROM group_expenses
           WHERE group_id IN (${ids.map(() => '?').join(',')}) GROUP BY group_id`,
          ...ids
        )
      : [],
    db.all(
      `SELECT s.group_id, COUNT(*) AS n FROM settlements s JOIN group_members m ON m.id = s.to_member
       WHERE m.user_id = ? AND s.status = 'pending' GROUP BY s.group_id`,
      req.user.id
    ),
  ]);
  const totalBy = Object.fromEntries(totals.map((r) => [r.group_id, r]));
  const pendingBy = Object.fromEntries(pending.map((r) => [r.group_id, r.n]));
  res.json({
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      created_at: g.created_at,
      members: balances[g.id].members.map((m) => ({ id: m.id, name: m.name })),
      my_balance: round2((balances[g.id].cents[g.me] || 0) / 100),
      total: round2(totalBy[g.id]?.t || 0),
      expense_count: totalBy[g.id]?.n || 0,
      to_confirm: pendingBy[g.id] || 0,
    })),
  });
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new HttpError(422, 'Give your group a name', { name: 'Required' });
  const emoji = String(req.body?.emoji || '✨').slice(0, 8);
  const members = Array.isArray(req.body?.members) ? req.body.members : [];
  const added = [];
  const id = await db.tx(async (t) => {
    const info = await t.run('INSERT INTO groups (name, emoji, created_by) VALUES (?, ?, ?)', name.slice(0, 60), emoji, req.user.id);
    const gid = info.lastInsertRowid;
    await t.run('INSERT INTO group_members (group_id, name, phone, user_id) VALUES (?, ?, ?, ?)', gid, req.user.name, req.user.phone, req.user.id);
    for (const m of members) {
      if (!m || (!m.name && !m.phone && !m.user_id)) continue;
      if (Number(m.user_id) === req.user.id || (m.phone && normalizePhone(m.phone) === req.user.phone)) continue;
      const member = await addMember(gid, m, req.user.id, t);
      if (member.user_id) added.push(member.user_id);
    }
    return gid;
  });
  notify(added, {
    title: `${emoji} ${name}`,
    body: `${req.user.name} added you to the group`,
    url: groupUrl(id),
    tag: `group-${id}`,
  });
  res.status(201).json({ id });
});

router.get('/:id', async (req, res) => {
  const { group, me } = await loadGroupForUser(req.params.id, req.user.id);
  const [{ members, cents }, expenses, shares, settlements] = await Promise.all([
    balancesFor(group.id),
    db.all('SELECT * FROM group_expenses WHERE group_id = ? ORDER BY date DESC, id DESC', group.id),
    db.all('SELECT s.* FROM group_expense_shares s JOIN group_expenses e ON e.id = s.expense_id WHERE e.group_id = ?', group.id),
    db.all('SELECT * FROM settlements WHERE group_id = ? ORDER BY date DESC, id DESC', group.id),
  ]);
  const byExpense = {};
  for (const sh of shares) (byExpense[sh.expense_id] ||= []).push({ member_id: sh.member_id, amount: sh.amount });
  const total = expenses.reduce((a, e) => a + e.amount, 0);

  res.json({
    group: { ...group, is_owner: group.created_by === req.user.id },
    me: me.id,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      phone: m.phone,
      user_id: m.user_id,
      registered: !!m.user_id,
      is_me: m.id === me.id,
      balance: (cents[m.id] || 0) / 100,
    })),
    expenses: expenses.map((e) => ({ ...e, shares: byExpense[e.id] || [] })),
    settlements,
    debts: simplify(cents),
    total: round2(total),
  });
});

router.patch('/:id', async (req, res) => {
  const { group } = await loadGroupForUser(req.params.id, req.user.id);
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 60) || group.name : group.name;
  const emoji = req.body?.emoji ? String(req.body.emoji).slice(0, 8) : group.emoji;
  await db.run('UPDATE groups SET name = ?, emoji = ? WHERE id = ?', name, emoji, group.id);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const { group } = await loadGroupForUser(req.params.id, req.user.id);
  if (group.created_by !== req.user.id) throw new HttpError(403, 'Only the person who created the group can delete it');
  await deleteGroup(group.id);
  res.status(204).end();
});

router.post('/:id/members', async (req, res) => {
  const { group } = await loadGroupForUser(req.params.id, req.user.id);
  const m = await addMember(group.id, req.body || {}, req.user.id);
  if (m.user_id) {
    notify([m.user_id], { title: `${group.emoji} ${group.name}`, body: `${req.user.name} added you to the group`, url: groupUrl(group.id), tag: `group-${group.id}` });
  }
  res.status(201).json({ member: { id: m.id, name: m.name, registered: !!m.user_id, invite_token: m.invite_token } });
});

/** Shareable link that lets anyone with it join the group. */
router.post('/:id/invite', async (req, res) => {
  const { group } = await loadGroupForUser(req.params.id, req.user.id);
  let token = group.invite_token;
  if (!token) {
    token = newToken();
    await db.run('UPDATE groups SET invite_token = ? WHERE id = ?', token, group.id);
  }
  res.json({ token });
});

/** Personal link for a placeholder member: whoever opens it takes over that spot (and its history). */
router.post('/:id/members/:mid/invite', async (req, res) => {
  const { group } = await loadGroupForUser(req.params.id, req.user.id);
  const m = await db.get('SELECT * FROM group_members WHERE id = ? AND group_id = ?', req.params.mid, group.id);
  if (!m) throw new HttpError(404, 'Member not found');
  if (m.user_id) throw new HttpError(400, `${m.name} is already on Jellyfish and can see this group`);
  let token = m.invite_token;
  if (!token) {
    token = newToken();
    await db.run('UPDATE group_members SET invite_token = ? WHERE id = ?', token, m.id);
  }
  res.json({ token, name: m.name });
});

router.delete('/:id/members/:mid', async (req, res) => {
  const { group, me } = await loadGroupForUser(req.params.id, req.user.id);
  const mid = Number(req.params.mid);
  if (mid === me.id) throw new HttpError(400, "You can't remove yourself");
  const used = await db.get(
    `SELECT 1 FROM group_expenses WHERE group_id = ? AND paid_by = ?
     UNION ALL SELECT 1 FROM group_expense_shares WHERE member_id = ?
     UNION ALL SELECT 1 FROM settlements WHERE from_member = ? OR to_member = ? LIMIT 1`,
    group.id, mid, mid, mid, mid
  );
  if (used) throw new HttpError(400, 'This person is part of existing expenses or settlements');
  await db.run('DELETE FROM group_members WHERE id = ? AND group_id = ?', mid, group.id);
  res.status(204).end();
});

router.post('/:id/expenses', async (req, res) => {
  const { group, me } = await loadGroupForUser(req.params.id, req.user.id);
  const b = req.body || {};
  const description = String(b.description || '').trim();
  const amount = parseAmount(b.amount);
  const date = parseDate(b.date);
  const errors = {};
  if (!description) errors.description = 'What was it for?';
  if (!amount || amount <= 0) errors.amount = 'Enter an amount';
  if (!date) errors.date = 'Invalid date';
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', errors);

  const members = await db.all('SELECT id FROM group_members WHERE group_id = ?', group.id);
  const memberIds = new Set(members.map((m) => m.id));
  const paidBy = Number(b.paid_by || me.id);
  if (!memberIds.has(paidBy)) throw new HttpError(422, 'Payer must be a group member');
  const splitType = b.split_type || 'equal';
  const shares = computeShares(amount, splitType, b.splits, memberIds);
  if (!shares.length) throw new HttpError(422, 'Add at least one person to the split');
  const category = (await resolveCategory(req.user.id, b.category || 'other')).slug;

  const id = await db.tx(async (t) => {
    const info = await t.run(
      `INSERT INTO group_expenses (group_id, description, amount, paid_by, split_type, category, date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      group.id, description.slice(0, 140), round2(amount), paidBy, splitType, category, date, req.user.id
    );
    for (const sh of shares) {
      await t.run('INSERT INTO group_expense_shares (expense_id, member_id, amount) VALUES (?, ?, ?)', info.lastInsertRowid, sh.member_id, sh.amount);
    }

    // Optionally record *my share* in my personal ledger so the dashboard reflects real spend.
    const mine = shares.find((sh) => sh.member_id === me.id);
    if (b.add_to_ledger && mine && mine.amount > 0) {
      await insertTransaction(
        req.user.id,
        {
          name: `${description} · ${group.name}`,
          amount: mine.amount,
          type: 'expense',
          category,
          date,
          note: `Your share of ${round2(amount)} split in ${group.name}`,
          group_expense_id: info.lastInsertRowid,
        },
        'split',
        t
      );
    }
    return info.lastInsertRowid;
  });
  // Tell everyone with a share (except whoever added it) what they owe for this.
  const linked = await db.all('SELECT id, user_id FROM group_members WHERE group_id = ? AND user_id IS NOT NULL', group.id);
  const payer = await db.get('SELECT name, user_id FROM group_members WHERE id = ?', paidBy);
  for (const m of linked) {
    const share = shares.find((sh) => sh.member_id === m.id)?.amount || 0;
    if (m.user_id === req.user.id || (share <= 0 && m.id !== paidBy)) continue;
    const who = payer.user_id === m.user_id ? 'you' : firstName(payer.name);
    notify([m.user_id], {
      title: `${group.emoji} ${group.name}`,
      body: `${firstName(req.user.name)} added "${description}" (${formatMoney(amount, req.user.currency)}, paid by ${who})${
        share > 0 && payer.user_id !== m.user_id ? ` · your share ${formatMoney(share, req.user.currency)}` : ''
      }`,
      url: groupUrl(group.id),
      tag: `group-${group.id}`,
    });
  }
  res.status(201).json({ id });
});

router.delete('/:id/expenses/:eid', async (req, res) => {
  const { group } = await loadGroupForUser(req.params.id, req.user.id);
  const e = await db.get('SELECT * FROM group_expenses WHERE id = ? AND group_id = ?', req.params.eid, group.id);
  if (!e) throw new HttpError(404, 'Expense not found');
  await db.batch([
    ['DELETE FROM transactions WHERE group_expense_id = ?', e.id],
    ['DELETE FROM group_expense_shares WHERE expense_id = ?', e.id],
    ['DELETE FROM group_expenses WHERE id = ?', e.id],
  ]);
  res.status(204).end();
});

router.post('/:id/settlements', async (req, res) => {
  const { group } = await loadGroupForUser(req.params.id, req.user.id);
  const b = req.body || {};
  const from = Number(b.from_member);
  const to = Number(b.to_member);
  const amount = parseAmount(b.amount);
  const date = parseDate(b.date);
  const members = await db.all('SELECT id, user_id, name FROM group_members WHERE group_id = ?', group.id);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  if (!byId[from] || !byId[to] || from === to) throw new HttpError(422, 'Pick two different group members');
  if (!amount || amount <= 0) throw new HttpError(422, 'Enter an amount');
  if (!date) throw new HttpError(422, 'Invalid date');
  // The receiver confirms money they got, unless they're the one recording it or aren't on Jellyfish.
  const receiver = byId[to];
  const status = receiver.user_id && receiver.user_id !== req.user.id ? 'pending' : 'confirmed';
  const info = await db.run(
    'INSERT INTO settlements (group_id, from_member, to_member, amount, date, note, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    group.id, from, to, round2(amount), date, b.note ? String(b.note).slice(0, 200) : null, status, req.user.id
  );
  const amt = formatMoney(amount, req.user.currency);
  if (status === 'pending') {
    notify([receiver.user_id], {
      title: 'Did you get paid?',
      body: `${req.user.name} says they paid you ${amt} in ${group.name}. Tap to confirm.`,
      url: groupUrl(group.id),
      tag: `settle-${info.lastInsertRowid}`,
    });
  } else if (byId[from].user_id && byId[from].user_id !== req.user.id) {
    notify([byId[from].user_id], {
      title: 'Payment recorded ✓',
      body: `${firstName(req.user.name)} recorded your ${amt} payment in ${group.name}.`,
      url: groupUrl(group.id),
      tag: `settle-${info.lastInsertRowid}`,
    });
  }
  res.status(201).json({ id: info.lastInsertRowid, status, awaiting: status === 'pending' ? receiver.name : null });
});

async function loadSettlement(req) {
  const { group, me } = await loadGroupForUser(req.params.id, req.user.id);
  const st = await db.get('SELECT * FROM settlements WHERE id = ? AND group_id = ?', req.params.sid, group.id);
  if (!st) throw new HttpError(404, 'Payment not found');
  return { group, me, st };
}

router.post('/:id/settlements/:sid/confirm', async (req, res) => {
  const { group, me, st } = await loadSettlement(req);
  if (st.to_member !== me.id) throw new HttpError(403, 'Only the person who received the money can confirm it');
  await db.run("UPDATE settlements SET status = 'confirmed' WHERE id = ?", st.id);
  const payer = await db.get('SELECT user_id FROM group_members WHERE id = ?', st.from_member);
  notify([st.created_by, payer?.user_id].filter((u) => u && u !== req.user.id), {
    title: 'Payment confirmed ✓',
    body: `${firstName(req.user.name)} confirmed your ${formatMoney(st.amount, req.user.currency)} payment in ${group.name}.`,
    url: groupUrl(group.id),
    tag: `settle-${st.id}`,
  });
  res.json({ ok: true });
});

// Delete a payment, or reject one that's awaiting your confirmation.
router.delete('/:id/settlements/:sid', async (req, res) => {
  const { group, me, st } = await loadSettlement(req);
  const allowed = [st.from_member, st.to_member].includes(me.id) || st.created_by === req.user.id || group.created_by === req.user.id;
  if (!allowed) throw new HttpError(403, 'Only the people involved can remove this payment');
  await db.run('DELETE FROM settlements WHERE id = ?', st.id);
  if (st.status === 'pending' && st.to_member === me.id && st.created_by && st.created_by !== req.user.id) {
    notify([st.created_by], {
      title: 'Payment not received',
      body: `${firstName(req.user.name)} says they didn't receive your ${formatMoney(st.amount, req.user.currency)} payment in ${group.name}.`,
      url: groupUrl(group.id),
      tag: `settle-${st.id}`,
    });
  }
  res.status(204).end();
});

const lastReminder = new Map();

/** Nudge someone who owes you. Returns how many of their devices were notified (0 = share a message instead). */
router.post('/:id/remind', async (req, res) => {
  const { group, me } = await loadGroupForUser(req.params.id, req.user.id);
  const target = await db.get('SELECT * FROM group_members WHERE id = ? AND group_id = ?', Number(req.body?.member_id), group.id);
  if (!target || target.id === me.id) throw new HttpError(422, 'Pick someone in this group');
  if (!target.user_id) return res.json({ sent: 0 });
  const key = `${me.id}:${target.id}`;
  if (Date.now() - (lastReminder.get(key) || 0) < 10 * 60_000) throw new HttpError(429, 'You just reminded them — give it a few minutes');
  lastReminder.set(key, Date.now());
  const amount = parseAmount(req.body?.amount);
  const sent = await sendTo([target.user_id], {
    title: `${group.emoji} ${group.name}`,
    body: `${firstName(req.user.name)} sent a friendly reminder${amount ? `: you owe ${formatMoney(amount, req.user.currency)}` : ''}. Tap to settle up.`,
    url: groupUrl(group.id),
    tag: `remind-${group.id}`,
  });
  res.json({ sent });
});

module.exports = router;
module.exports.userGroupBalances = userGroupBalances;
module.exports.addMember = addMember;
module.exports.computeShares = computeShares;
module.exports.simplify = simplify;
