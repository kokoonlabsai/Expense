import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Plus, Search, SlidersHorizontal, X, ReceiptText } from 'lucide-react';
import { api, download } from '../lib/api';
import { useApp } from '../lib/store';
import { dayLabel, money, monthLabel, shiftMonth, thisMonth, toISO } from '../lib/format';
import { TxRow } from '../components/TransactionModal';
import { Empty } from '../components/ui';

const PAGE = 100;

function periodRange(period) {
  const now = new Date();
  if (period === '7d') { const d = new Date(); d.setDate(d.getDate() - 6); return { from: toISO(d), to: toISO(now) }; }
  if (period === '30d') { const d = new Date(); d.setDate(d.getDate() - 29); return { from: toISO(d), to: toISO(now) }; }
  if (period === 'year') return { from: `${now.getFullYear()}-01-01`, to: toISO(now) };
  return {};
}

export default function Transactions() {
  const { categories, catMap, version, openTx, currency, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [showAdv, setShowAdv] = useState(() => !!(params.get('min') || params.get('max') || params.get('from')));
  const [q, setQ] = useState(params.get('q') || '');

  const f = useMemo(() => ({
    q: params.get('q') || '',
    category: (params.get('category') || '').split(',').filter(Boolean),
    type: params.get('type') || '',
    month: params.get('month') || '',
    period: params.get('period') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    min: params.get('min') || '',
    max: params.get('max') || '',
    sort: params.get('sort') || 'date_desc',
  }), [params]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      const val = Array.isArray(v) ? v.join(',') : v;
      if (val) next.set(k, val); else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // Debounce search box into the URL
  useEffect(() => {
    const t = setTimeout(() => { if (q !== f.q) update({ q }); }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useMemo(() => {
    const r = f.period ? periodRange(f.period) : {};
    return {
      q: f.q, category: f.category, type: f.type, month: f.month, sort: f.sort,
      from: r.from || f.from, to: r.to || f.to, min: f.min, max: f.max,
    };
  }, [f]);

  useEffect(() => {
    setLoading(true);
    api('/transactions', { query: { ...query, limit: PAGE } })
      .then((r) => { setItems(r.items); setTotals(r.totals); setMore(r.items.length === PAGE); })
      .catch((e) => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [query, version, toast]);

  async function loadMore() {
    const r = await api('/transactions', { query: { ...query, limit: PAGE, offset: items.length } });
    setItems((x) => [...x, ...r.items]);
    setMore(r.items.length === PAGE);
  }

  const toggleCat = (slug) => {
    const set = new Set(f.category);
    set.has(slug) ? set.delete(slug) : set.add(slug);
    update({ category: [...set] });
  };

  const setPeriod = (p) => {
    if (p === 'month') update({ period: '', month: f.month || thisMonth(), from: '', to: '' });
    else if (p === 'custom') { setShowAdv(true); update({ period: '', month: '', from: f.from || toISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: f.to || toISO(new Date()) }); }
    else update({ period: p, month: '', from: '', to: '' });
  };
  const activePeriod = f.month ? 'month' : f.from || f.to ? 'custom' : f.period || '';

  const grouped = useMemo(() => {
    if (!f.sort.startsWith('date')) return [{ date: null, items }];
    const out = [];
    for (const tx of items) {
      const last = out[out.length - 1];
      if (last && last.date === tx.date) last.items.push(tx);
      else out.push({ date: tx.date, items: [tx] });
    }
    return out;
  }, [items, f.sort]);

  const activeCount = f.category.length + (f.type ? 1 : 0) + (activePeriod ? 1 : 0) + (f.min || f.max ? 1 : 0) + (f.q ? 1 : 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Activity</div>
          <h1 className="page-title">All <em>transactions</em></h1>
        </div>
        <div className="row">
          <button className="btn" onClick={() => download('/transactions/export.csv', query, 'tally-transactions.csv').catch((e) => toast(e.message, 'error'))}>
            <Download size={16} /> <span className="hide-sm">Export CSV</span>
          </button>
          <button className="btn btn-primary" onClick={() => openTx()}><Plus size={16} /> Add</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <div className="row row-wrap" style={{ gap: 10 }}>
          <div className="input-wrap" style={{ flex: '1 1 240px' }}>
            <Search size={16} className="prefix" />
            <input className="input" placeholder="Search name, note or person" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="seg" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            {[['', 'All time'], ['7d', '7 days'], ['30d', '30 days'], ['month', 'Month'], ['year', 'This year'], ['custom', 'Range']].map(([k, l]) => (
              <button key={k} className={activePeriod === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
          <div className="seg">
            {[['', 'All'], ['expense', 'Spent'], ['income', 'Income']].map(([k, l]) => (
              <button key={k} className={f.type === k ? 'on' : ''} onClick={() => update({ type: k })}>{l}</button>
            ))}
          </div>
          <button className={`btn btn-sm ${showAdv ? 'btn-primary' : ''}`} onClick={() => setShowAdv((s) => !s)}><SlidersHorizontal size={14} /> More</button>
        </div>

        {(activePeriod === 'month') && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-sm" onClick={() => update({ month: shiftMonth(f.month, -1) })}>‹</button>
            <input type="month" className="input" style={{ width: 180, height: 34 }} value={f.month} onChange={(e) => update({ month: e.target.value })} />
            <button className="btn btn-sm" disabled={f.month >= thisMonth()} onClick={() => update({ month: shiftMonth(f.month, 1) })}>›</button>
            <span className="muted" style={{ fontSize: 13 }}>{monthLabel(f.month)}</span>
          </div>
        )}

        {showAdv && (
          <div className="grid g-4" style={{ marginTop: 12, gap: 10 }}>
            <label className="field"><span>From</span><input type="date" className="input" value={f.from} onChange={(e) => update({ from: e.target.value, month: '', period: '' })} /></label>
            <label className="field"><span>To</span><input type="date" className="input" value={f.to} onChange={(e) => update({ to: e.target.value, month: '', period: '' })} /></label>
            <label className="field"><span>Min amount</span><input className="input" inputMode="decimal" value={f.min} onChange={(e) => update({ min: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
            <label className="field"><span>Max amount</span><input className="input" inputMode="decimal" value={f.max} onChange={(e) => update({ max: e.target.value.replace(/[^0-9.]/g, '') })} /></label>
            <label className="field"><span>Sort by</span>
              <select className="select" value={f.sort} onChange={(e) => update({ sort: e.target.value === 'date_desc' ? '' : e.target.value })}>
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Highest amount</option>
                <option value="amount_asc">Lowest amount</option>
              </select>
            </label>
          </div>
        )}

        <div className="chip-scroll" style={{ marginTop: 14 }}>
          {categories.map((c) => {
            const on = f.category.includes(c.slug);
            return (
              <button key={c.slug} className={`chip ${on ? 'on' : ''}`} style={on ? { background: c.color } : undefined} onClick={() => toggleCat(c.slug)}>
                <span className="sw" style={{ background: on ? '#fff' : c.color }} />{c.name}
              </button>
            );
          })}
        </div>
      </div>

      {totals && (
        <div className="row row-wrap" style={{ marginBottom: 10, padding: '0 4px', gap: 18 }}>
          <span className="muted">{totals.count} transaction{totals.count === 1 ? '' : 's'}</span>
          <span>Spent <b className="num">{money(totals.expense, currency)}</b></span>
          {totals.income > 0 && <span>Income <b className="num pos">{money(totals.income, currency)}</b></span>}
          <div className="spacer" />
          {activeCount > 0 && (
            <button className="link row" style={{ gap: 4 }} onClick={() => { setQ(''); setParams({}, { replace: true }); }}>
              <X size={14} /> Clear {activeCount} filter{activeCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

      <div className="card" style={{ padding: '6px 14px' }}>
        {loading && !items.length ? (
          <div className="stack" style={{ padding: 10 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}</div>
        ) : items.length ? (
          <>
            {grouped.map((g, gi) => (
              <div key={g.date || gi}>
                {g.date && (
                  <div className="day-head">
                    <span>{dayLabel(g.date)}</span>
                    <span className="num">{money(g.items.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0), currency)}</span>
                  </div>
                )}
                <div className="tx-list">
                  {g.items.map((tx) => <TxRow key={tx.id} tx={tx} onClick={() => openTx(tx)} showDate={g.date ? null : dayLabel(tx.date)} />)}
                </div>
              </div>
            ))}
            {more && <div style={{ textAlign: 'center', padding: 16 }}><button className="btn" onClick={loadMore}>Load more</button></div>}
          </>
        ) : (
          <Empty icon={ReceiptText} title="No transactions found">
            {activeCount ? 'Try loosening your filters.' : 'Anything you add — by hand or via automation — shows up here.'}
          </Empty>
        )}
      </div>
      {f.category.length === 1 && catMap[f.category[0]]?.budget && f.month && (
        <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Budget for {catMap[f.category[0]].name}: {money(catMap[f.category[0]].budget, currency)} / month
        </div>
      )}
    </div>
  );
}
