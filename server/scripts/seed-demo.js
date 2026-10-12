/**
 * Creates a demo account with ~4 months of realistic data.
 *   phone: +910000000000   password: demo1234
 * Re-running resets the demo account.
 */
const bcrypt = require('bcryptjs');
const { db, seedCategories } = require('../src/db');
const { toISODate } = require('../src/util');

const PHONE = '+910000000000';
const FRIENDS = [
  { name: 'Riya Sharma', phone: '+910000000001' },
  { name: 'Kabir Mehta', phone: '+910000000002' },
];

db.prepare('DELETE FROM users WHERE phone IN (?, ?, ?)').run(PHONE, FRIENDS[0].phone, FRIENDS[1].phone);
db.prepare("DELETE FROM groups WHERE id NOT IN (SELECT group_id FROM group_members WHERE user_id IS NOT NULL)").run();

const hash = bcrypt.hashSync('demo1234', 10);
const uid = db
  .prepare('INSERT INTO users (name, phone, password_hash, currency, monthly_budget) VALUES (?, ?, ?, ?, ?)')
  .run('Aarav Kapoor', PHONE, hash, 'INR', 60000).lastInsertRowid;
seedCategories(uid);
db.prepare("UPDATE categories SET budget = 9000 WHERE user_id = ? AND slug = 'food'").run(uid);
db.prepare("UPDATE categories SET budget = 8000 WHERE user_id = ? AND slug = 'shopping'").run(uid);
db.prepare("UPDATE categories SET budget = 4000 WHERE user_id = ? AND slug = 'lifestyle'").run(uid);
for (const f of FRIENDS) {
  const id = db.prepare('INSERT INTO users (name, phone, password_hash) VALUES (?, ?, ?)').run(f.name, f.phone, hash).lastInsertRowid;
  seedCategories(id);
  f.id = id;
}

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rand() * a.length)];
const between = (a, b) => Math.round(a + rand() * (b - a));

const POOLS = {
  food: [['Blue Tokai Coffee', 180, 450], ['Swiggy', 250, 900], ['Zomato', 300, 1100], ['Toit Brewpub', 1200, 3200], ['Third Wave Coffee', 200, 420], ['Truffles', 450, 1200]],
  groceries: [['BigBasket', 800, 3200], ['Zepto', 250, 1100], ['Nature’s Basket', 600, 2200]],
  shopping: [['Amazon', 499, 4500], ['Myntra', 899, 3999], ['Uniqlo', 1490, 4990], ['Nykaa', 450, 2200]],
  transport: [['Uber', 180, 650], ['Ola', 150, 520], ['Indian Oil', 1500, 3200], ['Namma Metro', 40, 120]],
  entertainment: [['BookMyShow', 450, 1400], ['PVR Cinemas', 600, 1500], ['Steam', 300, 1800]],
  lifestyle: [['Cult.fit', 1200, 2500], ['Urban Company', 600, 2400], ['Toni&Guy', 900, 1800]],
  health: [['Apollo Pharmacy', 200, 1400], ['Practo Consult', 500, 900]],
};
const RECURRING = [
  { day: 1, name: 'Rent — Indiranagar flat', category: 'rent', amount: 28000 },
  { day: 5, name: 'BESCOM Electricity', category: 'bills', amount: [1400, 2600] },
  { day: 7, name: 'Airtel Fiber', category: 'bills', amount: 1178 },
  { day: 9, name: 'Jio Postpaid', category: 'bills', amount: 599 },
  { day: 12, name: 'Netflix', category: 'subscriptions', amount: 649 },
  { day: 14, name: 'Spotify', category: 'subscriptions', amount: 119 },
  { day: 10, name: 'Mutual fund SIP', category: 'investment', amount: 10000 },
];

