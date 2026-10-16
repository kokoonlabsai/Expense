import { useEffect, useRef, useState } from 'react';
import { Search, UserPlus, Link2 } from 'lucide-react';
import { api } from '../lib/api';
import { Avatar } from './ui';

const digitsOf = (s) => s.replace(/\D/g, '');
const toPick = (p) => (p.known ? { user_id: p.id, name: p.name, onJellyfish: true } : { phone: p.phone, name: p.name, onJellyfish: true });

/**
 * Search people to add to a split. Calls onPick with one of:
 *   { user_id, name, onJellyfish } someone you already share a group with
 *   { phone, name, onJellyfish }   a Jellyfish user found by their number (no onJellyfish: a number to invite)
 *   { name }                   someone not on Jellyfish — they'll get an invite link
 */
export default function PeoplePicker({ onPick, exclude = [], autoFocus, placeholder = 'Search a name or phone number' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api('/people', { query: { q: term } })
        .then((r) => setResults(r.people))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const reset = () => { setQ(''); setResults([]); setInviteName(''); inputRef.current?.focus(); };
  const pick = (p) => { onPick(p); reset(); };

  const term = q.trim();
  const isPhone = digitsOf(term).length >= 10;
  const shown = results.filter((p) => !exclude.includes(p.id));

  return (
    <div className="picker">
      <div className="input-wrap">
        <Search size={16} className="prefix" />
        <input
          ref={inputRef}
          className="input"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (shown[0]) pick(toPick(shown[0]));
            else if (term && !isPhone) pick({ name: term });
          }}
        />
      </div>

      {term && (
        <div className="picker-menu">
          {shown.map((p) => (
            <button type="button" key={p.id} className="picker-row" onClick={() => pick(toPick(p))}>
              <Avatar name={p.name} size="sm" />
              <span style={{ flex: 1, textAlign: 'left' }}>
                <b>{p.name}</b>
                <span className="muted" style={{ fontSize: 12, display: 'block' }}>{p.phone_hint} · on Jellyfish</span>
              </span>
              <UserPlus size={16} className="muted" />
            </button>
          ))}

          {loading && !shown.length && <div className="picker-note">Searching…</div>}

          {!loading && !isPhone && (
            <button type="button" className="picker-row" onClick={() => pick({ name: term })}>
              <span className="avatar sm" style={{ background: 'var(--grad)' }}><Link2 size={14} /></span>
              <span style={{ flex: 1, textAlign: 'left' }}>
                <b>Add “{term}”</b>
                <span className="muted" style={{ fontSize: 12, display: 'block' }}>Not on Jellyfish? You'll get an invite link to send them</span>
              </span>
            </button>
          )}

          {!loading && isPhone && !shown.length && (
            <form className="picker-row" style={{ cursor: 'default' }} onSubmit={(e) => { e.preventDefault(); if (inviteName.trim()) pick({ phone: term, name: inviteName.trim() }); }}>
              <span className="avatar sm" style={{ background: 'var(--grad)' }}><Link2 size={14} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>No one on Jellyfish with this number yet. What's their name?</span>
                <span className="row" style={{ gap: 6 }}>
                  <input className="input" style={{ height: 34 }} placeholder="Name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
                  <button className="btn btn-sm btn-primary" disabled={!inviteName.trim()}>Add</button>
                </span>
              </span>
            </form>
          )}

          {!loading && !isPhone && !shown.length && (
            <div className="picker-note">Tip: type their full phone number to find friends already on Jellyfish.</div>
          )}
        </div>
      )}
    </div>
  );
}
