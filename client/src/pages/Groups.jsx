import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { money } from '../lib/format';
import { Avatar, Empty, Field, Modal, Money } from '../components/ui';
import PeoplePicker from '../components/PeoplePicker';

export const EMOJIS = ['✨', '🏖️', '🏠', '🍕', '✈️', '🎉', '🚗', '🏔️', '💼', '🎓', '🛒', '❤️'];

export default function Groups() {
  const { version, currency, toast } = useApp();
  const [groups, setGroups] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api('/groups').then((r) => setGroups(r.groups)).catch((e) => toast(e.message, 'error'));
  }, [version, toast]);

  const owed = groups?.reduce((a, g) => a + Math.max(0, g.my_balance), 0) || 0;
  const owe = groups?.reduce((a, g) => a + Math.max(0, -g.my_balance), 0) || 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Shared expenses</div>
          <h1 className="page-title">Split it, <em>settle</em> it</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New group</button>
      </div>

      {groups && groups.length > 0 && (
        <div className="grid g-3" style={{ marginBottom: 18 }}>
          <div className="card stat"><div className="k">You are owed</div><div className="v pos num">{money(owed, currency)}</div><div className="s">across all groups</div></div>
          <div className="card stat"><div className="k">You owe</div><div className="v neg num">{money(owe, currency)}</div><div className="s">across all groups</div></div>
          <div className="card stat"><div className="k">Net position</div><div className="v num">{owed - owe >= 0 ? '+' : '−'}{money(Math.abs(owed - owe), currency)}</div><div className="s">{groups.length} group{groups.length > 1 ? 's' : ''}</div></div>
        </div>
      )}

      {!groups ? (
        <div className="grid g-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 170 }} />)}</div>
      ) : groups.length ? (
        <div className="grid g-3">
          {groups.map((g) => (
            <Link key={g.id} to={`/splits/${g.id}`} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, transition: 'box-shadow .15s, transform .15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 30, width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 16, background: 'var(--grad-soft)' }}>{g.emoji}</span>
                <div className="avatar-stack">{g.members.slice(0, 4).map((m) => <Avatar key={m.id} name={m.name} size="sm" />)}{g.members.length > 4 && <span className="avatar sm" style={{ background: '#CFCBD6' }}>+{g.members.length - 4}</span>}</div>
              </div>
              <div>
                <div className="serif" style={{ fontSize: 26, lineHeight: 1.1 }}>{g.name}</div>
                {g.to_confirm > 0 && <span className="badge" style={{ background: '#fff4e0', color: '#9a5b00', margin: '4px 0' }}>{g.to_confirm} payment{g.to_confirm > 1 ? 's' : ''} to confirm</span>}
                <div className="muted" style={{ fontSize: 12.5 }}>{g.members.length} people · {g.expense_count} expense{g.expense_count === 1 ? '' : 's'} · {money(g.total, currency)} total</div>
              </div>
              <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted" style={{ fontSize: 13 }}>{g.my_balance > 0 ? "You're owed" : g.my_balance < 0 ? 'You owe' : 'All settled'}</span>
                {g.my_balance !== 0 && <b><Money value={Math.abs(g.my_balance)} className={g.my_balance > 0 ? 'pos' : 'neg'} /></b>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty icon={Users} title="No groups yet" action={<button className="btn btn-grad" onClick={() => setCreating(true)}><Plus size={16} /> Create a group</button>}>
            Make a group for a trip, your flat or a dinner. Add expenses, split them however you like, and settle up.
          </Empty>
        </div>
      )}

      {creating && <CreateGroup onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateGroup({ onClose }) {
  const { toast, user } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✨');
  const [members, setMembers] = useState([]);
  const [busy, setBusy] = useState(false);

  const addPerson = (p) => {
    const key = p.user_id ? `u${p.user_id}` : p.phone ? `p${p.phone}` : `n${p.name.toLowerCase()}`;
    setMembers((ms) => (ms.some((m) => m.key === key) ? ms : [...ms, { ...p, key }]));
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = members.map(({ user_id, phone, name: n }) => ({ user_id, phone, name: n }));
      const { id } = await api('/groups', { method: 'POST', body: { name, emoji, members: body } });
      toast('Group created');
      navigate(`/splits/${id}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal title="New group" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Group name">
          <input className="input" autoFocus placeholder="Goa trip, Flat 4B, Friday dinners…" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Icon">
          <div className="chip-row">
            {EMOJIS.map((em) => (
              <button type="button" key={em} onClick={() => setEmoji(em)} className="btn btn-icon" style={{ fontSize: 18, ...(emoji === em ? { borderColor: 'var(--violet)', boxShadow: '0 0 0 3px rgba(124,92,255,.15)' } : {}) }}>{em}</button>
            ))}
          </div>
        </Field>
        <div className="field">
          <span>Who's in?</span>
          <PeoplePicker onPick={addPerson} exclude={members.filter((m) => m.user_id).map((m) => m.user_id)} />
          <div>
            <div className="picked" style={{ borderTop: 0 }}>
              <Avatar name={user.name} size="sm" />
              <span style={{ flex: 1, fontWeight: 600 }}>You</span>
            </div>
            {members.map((m) => (
              <div key={m.key} className="picked">
                <Avatar name={m.name} size="sm" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{m.name}</b>
                  <span className="muted" style={{ fontSize: 12, display: 'block' }}>
                    {m.onJellyfish ? 'On Jellyfish · sees the group right away' : m.phone ? 'Joins automatically when they sign up with this number' : "You'll get an invite link to send them"}
                  </span>
                </span>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setMembers((ms) => ms.filter((x) => x.key !== m.key))} aria-label="Remove"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>Create group</button>
        </div>
      </form>
    </Modal>
  );
}
