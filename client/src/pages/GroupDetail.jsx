import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, HandCoins, Plus, Receipt, Trash2, UserPlus, Settings2, Share2, Check, X, Clock, BellRing } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { currencySymbol, dayLabel, money, todayISO } from '../lib/format';
import { Avatar, CatIcon, Empty, Field, Modal } from '../components/ui';
import { EMOJIS } from './Groups';
import PeoplePicker from '../components/PeoplePicker';
import { inviteUrl, share } from '../lib/share';

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency, toast, refresh, catMap } = useApp();
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null); // 'expense' | {settle} | 'member' | 'edit'

  const load = useCallback(() => {
    api(`/groups/${id}`).then(setData).catch((e) => { toast(e.message, 'error'); navigate('/splits'); });
  }, [id, toast, navigate]);
  useEffect(load, [load]);

  const done = (msg) => { toast(msg); setModal(null); load(); refresh(); };

  const byId = useMemo(() => Object.fromEntries((data?.members || []).map((m) => [m.id, m])), [data]);
  const timeline = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.expenses.map((e) => ({ kind: 'expense', ...e })),
      ...data.settlements.map((s) => ({ kind: 'settle', ...s })),
    ];
    return items.sort((a, b) => (b.date + b.created_at).localeCompare(a.date + a.created_at));
  }, [data]);

  if (!data) return <div className="page"><div className="skeleton" style={{ height: 200 }} /></div>;
  const me = byId[data.me];
  const name = (mid) => (mid === data.me ? 'You' : byId[mid]?.name || 'Someone');

  async function delExpense(e) {
    if (!confirm(`Delete "${e.description}"?`)) return;
    await api(`/groups/${id}/expenses/${e.id}`, { method: 'DELETE' });
    done('Expense deleted');
  }
  async function delSettle(s) {
    if (!confirm('Remove this payment?')) return;
    try {
      await api(`/groups/${id}/settlements/${s.id}`, { method: 'DELETE' });
      done('Payment removed');
    } catch (err) { toast(err.message, 'error'); }
  }
  async function confirmSettle(s) {
    await api(`/groups/${id}/settlements/${s.id}/confirm`, { method: 'POST' });
    done(`Confirmed — ${money(s.amount, currency)} from ${name(s.from_member)}`);
  }
  async function rejectSettle(s) {
    if (!confirm(`Mark this as not received? ${name(s.from_member)}'s payment will be removed.`)) return;
    await api(`/groups/${id}/settlements/${s.id}`, { method: 'DELETE' });
    done('Payment marked as not received');
  }
  async function inviteGroup() {
    try {
      const { token } = await api(`/groups/${id}/invite`, { method: 'POST' });
      await share({ title: data.group.name, text: `Join "${data.group.name}" on Jellyfish to split expenses with me:`, url: inviteUrl(token) }, toast);
    } catch (err) { toast(err.message, 'error'); }
  }
  async function inviteMember(m) {
    try {
      const { token } = await api(`/groups/${id}/members/${m.id}/invite`, { method: 'POST' });
      await share({ title: data.group.name, text: `Hey ${m.name}, join "${data.group.name}" on Jellyfish to see what we've split:`, url: inviteUrl(token) }, toast);
    } catch (err) { toast(err.message, 'error'); }
  }
  async function remind(d) {
    try {
      const { sent } = await api(`/groups/${id}/remind`, { method: 'POST', body: { member_id: d.from, amount: d.amount } });
      if (sent) return toast(`Reminder sent to ${byId[d.from]?.name}`);
    } catch (err) {
      return toast(err.message, 'error');
    }
    // They haven't turned on notifications: fall back to a message you can send yourself.
    share({ title: data.group.name, text: `Hey ${byId[d.from]?.name}, friendly reminder: you owe me ${money(d.amount, currency)} for "${data.group.name}". Details on Jellyfish:`, url: `${window.location.origin}/splits/${id}` }, toast);
  }

  const toConfirm = data.settlements.filter((s) => s.status === 'pending' && s.to_member === data.me);
  const sentBetween = (from, to) =>
    data.settlements.filter((s) => s.status === 'pending' && s.from_member === from && s.to_member === to).reduce((a, s) => a + s.amount, 0);
  const notOnJellyfish = data.members.filter((m) => !m.registered);

  return (
    <div className="page">
      <Link to="/splits" className="muted row" style={{ gap: 4, fontSize: 13, fontWeight: 600, marginBottom: 14 }}><ChevronLeft size={16} /> All groups</Link>
      <div className="page-head">
        <div className="row" style={{ gap: 16 }}>
          <span style={{ fontSize: 36, width: 68, height: 68, display: 'grid', placeItems: 'center', borderRadius: 22, background: 'var(--grad-soft)' }}>{data.group.emoji}</span>
          <div>
            <div className="eyebrow">{data.members.length} people · {money(data.total, currency)} spent</div>
            <h1 className="page-title" style={{ marginTop: 2 }}>{data.group.name}</h1>
          </div>
        </div>
        <div className="row row-wrap">
          <button className="btn btn-icon" onClick={() => setModal('edit')} title="Group settings"><Settings2 size={16} /></button>
          <button className="btn" onClick={inviteGroup}><Share2 size={16} /> Invite</button>
          <button className="btn" onClick={() => setModal({ settle: {} })}><HandCoins size={16} /> Settle up</button>
          <button className="btn btn-grad" onClick={() => setModal('expense')}><Plus size={16} /> Add expense</button>
        </div>
      </div>

      <div className="grid g-main">
        <div className="stack" style={{ gap: 18 }}>
          {toConfirm.map((s) => (
            <div key={s.id} className="notice" style={{ background: '#fff4e0' }}>
              <span className="cat-ic" style={{ background: '#fff', color: '#c27d0e' }}><BellRing size={18} /></span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <b>{name(s.from_member)} says they paid you {money(s.amount, currency)}</b>
                <div className="muted" style={{ fontSize: 12.5 }}>{dayLabel(s.date)}{s.note ? ` · ${s.note}` : ''} · Did you receive it?</div>
              </div>
              <button className="btn btn-sm" onClick={() => rejectSettle(s)}><X size={14} /> Not received</button>
              <button className="btn btn-sm btn-primary" onClick={() => confirmSettle(s)}><Check size={14} /> Confirm</button>
            </div>
          ))}
          <div className={`hero`} style={{ padding: 24 }}>
            <div className="label">Your position</div>
            <div className="big num" style={{ fontSize: 48 }}>
              {me.balance === 0 ? 'All square' : money(Math.abs(me.balance), currency)}
            </div>
            <div className="label">{me.balance > 0 ? 'Others owe you in total' : me.balance < 0 ? 'You owe in total' : 'Nothing owed either way'}</div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Activity</h3><span className="card-sub">{data.expenses.length} expense{data.expenses.length === 1 ? '' : 's'} · {data.settlements.length} settlement{data.settlements.length === 1 ? '' : 's'}</span></div>
            {timeline.length ? timeline.map((it) => it.kind === 'expense' ? (
              <div key={`e${it.id}`} className="tx" style={{ cursor: 'default' }}>
                <CatIcon cat={catMap[it.category] || { color: '#7C5CFF', icon: 'receipt' }} />
                <div className="tx-main">
                  <div className="tx-name">{it.description}</div>
                  <div className="tx-meta">
                    <span>{name(it.paid_by)} paid {money(it.amount, currency)}</span><span className="faint">·</span><span>{dayLabel(it.date)}</span>
                    <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>{it.split_type}</span>
                  </div>
                </div>
                <MyShare e={it} me={data.me} currency={currency} />
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delExpense(it)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            ) : (
              <div key={`s${it.id}`} className="tx" style={{ cursor: 'default' }}>
                <span className="cat-ic" style={{ background: '#e8f8f1', color: '#0e7a59' }}><HandCoins size={19} /></span>
                <div className="tx-main">
                  <div className="tx-name">{name(it.from_member)} paid {name(it.to_member)}</div>
                  <div className="tx-meta">
                    <span>Payment</span><span className="faint">·</span><span>{dayLabel(it.date)}</span>{it.note && <><span className="faint">·</span><span>{it.note}</span></>}
                    {it.status === 'pending' && (
                      <span className="badge" style={{ background: '#fff4e0', color: '#9a5b00' }}>
                        <Clock size={11} /> {it.to_member === data.me ? 'Needs your OK' : `Waiting for ${byId[it.to_member]?.name}`}
                      </span>
                    )}
                  </div>
                </div>
                <b className={`num ${it.status === 'pending' ? 'muted' : 'pos'}`}>{money(it.amount, currency)}</b>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => delSettle(it)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            )) : (
              <Empty icon={Receipt} title="No expenses yet" action={<button className="btn btn-primary" onClick={() => setModal('expense')}><Plus size={16} /> Add the first one</button>}>
                Add a bill and choose how to split it — equally, by exact amounts, percentages or shares.
              </Empty>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Settle up</h3><span className="card-sub">Fewest payments</span></div>
            {data.debts.length ? data.debts.map((d, i) => (
              <div key={i} className="row" style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
                <Avatar name={byId[d.from]?.name} size="sm" />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5 }}>
                  <b>{name(d.from)}</b> <span className="muted">{d.from === data.me ? 'owe' : 'owes'}</span> <b>{name(d.to)}</b>
                  <div className="num" style={{ fontWeight: 700 }}>{money(d.amount, currency)}</div>
                  {sentBetween(d.from, d.to) > 0 && (
                    <div className="badge" style={{ background: '#fff4e0', color: '#9a5b00', marginTop: 4 }}>
                      <Clock size={11} /> {money(sentBetween(d.from, d.to), currency)} paid · waiting for {d.to === data.me ? 'your' : `${byId[d.to]?.name}'s`} OK
                    </div>
                  )}
                </div>
                {d.to === data.me && (
                  <button className="btn btn-ghost btn-sm" onClick={() => remind(d)} title="Send a reminder"><BellRing size={14} /></button>
                )}
                <button className="btn btn-sm" onClick={() => setModal({ settle: { from_member: d.from, to_member: d.to, amount: d.amount } })}>
                  {d.from === data.me ? 'I paid' : d.to === data.me ? 'Got it' : 'Record'}
                </button>
              </div>
            )) : <div className="insight good">Everyone is settled up. 🎉</div>}
          </div>

          <div className="card">
            <div className="card-head">
              <h3 className="card-title">Members</h3>
              <button className="btn btn-sm" onClick={() => setModal('member')}><UserPlus size={14} /> Add</button>
            </div>
            {notOnJellyfish.length > 0 && (
              <div className="insight info" style={{ marginBottom: 8, fontSize: 12.5 }}>
                Send {notOnJellyfish.length === 1 ? notOnJellyfish[0].name : `${notOnJellyfish.length} people`} an invite link so they can see what they owe and settle up.
              </div>
            )}
            {data.members.map((m) => (
              <div key={m.id} className="row" style={{ padding: '8px 0' }}>
                <Avatar name={m.name} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{m.is_me ? `${m.name} (you)` : m.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{m.registered ? 'On Jellyfish' : 'Not on Jellyfish yet'}</div>
                </div>
                {!m.registered && <button className="btn btn-sm" onClick={() => inviteMember(m)}><Share2 size={13} /> Invite</button>}
                <span className={`num ${m.balance > 0 ? 'pos' : m.balance < 0 ? 'neg' : 'muted'}`} style={{ fontWeight: 700, fontSize: 13.5 }}>
                  {m.balance === 0 ? 'settled' : `${m.balance > 0 ? '+' : '−'}${money(Math.abs(m.balance), currency)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal === 'expense' && <ExpenseModal data={data} onClose={() => setModal(null)} onDone={() => done('Expense added')} />}
      {modal?.settle && <SettleModal data={data} initial={modal.settle} onClose={() => setModal(null)} onDone={(msg) => done(msg)} />}
      {modal === 'member' && <MemberModal data={data} onClose={() => setModal(null)} onChanged={() => { load(); refresh(); }} />}
      {modal === 'edit' && <EditGroupModal data={data} onClose={() => setModal(null)} onDone={() => done('Group updated')} />}
    </div>
  );
}

function MyShare({ e, me, currency }) {
  const mine = e.shares.find((s) => s.member_id === me)?.amount || 0;
  const lent = e.paid_by === me ? e.amount - mine : 0;
  if (e.paid_by === me) {
    return lent > 0
      ? <div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: 11 }}>you lent</div><b className="num pos">{money(lent, currency)}</b></div>
      : <div className="muted" style={{ fontSize: 12 }}>just you</div>;
  }
  return mine > 0
    ? <div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: 11 }}>you borrowed</div><b className="num neg">{money(mine, currency)}</b></div>
    : <div className="muted" style={{ fontSize: 12 }}>not involved</div>;
}

const SPLIT_TYPES = [['equal', 'Equally'], ['exact', 'Exact'], ['percent', 'Percent'], ['shares', 'Shares']];

function ExpenseModal({ data, onClose, onDone }) {
  const { currency, categories, toast } = useApp();
  const [form, setForm] = useState({ description: '', amount: '', paid_by: data.me, date: todayISO(), category: 'food', split_type: 'equal', add_to_ledger: true });
  const [included, setIncluded] = useState(() => new Set(data.members.map((m) => m.id)));
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const amount = Number(form.amount) || 0;

  const sum = data.members.reduce((a, m) => a + (Number(values[m.id]) || 0), 0);
  const target = form.split_type === 'exact' ? amount : form.split_type === 'percent' ? 100 : null;
  const preview = (m) => {
    if (form.split_type === 'equal') return included.has(m.id) && included.size ? amount / included.size : 0;
    const v = Number(values[m.id]) || 0;
    if (form.split_type === 'exact') return v;
    if (form.split_type === 'percent') return (amount * v) / 100;
    return sum ? (amount * v) / sum : 0;
  };

  async function submit(e) {
    e.preventDefault();
    const splits = form.split_type === 'equal'
      ? [...included].map((member_id) => ({ member_id }))
      : data.members.filter((m) => Number(values[m.id]) > 0).map((m) => ({ member_id: m.id, value: Number(values[m.id]) }));
    if (!splits.length) return toast('Pick at least one person', 'error');
    setBusy(true);
    try {
      await api(`/groups/${data.group.id}/expenses`, { method: 'POST', body: { ...form, splits } });
      onDone();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title="Add expense" onClose={onClose} wide>
      <form className="stack" onSubmit={submit}>
        <div className="grid g-2">
          <Field label="Description"><input className="input" autoFocus placeholder="Dinner, cab, groceries…" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Amount">
            <div className="input-wrap"><span className="prefix">{currencySymbol(currency)}</span><input className="input num" inputMode="decimal" placeholder="0" value={form.amount} onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))} /></div>
          </Field>
          <Field label="Paid by">
            <select className="select" value={form.paid_by} onChange={(e) => set('paid_by', Number(e.target.value))}>
              {data.members.map((m) => <option key={m.id} value={m.id}>{m.is_me ? 'You' : m.name}</option>)}
            </select>
          </Field>
          <div className="grid g-2" style={{ gap: 10 }}>
            <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
            <Field label="Category">
              <select className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
                {categories.filter((c) => c.slug !== 'income').map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div className="field">
          <span>Split</span>
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            {SPLIT_TYPES.map(([k, l]) => <button type="button" key={k} className={form.split_type === k ? 'on' : ''} onClick={() => set('split_type', k)}>{l}</button>)}
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 16, padding: '4px 14px' }}>
          {data.members.map((m, i) => (
            <div key={m.id} className="row" style={{ padding: '9px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
              {form.split_type === 'equal' && (
                <input type="checkbox" checked={included.has(m.id)} onChange={(e) => setIncluded((s) => { const n = new Set(s); e.target.checked ? n.add(m.id) : n.delete(m.id); return n; })} />
              )}
              <Avatar name={m.name} size="sm" />
              <span style={{ flex: 1, fontWeight: 600 }}>{m.is_me ? 'You' : m.name}</span>
              {form.split_type !== 'equal' && (
                <div className="input-wrap" style={{ width: 120 }}>
                  <span className="prefix" style={{ fontSize: 12 }}>{form.split_type === 'exact' ? currencySymbol(currency) : form.split_type === 'percent' ? '%' : '×'}</span>
                  <input className="input num" style={{ height: 36 }} inputMode="decimal" placeholder="0" value={values[m.id] || ''} onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value.replace(/[^0-9.]/g, '') }))} />
                </div>
              )}
              <span className="num muted" style={{ width: 90, textAlign: 'right', fontSize: 13 }}>{money(preview(m), currency)}</span>
            </div>
          ))}
        </div>
        {target !== null && (
          <div className={`insight ${Math.abs(sum - target) < 0.01 ? 'good' : 'warn'}`} style={{ padding: '8px 12px' }}>
            {form.split_type === 'exact'
              ? `${money(sum, currency)} of ${money(target, currency)} assigned${Math.abs(sum - target) >= 0.01 ? ` · ${money(target - sum, currency)} left` : ''}`
              : `${sum.toFixed(2).replace(/\.00$/, '')}% of 100% assigned`}
          </div>
        )}

        <label className="row" style={{ cursor: 'pointer', fontSize: 13.5 }}>
          <input type="checkbox" checked={form.add_to_ledger} onChange={(e) => set('add_to_ledger', e.target.checked)} />
          Also add my share to my personal transactions
        </label>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !form.description || !amount}>Add expense</button>
        </div>
      </form>
    </Modal>
  );
}

function SettleModal({ data, initial, onClose, onDone }) {
  const { currency, toast } = useApp();
  const others = data.members.find((m) => m.id !== data.me);
  const [form, setForm] = useState({
    from_member: initial.from_member ?? data.me,
    to_member: initial.to_member ?? others?.id,
    amount: initial.amount ?? '',
    date: todayISO(),
    note: '',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const label = (m) => (m.is_me ? 'You' : m.name);

  async function submit(e) {
    e.preventDefault();
    try {
      const r = await api(`/groups/${data.group.id}/settlements`, { method: 'POST', body: form });
      onDone(r.status === 'pending' ? `Sent to ${r.awaiting} to confirm` : 'Payment recorded');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Modal title="Record a payment" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Who paid">
            <select className="select" value={form.from_member} onChange={(e) => set('from_member', Number(e.target.value))}>
              {data.members.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
            </select>
          </Field>
          <ArrowRight size={18} className="muted" style={{ marginBottom: 12, flex: 'none' }} />
          <Field label="Paid to">
            <select className="select" value={form.to_member} onChange={(e) => set('to_member', Number(e.target.value))}>
              {data.members.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Amount">
          <div className="input-wrap"><span className="prefix lg">{currencySymbol(currency)}</span><input className="input input-lg num" inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value.replace(/[^0-9.]/g, ''))} /></div>
        </Field>
        <div className="grid g-2">
          <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Note"><input className="input" placeholder="UPI, cash…" value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!form.amount || form.from_member === form.to_member}>Record payment</button>
        </div>
      </form>
    </Modal>
  );
}

function MemberModal({ data, onClose, onChanged }) {
  const { toast } = useApp();
  const [added, setAdded] = useState(null); // { name, registered, invite_token }
  const [busy, setBusy] = useState(false);

  async function add(p) {
    setBusy(true);
    try {
      const { member } = await api(`/groups/${data.group.id}/members`, { method: 'POST', body: { user_id: p.user_id, phone: p.phone, name: p.name } });
      onChanged();
      if (member.registered) {
        toast(`${member.name} added — they can see the group now`);
        onClose();
      } else {
        setAdded(member);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (added) {
    const url = inviteUrl(added.invite_token);
    return (
      <Modal title="Send the invite" onClose={onClose}>
        <div className="stack">
          <div className="notice">
            <Avatar name={added.name} />
            <div style={{ flex: 1 }}>
              <b>{added.name} isn't on Jellyfish yet</b>
              <div className="muted" style={{ fontSize: 13 }}>Send them this link. They'll create an account (or log in) and land straight in "{data.group.name}".</div>
            </div>
          </div>
          <div className="code" style={{ whiteSpace: 'normal', wordBreak: 'break-all', fontSize: 12 }}>{url}</div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Later</button>
            <button className="btn btn-primary" onClick={() => share({ title: data.group.name, text: `Hey ${added.name}, join "${data.group.name}" on Jellyfish to see what we've split:`, url }, toast)}>
              <Share2 size={15} /> Share link
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a person" onClose={onClose}>
      <div className="stack" style={{ opacity: busy ? 0.6 : 1 }}>
        <PeoplePicker autoFocus onPick={add} exclude={data.members.map((m) => m.user_id).filter(Boolean)} />
        <div className="muted" style={{ fontSize: 12.5 }}>
          Friends on Jellyfish see the group instantly. Anyone else gets an invite link to join.
        </div>
      </div>
    </Modal>
  );
}

function EditGroupModal({ data, onClose, onDone }) {
  const { toast, refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(data.group.name);
  const [emoji, setEmoji] = useState(data.group.emoji);
  async function submit(e) {
    e.preventDefault();
    await api(`/groups/${data.group.id}`, { method: 'PATCH', body: { name, emoji } });
    onDone();
  }
  async function removeMember(m) {
    try {
      await api(`/groups/${data.group.id}/members/${m.id}`, { method: 'DELETE' });
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  async function del() {
    if (!confirm(`Delete "${data.group.name}" and all its expenses? This can't be undone.`)) return;
    try {
      await api(`/groups/${data.group.id}`, { method: 'DELETE' });
      toast('Group deleted');
      refresh();
      navigate('/splits');
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  return (
    <Modal title="Group settings" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="chip-row">
          {EMOJIS.map((em) => (
            <button type="button" key={em} onClick={() => setEmoji(em)} className="btn btn-icon" style={{ fontSize: 18, ...(emoji === em ? { borderColor: 'var(--violet)', boxShadow: '0 0 0 3px rgba(124,92,255,.15)' } : {}) }}>{em}</button>
          ))}
        </div>
        <div className="field">
          <span>Members</span>
          {data.members.filter((m) => !m.is_me).map((m) => (
            <div key={m.id} className="row"><Avatar name={m.name} size="sm" /><span style={{ flex: 1 }}>{m.name}</span><button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => removeMember(m)}>Remove</button></div>
          ))}
        </div>
        <div className="row">
          {data.group.is_owner && <button type="button" className="btn btn-ghost btn-danger" onClick={del}><Trash2 size={15} /> Delete group</button>}
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
