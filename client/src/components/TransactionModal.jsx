import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { currencySymbol, money, todayISO } from '../lib/format';
import { CatIcon, Field, Modal } from './ui';

export default function TransactionModal() {
  const { txModal, closeTx, categories, currency, toast, refresh } = useApp();
  const editing = !!txModal?.id;
  const [form, setForm] = useState(() => ({
    type: txModal?.type || 'expense',
    amount: txModal?.amount ?? '',
    name: txModal?.name || '',
    category: txModal?.category || 'food',
    date: txModal?.date || todayISO(),
    note: txModal?.note || '',
    counterparty: txModal?.counterparty || '',
    settled: !!txModal?.settled,
  }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const visibleCats = categories.filter((c) => (form.type === 'income' ? true : c.slug !== 'income'));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = {
      ...form,
      amount: form.amount,
      note: form.note || null,
      counterparty: form.category === 'lending' ? form.counterparty || null : null,
    };
    try {
      if (editing) await api(`/transactions/${txModal.id}`, { method: 'PATCH', body });
      else await api('/transactions', { method: 'POST', body });
      toast(editing ? 'Transaction updated' : 'Transaction added');
      refresh();
      closeTx();
    } catch (err) {
      setErrors(err.details || {});
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this transaction?')) return;
    await api(`/transactions/${txModal.id}`, { method: 'DELETE' });
    toast('Transaction deleted');
    refresh();
    closeTx();
  }

  return (
    <Modal title={editing ? 'Edit transaction' : 'New transaction'} onClose={closeTx}>
      <form className="stack" onSubmit={submit}>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          {['expense', 'income'].map((t) => (
            <button
              type="button"
              key={t}
              className={form.type === t ? 'on' : ''}
              onClick={() => setForm((f) => ({ ...f, type: t, category: t === 'income' ? 'income' : f.category === 'income' ? 'food' : f.category }))}
            >
              {t === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <Field error={errors.amount}>
          <div className="input-wrap">
            <span className="prefix lg">{currencySymbol(currency)}</span>
            <input
              className="input input-lg num"
              inputMode="decimal"
              placeholder="0"
              autoFocus
              value={form.amount}
              onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
        </Field>

        <Field label={form.category === 'lending' ? 'What for' : 'Name'} error={errors.name}>
          <input className="input" placeholder={form.type === 'income' ? 'Salary, refund…' : 'Coffee at Blue Tokai'} value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>

        <Field label="Category">
          <div className="chip-row">
            {visibleCats.map((c) => {
              const on = form.category === c.slug;
              return (
                <button
                  type="button"
                  key={c.slug}
                  className={`chip ${on ? 'on' : ''}`}
                  style={on ? { background: c.color } : undefined}
                  onClick={() => set('category', c.slug)}
                >
                  <span className="sw" style={{ background: on ? '#fff' : c.color }} />
                  {c.name}
                </button>
              );
            })}
          </div>
        </Field>

        {form.category === 'lending' && (
          <div className="grid g-2" style={{ alignItems: 'end' }}>
            <Field label="Lent to">
              <input className="input" placeholder="Person's name" value={form.counterparty} onChange={(e) => set('counterparty', e.target.value)} />
            </Field>
            <label className="row" style={{ height: 42, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.settled} onChange={(e) => set('settled', e.target.checked)} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>Paid back</span>
            </label>
          </div>
        )}

        <div className="grid g-2">
          <Field label="Date" error={errors.date}>
            <input type="date" className="input" value={form.date} max="2100-12-31" onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Note">
            <input className="input" placeholder="Optional" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
        </div>

        <div className="row" style={{ marginTop: 6 }}>
          {editing && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={remove}>
              <Trash2 size={16} /> Delete
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn" onClick={closeTx}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{editing ? 'Save changes' : 'Add transaction'}</button>
        </div>
        {editing && txModal.source !== 'manual' && (
          <div className="muted" style={{ fontSize: 12 }}>
            Added via {txModal.source === 'split' ? 'a group split' : txModal.source === 'api' ? 'the automation API' : txModal.source}.
          </div>
        )}
      </form>
    </Modal>
  );
}

export function TxRow({ tx, onClick, showDate }) {
  const { catMap } = useApp();
  const cat = catMap[tx.category];
  const income = tx.type === 'income';
  return (
    <div className="tx" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onClick?.()}>
      <CatIcon cat={cat} />
      <div className="tx-main">
        <div className="tx-name">{tx.name}</div>
        <div className="tx-meta">
          <span>{cat?.name || tx.category}</span>
          {showDate && <><span className="faint">·</span><span>{showDate}</span></>}
          {tx.counterparty && <><span className="faint">·</span><span>{tx.counterparty}</span></>}
          {tx.category === 'lending' && (
            <span className="badge" style={tx.settled ? { background: '#e8f8f1', color: '#0e7a59' } : { background: '#fff4e0', color: '#9a5b00' }}>
              {tx.settled ? 'Returned' : 'Pending'}
            </span>
          )}
          {tx.source === 'api' && <span className="badge" style={{ background: '#f1edff', color: '#5b3fd6' }}>Auto</span>}
          {tx.source === 'split' && <span className="badge" style={{ background: '#fdeef6', color: '#b0256f' }}>Split</span>}
        </div>
      </div>
      <div className={`tx-amt ${income ? 'pos' : ''}`}>
        <MoneyInline value={tx.amount} sign={income ? '+' : '−'} />
      </div>
    </div>
  );
}

function MoneyInline({ value, sign }) {
  const { currency } = useApp();
  return <>{sign}{money(value, currency)}</>;
}