const ins = db.prepare(
  `INSERT INTO transactions (user_id, name, amount, type, category, date, note, counterparty, settled, source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);

db.transaction(() => {
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d);
    const dom = d.getDate();
    if (dom === 1) ins.run(uid, 'Salary — Acme Corp', 145000, 'income', 'income', iso, null, null, 0, 'api');
    for (const r of RECURRING) {
      if (r.day === dom) {
        const amt = Array.isArray(r.amount) ? between(...r.amount) : r.amount;
        ins.run(uid, r.name, amt, 'expense', r.category, iso, null, null, 0, rand() > 0.5 ? 'api' : 'manual');
      }
    }
    const n = between(0, 3);
    for (let i = 0; i < n; i++) {
      const cat = pick(['food', 'food', 'food', 'groceries', 'transport', 'transport', 'shopping', 'entertainment', 'lifestyle', 'health']);
      if (rand() > 0.75 && ['shopping', 'entertainment', 'lifestyle', 'health'].includes(cat)) continue;
      const [name, lo, hi] = pick(POOLS[cat]);
      ins.run(uid, name, between(lo, hi), 'expense', cat, iso, null, null, 0, rand() > 0.4 ? 'api' : 'manual');
    }
  }
  const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return toISODate(d); };
  ins.run(uid, 'Bike repair loan', 5000, 'expense', 'lending', ago(9), 'Will return next month', 'Kabir', 0, 'manual');
  ins.run(uid, 'Concert tickets', 2400, 'expense', 'lending', ago(4), null, 'Riya', 0, 'manual');
  ins.run(uid, 'Cab fare', 650, 'expense', 'lending', ago(40), null, 'Dev', 1, 'manual');
  ins.run(uid, 'Amazon refund', 1299, 'income', 'income', ago(6), null, null, 0, 'api');

  // A group trip with splits & a settlement
  const gid = db.prepare('INSERT INTO groups (name, emoji, created_by) VALUES (?, ?, ?)').run('Goa Long Weekend', '🏖️', uid).lastInsertRowid;
  const addM = db.prepare('INSERT INTO group_members (group_id, name, phone, user_id) VALUES (?, ?, ?, ?)');
  const me = addM.run(gid, 'Aarav Kapoor', PHONE, uid).lastInsertRowid;
  const riya = addM.run(gid, FRIENDS[0].name, FRIENDS[0].phone, FRIENDS[0].id).lastInsertRowid;
  const kabir = addM.run(gid, FRIENDS[1].name, FRIENDS[1].phone, FRIENDS[1].id).lastInsertRowid;
  const tara = addM.run(gid, 'Tara', null, null).lastInsertRowid;
  const people = [me, riya, kabir, tara];
  const addE = db.prepare('INSERT INTO group_expenses (group_id, description, amount, paid_by, split_type, category, date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const addS = db.prepare('INSERT INTO group_expense_shares (expense_id, member_id, amount) VALUES (?, ?, ?)');
  const equal = (desc, amt, payer, cat, date) => {
    const e = addE.run(gid, desc, amt, payer, 'equal', cat, date, uid).lastInsertRowid;
    for (const p of people) addS.run(e, p, amt / people.length);
  };
  equal('Villa in Assagao', 24000, me, 'travel', ago(12));
  equal('Scooter rentals', 3200, kabir, 'transport', ago(11));
  equal('Dinner at Thalassa', 8400, riya, 'food', ago(11));
  const e = addE.run(gid, 'Parasailing', 6000, me, 'exact', 'entertainment', ago(10), uid).lastInsertRowid;
  addS.run(e, me, 1500); addS.run(e, riya, 1500); addS.run(e, kabir, 3000);
  db.prepare('INSERT INTO settlements (group_id, from_member, to_member, amount, date, note) VALUES (?, ?, ?, ?, ?, ?)').run(gid, tara, me, 4000, ago(5), 'UPI');

  const g2 = db.prepare('INSERT INTO groups (name, emoji, created_by) VALUES (?, ?, ?)').run('Flat 4B', '🏠', FRIENDS[0].id).lastInsertRowid;
  const r2 = addM.run(g2, FRIENDS[0].name, FRIENDS[0].phone, FRIENDS[0].id).lastInsertRowid;
  const m2 = addM.run(g2, 'Aarav Kapoor', PHONE, uid).lastInsertRowid;
  const e2 = addE.run(g2, 'Cook — monthly', 6000, r2, 'equal', 'bills', ago(3), FRIENDS[0].id).lastInsertRowid;
  addS.run(e2, r2, 3000); addS.run(e2, m2, 3000);
})();

console.log('Demo account ready → phone +91 00000 00000, password demo1234');
