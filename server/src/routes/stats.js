const express = require('express');
const { db } = require('../db');
const { requireAuth, today, round2 } = require('../util');
const { userGroupBalances } = require('./groups');

const router = express.Router();
router.use(requireAuth());

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function daysIn(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function formatter(currency) {
  const nf = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
  return (n) => nf.format(n);
}

router.get('/summary', async (req, res) => {
  const uid = req.user.id;
  const fmt = formatter(req.user.currency);
  const t = today();
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : t.slice(0, 7);
  const prev = shiftMonth(month, -1);
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(shiftMonth(month, -i));

  const MONTH_TOTALS = `SELECT COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS spent,
            COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
            COUNT(CASE WHEN type='expense' THEN 1 END) AS count
     FROM transactions WHERE user_id = ? AND substr(date,1,7) = ?`;
  const BY_CATEGORY = `SELECT t.category AS slug, c.name, c.color, c.icon, c.budget, SUM(t.amount) AS total, COUNT(*) AS count
     FROM transactions t LEFT JOIN categories c ON c.user_id = t.user_id AND c.slug = t.category
     WHERE t.user_id = ? AND t.type='expense' AND substr(t.date,1,7) = ?
     GROUP BY t.category ORDER BY total DESC`;

  // Independent queries run in parallel — matters when the database is remote (Turso).
  const [cur, last, byCategory, prevCats, dailyRows, prevDaily, trendRows, topMerchants, recent, lending, lendingItems, groups] =
    await Promise.all([
      db.get(MONTH_TOTALS, uid, month),
      db.get(MONTH_TOTALS, uid, prev),
      db.all(BY_CATEGORY, uid, month),
      db.all(BY_CATEGORY, uid, prev),
      db.all(
        `SELECT date, SUM(amount) AS total FROM transactions
         WHERE user_id = ? AND type='expense' AND substr(date,1,7) = ? GROUP BY date`,
        uid, month
      ),
      db.all(
        `SELECT CAST(substr(date,9,2) AS INTEGER) AS day, SUM(amount) AS total FROM transactions
         WHERE user_id = ? AND type='expense' AND substr(date,1,7) = ? GROUP BY day`,
        uid, prev
      ),
      db.all(
        `SELECT substr(date,1,7) AS month,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS spent,
                SUM(CASE WHEN type='income' THEN amount ELSE 0 END) AS income
         FROM transactions WHERE user_id = ? AND substr(date,1,7) BETWEEN ? AND ? GROUP BY month`,
        uid, months[0], months[5]
      ),
      db.all(
        `SELECT name, SUM(amount) AS total, COUNT(*) AS count FROM transactions
         WHERE user_id = ? AND type='expense' AND substr(date,1,7) = ?
         GROUP BY lower(name) ORDER BY total DESC LIMIT 5`,
        uid, month
      ),
      db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 6', uid),
      db.get(
        `SELECT COALESCE(SUM(amount),0) AS outstanding, COUNT(*) AS count FROM transactions
         WHERE user_id = ? AND category = 'lending' AND type='expense' AND settled = 0`,
        uid
      ),
      db.all(
        `SELECT * FROM transactions WHERE user_id = ? AND category = 'lending' AND type='expense' AND settled = 0
         ORDER BY date DESC LIMIT 5`,
        uid
      ),
      userGroupBalances(uid),
    ]);

  const prevByCat = Object.fromEntries(prevCats.map((r) => [r.slug, r.total]));
  const dailyMap = Object.fromEntries(dailyRows.map((r) => [r.date, r.total]));
  const prevDailyMap = Object.fromEntries(prevDaily.map((r) => [r.day, r.total]));
  let cum = 0;
  let prevCum = 0;
  const isCurrentMonth = month === t.slice(0, 7);
  const lastDay = isCurrentMonth ? Number(t.slice(8, 10)) : daysIn(month);
  const daily = [];
  for (let d = 1; d <= daysIn(month); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const v = dailyMap[date] || 0;
    cum += v;
    prevCum += prevDailyMap[d] || 0;
    daily.push({ day: d, date, total: round2(v), cumulative: d <= lastDay ? round2(cum) : null, previous: round2(prevCum) });
  }

  const trendMap = Object.fromEntries(trendRows.map((r) => [r.month, r]));
  const trend = months.map((m) => ({ month: m, spent: round2(trendMap[m]?.spent || 0), income: round2(trendMap[m]?.income || 0) }));

  const daysElapsed = Math.max(1, lastDay);
  const dailyAvg = cur.spent / daysElapsed;
  const projected = isCurrentMonth ? dailyAvg * daysIn(month) : cur.spent;

  // Plain-language insights
  const insights = [];
  if (last.spent > 0) {
    const pct = ((cur.spent - last.spent) / last.spent) * 100;
    if (!isCurrentMonth || Math.abs(pct) >= 5) {
      insights.push({
        tone: pct > 0 ? 'warn' : 'good',
        text: isCurrentMonth
          ? `You've spent ${Math.abs(pct).toFixed(0)}% ${pct > 0 ? 'more' : 'less'} than all of last month so far.`
          : `Spending was ${Math.abs(pct).toFixed(0)}% ${pct > 0 ? 'higher' : 'lower'} than the month before.`,
      });
    }
  }
  for (const c of byCategory) {
    const p = prevByCat[c.slug];
    if (['lending', 'investment', 'rent'].includes(c.slug)) continue;
    if (p && c.total > p * 1.25 && c.total - p > cur.spent * 0.05) {
      insights.push({ tone: 'warn', text: `${c.name} is up ${(((c.total - p) / p) * 100).toFixed(0)}% versus last month.` });
      break;
    }
  }
  for (const c of byCategory) {
    if (c.budget && c.total > c.budget) {
      insights.push({ tone: 'bad', text: `${c.name} is over its budget by ${fmt(c.total - c.budget)}.` });
    }
  }
  if (req.user.monthly_budget && isCurrentMonth && projected > req.user.monthly_budget) {
    insights.push({ tone: 'warn', text: `At this pace you'll finish the month around ${fmt(projected)}, above your ${fmt(req.user.monthly_budget)} budget.` });
  }
  if (byCategory[0] && cur.spent > 0) {
    insights.push({ tone: 'info', text: `${byCategory[0].name} is your biggest category at ${((byCategory[0].total / cur.spent) * 100).toFixed(0)}% of spend.` });
  }

  res.json({
    month,
    currency: req.user.currency,
    totals: {
      spent: round2(cur.spent),
      income: round2(cur.income),
      net: round2(cur.income - cur.spent),
      count: cur.count,
      previousSpent: round2(last.spent),
      dailyAverage: round2(dailyAvg),
      projected: round2(projected),
      budget: req.user.monthly_budget,
    },
    byCategory: byCategory.map((c) => ({ ...c, total: round2(c.total), previous: round2(prevByCat[c.slug] || 0) })),
    daily,
    trend,
    topMerchants,
    recent,
    lending: { outstanding: round2(lending.outstanding), count: lending.count, items: lendingItems },
    groups,
    insights: insights.slice(0, 4),
  });
});

module.exports = router;
