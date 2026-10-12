import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { currencySymbol, money, monthLabel, thisMonth } from '../lib/format';
import { CatIcon, Field, ICONS, Modal, PALETTE, Progress } from '../components/ui';

export default function Budgets() {
  const { categories, user, setUser, currency, toast, refresh } = useApp();
  const [editing, setEditing] = useState(null); // category | {} for new
  const [overall, setOverall] = useState(user?.monthly_budget ?? '');

  const spent = categories.filter((c) => c.slug !== 'income').reduce((a, c) => a + c.spent, 0);
  const budgeted = categories.filter((c) => c.budget);
  const others = categories.filter((c) => !c.budget && c.slug !== 'income');

  async function saveOverall(e) {
    e.preventDefault();
    try {
      const { user: u } = await api('/auth/me', { method: 'PATCH', body: { monthly_budget: overall === '' ? null : Number(overall) } });
      setUser(u);
      toast('Monthly budget saved');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{monthLabel(thisMonth())}</div>
          <h1 className="page-title">Budgets & <em>categories</em></h1>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New category</button>
      </div>

      <div className="grid g-main" style={{ marginBottom: 18 }}>
        <div className="card">
          <div className="card-head"><div><h3 className="card-title">Monthly budget</h3><div className="card-sub">An overall cap for everything you spend</div></div></div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <span className="serif num" style={{ fontSize: 40 }}>{money(spent, currency)}</span>
            {user?.monthly_budget ? <span className="muted">of {money(user.monthly_budget, currency)}</span> : <span className="muted">spent this month</span>}
          </div>
          {user?.monthly_budget ? <Progress value={spent} max={user.monthly_budget} /> : null}
          <form className="row" style={{ marginTop: 18 }} onSubmit={saveOverall}>
            <div className="input-wrap" style={{ flex: 1 }}>
              <span className="prefix">{currencySymbol(currency)}</span>
              <input className="input num" inputMode="decimal" placeholder="e.g. 50000" value={overall ?? ''} onChange={(e) => setOverall(e.target.value.replace(/[^0-9.]/g, ''))} />
            </div>
            <button className="btn btn-primary">Save</button>
          </form>
        </div>
        <div className="card" style={{ background: 'var(--grad-soft)', borderColor: 'transparent' }}>
          <h3 className="card-title">How budgets work</h3>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 0 }}>
            Give any category a monthly limit. Your overview flags categories that go over, and warns you when your current pace will overshoot your overall budget.
            Unknown categories sent from automations land in <b>Other</b> — add a custom category here and automations can use its name right away.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3 className="card-title">Categories</h3><span className="card-sub">This month's spend</span></div>
        <div className="stack" style={{ gap: 4 }}>
          {[...budgeted, ...others].map((c) => (
            <div key={c.id} className="row" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
              <CatIcon cat={c} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: c.budget ? 6 : 0 }}>
                  <Link to={`/transactions?category=${c.slug}&month=${thisMonth()}`} style={{ fontWeight: 600 }}>{c.name}</Link>
                  <span className="num" style={{ fontSize: 13.5 }}>
                    <b>{money(c.spent, currency)}</b>
                    {c.budget ? <span className="muted"> / {money(c.budget, currency)}</span> : <span className="muted hide-sm"> · {c.count} txn</span>}
                  </span>
                </div>
                {c.budget ? <Progress value={c.spent} max={c.budget} color={c.color} /> : null}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>API name: <code>{c.slug}</code></div>
              </div>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing(c)} aria-label="Edit"><Pencil size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {editing && <CategoryModal cat={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryModal({ cat, onClose }) {
  const { toast, refresh, currency } = useApp();
  const isNew = !cat.id;
  const [form, setForm] = useState({ name: cat.name || '', color: cat.color || PALETTE[0], icon: cat.icon || 'tag', budget: cat.budget ?? '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    try {
      if (isNew) await api('/categories', { method: 'POST', body: form });
      else await api(`/categories/${cat.id}`, { method: 'PATCH', body: form });
      toast(isNew ? 'Category created' : 'Category saved');
      refresh();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  async function remove() {
    if (!confirm(`Delete ${cat.name}? Its transactions move to Other.`)) return;
    try {
      await api(`/categories/${cat.id}`, { method: 'DELETE' });
      toast('Category deleted');
      refresh();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Modal title={isNew ? 'New category' : 'Edit category'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="row">
          <CatIcon cat={form} />
          <input className="input" autoFocus placeholder="Category name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <Field label="Colour">
          <div className="chip-row">
            {PALETTE.map((c) => (
              <button type="button" key={c} onClick={() => set('color', c)} aria-label={c}
                style={{ width: 28, height: 28, borderRadius: 10, border: 0, background: c, cursor: 'pointer', boxShadow: form.color === c ? `0 0 0 3px #fff, 0 0 0 5px ${c}` : 'none' }} />
            ))}
          </div>
        </Field>
        <Field label="Icon">
          <div className="chip-row">
            {Object.entries(ICONS).map(([k, Icon]) => (
              <button type="button" key={k} onClick={() => set('icon', k)} className="btn btn-icon btn-sm"
                style={form.icon === k ? { background: form.color, color: '#fff', borderColor: form.color } : undefined}><Icon size={15} /></button>
            ))}
          </div>
        </Field>
        <Field label="Monthly budget" hint="Leave empty for no limit">
          <div className="input-wrap"><span className="prefix">{currencySymbol(currency)}</span><input className="input num" inputMode="decimal" value={form.budget ?? ''} onChange={(e) => set('budget', e.target.value.replace(/[^0-9.]/g, ''))} /></div>
        </Field>
        <div className="row">
          {!isNew && !['other', 'income'].includes(cat.slug) && <button type="button" className="btn btn-ghost btn-danger" onClick={remove}><Trash2 size={15} /> Delete</button>}
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!form.name.trim()}>Save</button>
        </div>
      </form>
    </Modal>
  );
}
