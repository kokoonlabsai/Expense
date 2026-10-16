import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, HandCoins, Lightbulb, Plus, TrendingUp, Users, Wallet, CalendarDays,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { dayLabel, money, monthLabel, monthShort, shiftMonth, shortDate, thisMonth, tint } from '../lib/format';
import { TxRow } from '../components/TransactionModal';
import { CatIcon, Empty, Money } from '../components/ui';
import AppNudge from '../components/AppNudge';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const { user, version, openTx, currency, toast, refresh } = useApp();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/stats/summary', { query: { month } }).then(setData).catch((e) => toast(e.message, 'error'));
  }, [month, version, toast]);

  const isCurrent = month === thisMonth();
  const t = data?.totals;
  const change = t && t.previousSpent > 0 ? ((t.spent - t.previousSpent) / t.previousSpent) * 100 : null;

  async function markReturned(tx) {
    await api(`/transactions/${tx.id}`, { method: 'PATCH', body: { settled: true } });
    toast(`Marked ${tx.counterparty || tx.name} as paid back`);
    refresh();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{greeting()}, {user?.name?.split(' ')[0]}</div>
          <h1 className="page-title">Your <em>money</em>, at a glance</h1>
        </div>
        <div className="row">
          <div className="seg">
            <button className="on" style={{ display: 'flex', alignItems: 'center' }} onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={16} /></button>
            <button className="on" style={{ minWidth: 130 }} onClick={() => setMonth(thisMonth())}>{monthLabel(month)}</button>
            <button className="on" style={{ display: 'flex', alignItems: 'center' }} disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <AppNudge />
      {!data ? <Skeleton /> : (
        <div className="stack" style={{ gap: 18 }}>
          <div className="grid g-main">
            <div className="hero">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="label">Spent in {monthLabel(month, 'long').split(' ')[0]}</div>
                {change !== null && (
                  <span className="pill-glass">
                    {change > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(change).toFixed(0)}% vs last month
                  </span>
                )}
              </div>
              <div className="big num">{money(t.spent, currency)}</div>
              <div className="label">
                {t.count} expense{t.count === 1 ? '' : 's'} · {money(t.dailyAverage, currency, { decimals: 0 })} a day
                {isCurrent && t.projected > t.spent && <> · on track for {money(t.projected, currency, { decimals: 0 })}</>}
              </div>
              {t.budget ? (
                <div style={{ marginTop: 22 }}>
                  <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: 'rgba(255,255,255,.75)' }}>Monthly budget</span>
                    <span><b>{money(Math.abs(t.budget - t.spent), currency)}</b> <span style={{ color: 'rgba(255,255,255,.6)' }}>{t.spent > t.budget ? 'over' : 'left'} of {money(t.budget, currency)}</span></span>
                  </div>
                  <div className="progress" style={{ background: 'rgba(255,255,255,.14)' }}>
                    <div style={{ width: `${Math.min(100, (t.spent / t.budget) * 100)}%`, background: t.spent > t.budget ? '#FF6B6B' : 'linear-gradient(90deg,#FFB49E,#FF8A4C)' }} />
                  </div>
                </div>
              ) : (
                <Link to="/budgets" className="pill-glass" style={{ marginTop: 20 }}>Set a monthly budget →</Link>
              )}
            </div>

            <div className="grid g-2 keep-2" style={{ gap: 14 }}>
              <Stat icon={Wallet} color="#1FB88A" label="Income" value={<Money value={t.income} />} sub={`Net ${t.net >= 0 ? '+' : '−'}${money(Math.abs(t.net), currency)}`} />
              <Stat icon={CalendarDays} color="#3BA7FF" label="Last month" value={<Money value={t.previousSpent} />} sub={monthLabel(shiftMonth(month, -1))} />
              <Stat icon={HandCoins} color="#F2A93B" label="Lent out" value={<Money value={data.lending.outstanding} />} sub={`${data.lending.count} pending`} />
              <Stat
                icon={Users} color="#E5489B" label="Splits"
                value={data.groups.owed - data.groups.owe === 0 ? 'Settled' : <Money value={data.groups.owed - data.groups.owe} signed className={data.groups.owed >= data.groups.owe ? 'pos' : 'neg'} />}
                sub={`Owed ${money(data.groups.owed, currency)} · You owe ${money(data.groups.owe, currency)}`}
              />
            </div>
          </div>

          <div className="grid g-main">
            <div className="card">
              <div className="card-head">
                <div>
                  <h3 className="card-title">Spending pace</h3>
                  <div className="card-sub">Cumulative spend this month vs last</div>
                </div>
                <div className="row" style={{ fontSize: 12, gap: 14 }}>
                  <span className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 3, borderRadius: 2, background: '#7C5CFF' }} />{monthShort(month)}</span>
                  <span className="row muted" style={{ gap: 6 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed #B9B5C2' }} />{monthShort(shiftMonth(month, -1))}</span>
                </div>
              </div>
              <div style={{ height: 250, marginLeft: -12 }}>
                <ResponsiveContainer>
                  <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pace" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7C5CFF" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#E5489B" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#F0EEE8" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#A9A6B0' }} interval={4} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#A9A6B0' }} width={56} tickFormatter={(v) => money(v, currency, { compact: true })} />
                    <Tooltip content={<PaceTip currency={currency} month={month} />} cursor={{ stroke: '#DEDAD1' }} />
                    <Area type="monotone" dataKey="previous" stroke="#B9B5C2" strokeDasharray="4 4" strokeWidth={2} fill="none" dot={false} activeDot={false} />
                    <Area type="monotone" dataKey="cumulative" stroke="#7C5CFF" strokeWidth={2.2} fill="url(#pace)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <div>
                  <h3 className="card-title">Where it went</h3>
                  <div className="card-sub">By category</div>
                </div>
                <Link to={`/transactions?month=${month}`} className="link" style={{ fontSize: 13 }}>Details</Link>
              </div>
              {data.byCategory.length ? (
                <>
                  <div style={{ height: 170, position: 'relative' }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={data.byCategory} dataKey="total" nameKey="name" innerRadius={58} outerRadius={80} paddingAngle={2} stroke="#fff" strokeWidth={2} cornerRadius={4}>
                          {data.byCategory.map((c) => <Cell key={c.slug} fill={c.color || '#64748B'} />)}
                        </Pie>
                        <Tooltip content={<CatTip currency={currency} total={t.spent} />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div className="serif num" style={{ fontSize: 24 }}>{money(t.spent, currency, { compact: true })}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{data.byCategory.length} categories</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    {data.byCategory.slice(0, 5).map((c) => (
                      <Link key={c.slug} to={`/transactions?month=${month}&category=${c.slug}`} className="legend-row">
                        <span className="sw" style={{ background: c.color }} />
                        <span style={{ flex: 1 }}>{c.name}</span>
                        <span className="muted num" style={{ fontSize: 12 }}>{((c.total / t.spent) * 100).toFixed(0)}%</span>
                        <b className="num" style={{ minWidth: 80, textAlign: 'right' }}>{money(c.total, currency)}</b>
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <Empty title="Nothing yet">No spending recorded for {monthLabel(month)}.</Empty>
              )}
            </div>
          </div>

          <div className="grid g-main">
            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Recent activity</h3>
                <Link to="/transactions" className="link" style={{ fontSize: 13 }}>See all</Link>
              </div>
              {data.recent.length ? (
                <div className="tx-list" style={{ margin: '0 -8px' }}>
                  {data.recent.map((tx) => <TxRow key={tx.id} tx={tx} onClick={() => openTx(tx)} showDate={dayLabel(tx.date)} />)}
                </div>
              ) : (
                <Empty title="A clean slate" action={<button className="btn btn-grad" onClick={() => openTx()}><Plus size={16} /> Add your first expense</button>}>
                  Add an expense by hand, or connect an iPhone Shortcut / Android automation from Settings.
                </Empty>
              )}
            </div>

            <div className="stack" style={{ gap: 18 }}>
              {data.insights.length > 0 && (
                <div className="card">
                  <div className="card-head"><h3 className="card-title">Insights</h3><Lightbulb size={16} className="muted" /></div>
                  <div className="stack" style={{ gap: 8 }}>
                    {data.insights.map((i, k) => <div key={k} className={`insight ${i.tone}`}>{i.text}</div>)}
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-head">
                  <h3 className="card-title">Money lent</h3>
                  <Link to="/transactions?category=lending" className="link" style={{ fontSize: 13 }}>All lending</Link>
                </div>
                {data.lending.items.length ? data.lending.items.map((tx) => (
                  <div key={tx.id} className="row" style={{ padding: '8px 0' }}>
                    <span className="cat-ic sm" style={{ background: tint('#F2A93B', 0.15), color: '#C27D0E' }}><HandCoins size={15} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{tx.counterparty || tx.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{shortDate(tx.date)}{tx.counterparty ? ` · ${tx.name}` : ''}</div>
                    </div>
                    <b className="num">{money(tx.amount, currency)}</b>
                    <button className="btn btn-sm" onClick={() => markReturned(tx)}>Returned</button>
                  </div>
                )) : <div className="muted" style={{ fontSize: 13 }}>No one owes you right now. Log a <b>Lending</b> transaction to track it here.</div>}
              </div>
            </div>
          </div>

          <div className="grid g-main">
            <div className="card">
              <div className="card-head">
                <div><h3 className="card-title">Six-month trend</h3><div className="card-sub">Monthly spending</div></div>
                <TrendingUp size={16} className="muted" />
              </div>
              <div style={{ height: 220, marginLeft: -12 }}>
                <ResponsiveContainer>
                  <BarChart data={data.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E5489B" />
                        <stop offset="100%" stopColor="#7C5CFF" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#F0EEE8" />
                    <XAxis dataKey="month" tickFormatter={monthShort} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#A9A6B0' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#A9A6B0' }} width={56} tickFormatter={(v) => money(v, currency, { compact: true })} />
                    <Tooltip cursor={{ fill: '#F6F4EF' }} content={<TrendTip currency={currency} />} />
                    <Bar dataKey="spent" radius={[6, 6, 0, 0]} maxBarSize={38}>
                      {data.trend.map((m) => <Cell key={m.month} fill={m.month === month ? 'url(#bar)' : '#E4DFF7'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3 className="card-title">Top places</h3>
                <span className="card-sub">{monthShort(month)}</span>
              </div>
              {data.topMerchants.length ? data.topMerchants.map((m, i) => (
                <div key={m.name} className="row" style={{ padding: '9px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                  <span className="serif" style={{ width: 20, fontSize: 20, color: 'var(--faint)' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{m.count} time{m.count > 1 ? 's' : ''}</div>
                  </div>
                  <b className="num">{money(m.total, currency)}</b>
                </div>
              )) : <div className="muted" style={{ fontSize: 13 }}>Nothing spent yet this month.</div>}
              {data.groups.groups.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="card-head" style={{ marginBottom: 8 }}><h3 className="card-title">Group balances</h3><Link to="/splits" className="link" style={{ fontSize: 13 }}>Splits</Link></div>
                  {data.groups.groups.slice(0, 4).map((g) => (
                    <Link to={`/splits/${g.id}`} key={g.id} className="row" style={{ padding: '6px 0' }}>
                      <span style={{ fontSize: 18 }}>{g.emoji}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{g.name}</span>
                      {g.balance === 0 ? <span className="muted" style={{ fontSize: 12.5 }}>settled</span> : <Money value={g.balance} signed className={g.balance > 0 ? 'pos' : 'neg'} />}
                    </Link>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, color, label, value, sub }) {
  return (
    <div className="card stat">
      <div className="k"><span className="dot-ic" style={{ background: tint(color, 0.13), color }}><Icon size={15} /></span>{label}</div>
      <div className="v">{value}</div>
      <div className="s">{sub}</div>
    </div>
  );
}

function PaceTip({ active, payload, currency, month }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="muted" style={{ marginBottom: 4 }}>{shortDate(p.date)}</div>
      {p.cumulative !== null && <div>So far: <b>{money(p.cumulative, currency)}</b></div>}
      {p.cumulative !== null && <div>That day: <b>{money(p.total, currency)}</b></div>}
      <div className="muted">{monthShort(shiftMonth(month, -1))} by day {p.day}: <b>{money(p.previous, currency)}</b></div>
    </div>
  );
}
function CatTip({ active, payload, currency, total }) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload;
  return (
    <div className="chart-tip row" style={{ gap: 10 }}>
      <CatIcon cat={c} size="sm" />
      <div><div style={{ fontWeight: 600 }}>{c.name}</div><b>{money(c.total, currency)}</b> <span className="muted">· {((c.total / total) * 100).toFixed(0)}%</span></div>
    </div>
  );
}
function TrendTip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="muted">{monthLabel(m.month)}</div>
      <div>Spent <b>{money(m.spent, currency)}</b></div>
      {m.income > 0 && <div>Income <b>{money(m.income, currency)}</b></div>}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g-main"><div className="skeleton" style={{ height: 230 }} /><div className="skeleton" style={{ height: 230 }} /></div>
      <div className="grid g-main"><div className="skeleton" style={{ height: 320 }} /><div className="skeleton" style={{ height: 320 }} /></div>
    </div>
  );
}
