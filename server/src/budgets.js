/** Budget alerts: notify a user the moment an expense pushes them over a category or monthly budget. */
const { db } = require('./db');
const { today, formatMoney } = require('./util');
const { notify } = require('./push');

async function checkBudgets(user, transactions) {
  const month = today().slice(0, 7);
  const added = transactions.filter((t) => t.type === 'expense' && t.date.slice(0, 7) === month);
  if (!added.length) return;
  const addedTotal = added.reduce((a, t) => a + t.amount, 0);
  const byCat = {};
  for (const t of added) byCat[t.category] = (byCat[t.category] || 0) + t.amount;

  const [cats, total] = await Promise.all([
    db.all(
      `SELECT c.slug, c.name, c.budget, COALESCE(SUM(t.amount), 0) AS spent FROM categories c
       LEFT JOIN transactions t ON t.user_id = c.user_id AND t.category = c.slug AND t.type = 'expense' AND substr(t.date,1,7) = ?
       WHERE c.user_id = ? AND c.budget > 0 AND c.slug IN (${Object.keys(byCat).map(() => '?').join(',')})
       GROUP BY c.slug`,
      month, user.id, ...Object.keys(byCat)
    ),
    user.monthly_budget
      ? db.get(`SELECT COALESCE(SUM(amount), 0) AS spent FROM transactions WHERE user_id = ? AND type = 'expense' AND substr(date,1,7) = ?`, user.id, month)
      : null,
  ]);

  const fmt = (n) => formatMoney(n, user.currency);
  for (const c of cats) {
    // Only when *this* expense crossed the line, so you're told once, not on every purchase after.
    if (c.spent > c.budget && c.spent - byCat[c.slug] <= c.budget) {
      notify([user.id], {
        title: `${c.name} is over budget`,
        body: `You've spent ${fmt(c.spent)} of your ${fmt(c.budget)} ${c.name.toLowerCase()} budget this month.`,
        url: `/transactions?category=${c.slug}&month=${month}`,
        tag: `budget-${c.slug}`,
      });
    }
  }
  if (total && total.spent > user.monthly_budget && total.spent - addedTotal <= user.monthly_budget) {
    notify([user.id], {
      title: 'Monthly budget reached',
      body: `You've spent ${fmt(total.spent)} this month, over your ${fmt(user.monthly_budget)} budget.`,
      url: '/',
      tag: 'budget-month',
    });
  }
}

/** Fire-and-forget wrapper used by the routes. */
function afterExpenses(user, transactions) {
  checkBudgets(user, transactions).catch((e) => console.warn('[budgets]', e.message));
}

module.exports = { checkBudgets, afterExpenses };
