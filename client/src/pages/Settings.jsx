import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, KeyRound, Plus, Smartphone, Trash2, Apple, Bot, Terminal } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { CURRENCIES, dayLabel } from '../lib/format';
import { Field, Modal } from '../components/ui';

function copy(text, toast) {
  navigator.clipboard?.writeText(text).then(() => toast('Copied to clipboard'), () => toast('Copy failed', 'error'));
}

export default function Settings() {
  const { user, setUser, toast, refresh, logout, categories } = useApp();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ name: user.name, currency: user.currency });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null);
  const [lastKey, setLastKey] = useState(null); // keep the fresh key in the examples for this visit
  const [tab, setTab] = useState('ios');

  const loadKeys = () => api('/auth/keys').then((r) => setKeys(r.keys));
  useEffect(() => { loadKeys(); }, []);

  async function saveProfile(e) {
    e.preventDefault();
    try {
      const { user: u } = await api('/auth/me', { method: 'PATCH', body: profile });
      setUser(u);
      refresh();
      toast('Profile saved');
    } catch (err) { toast(err.message, 'error'); }
  }
  async function savePw(e) {
    e.preventDefault();
    try {
      await api('/auth/me', { method: 'PATCH', body: pw });
      setPw({ current_password: '', new_password: '' });
      toast('Password updated');
    } catch (err) { toast(err.message, 'error'); }
  }
  async function createKey() {
    const label = prompt('Name this key (e.g. "iPhone Shortcut")', 'iPhone Shortcut');
    if (label === null) return;
    const k = await api('/auth/keys', { method: 'POST', body: { label } });
    setNewKey(k);
    setLastKey(k.key);
    loadKeys();
  }
  async function revoke(k) {
    if (!confirm(`Revoke "${k.label}"? Automations using it will stop working.`)) return;
    await api(`/auth/keys/${k.id}`, { method: 'DELETE' });
    loadKeys();
    toast('Key revoked');
  }
  async function deleteAccount() {
    if (prompt('This permanently deletes your account and data. Type DELETE to confirm.') !== 'DELETE') return;
    await api('/auth/me', { method: 'DELETE' });
    logout();
    navigate('/signup');
  }

  const origin = window.location.origin;
  const keyText = lastKey || 'tly_YOUR_API_KEY';
  const catList = categories.map((c) => c.slug).join(', ');
  const curl = `curl -X POST ${origin}/api/v1/transactions \\
  -H "Authorization: Bearer ${keyText}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 450,
    "date": "2026-10-12",
    "name": "Blue Tokai Coffee",
    "category": "food"
  }'`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1 className="page-title"><em>Settings</em></h1>
        </div>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <div className="card">
          <div className="card-head">
            <div className="row">
              <span className="dot-ic" style={{ background: 'var(--grad)', color: '#fff', width: 34, height: 34, borderRadius: 11 }}><Smartphone size={17} /></span>
              <div><h3 className="card-title">Phone automation API</h3><div className="card-sub">Log expenses from iPhone Shortcuts, Android Tasker / MacroDroid, bank SMS rules — anything that can send an HTTP request.</div></div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={createKey}><Plus size={14} /> New key</button>
          </div>

          {keys.length ? (
            <table className="table" style={{ marginBottom: 18 }}>
              <thead><tr><th>Key</th><th className="hide-sm">Created</th><th>Last used</th><th /></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td><div style={{ fontWeight: 600 }}>{k.label}</div><code className="muted" style={{ fontSize: 12 }}>{k.prefix}…</code></td>
                    <td className="hide-sm muted">{dayLabel(k.created_at.slice(0, 10))}</td>
                    <td className="muted">{k.last_used_at ? dayLabel(k.last_used_at.slice(0, 10)) : 'Never'}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm btn-danger" onClick={() => revoke(k)}><Trash2 size={14} /> Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="insight info" style={{ marginBottom: 18 }}><KeyRound size={16} /> Create an API key to connect your first automation.</div>
          )}

          <div className="grid g-2" style={{ gap: 18, alignItems: 'start' }}>
            <div className="stack" style={{ gap: 10 }}>
              <div className="eyebrow">Request format</div>
              <div style={{ fontSize: 13.5 }}>
                <b>POST</b> <code>{origin}/api/v1/transactions</code>
              </div>
              <table className="table" style={{ fontSize: 13 }}>
                <tbody>
                  <tr><td><code>amount</code></td><td className="muted">Required. <code>450</code>, <code>"₹1,250.50"</code></td></tr>
                  <tr><td><code>name</code></td><td className="muted">Required. Merchant or description</td></tr>
                  <tr><td><code>category</code></td><td className="muted">Slug or name, case-insensitive. Unknown → <code>other</code></td></tr>
                  <tr><td><code>date</code></td><td className="muted">Optional, defaults to today. <code>2026-10-12</code>, <code>12/10/2026</code>, <code>12 Oct 2026</code></td></tr>
                  <tr><td><code>type</code></td><td className="muted">Optional. <code>expense</code> (default) or <code>income</code></td></tr>
                  <tr><td><code>note</code>, <code>person</code></td><td className="muted">Optional. <code>person</code> = who you lent to</td></tr>
                </tbody>
              </table>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Auth header: <code>Authorization: Bearer tly_…</code> or <code>X-API-Key: tly_…</code>. Send an array (or <code>{'{"transactions": [...]}'}</code>) to add up to 200 at once.
                Also: <code>GET /api/v1/summary</code> (this month's total), <code>GET /api/v1/categories</code>.
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>Your categories: <code style={{ whiteSpace: 'normal' }}>{catList}</code></div>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              <div className="seg" style={{ alignSelf: 'flex-start' }}>
                <button className={tab === 'ios' ? 'on' : ''} onClick={() => setTab('ios')}><Apple size={13} style={{ verticalAlign: -2 }} /> iPhone</button>
                <button className={tab === 'android' ? 'on' : ''} onClick={() => setTab('android')}><Bot size={13} style={{ verticalAlign: -2 }} /> Android</button>
                <button className={tab === 'curl' ? 'on' : ''} onClick={() => setTab('curl')}><Terminal size={13} style={{ verticalAlign: -2 }} /> cURL</button>
              </div>
              {tab === 'ios' && (
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.75 }}>
                  <li>Open <b>Shortcuts</b> → <b>+</b> new shortcut.</li>
                  <li>Add <b>Ask for Input</b> (Number) → “Amount”, another for “Name”, and <b>Choose from Menu</b> for category (bills, shopping, food…).</li>
                  <li>Add <b>Get Contents of URL</b> with URL <code>{origin}/api/v1/transactions</code>.</li>
                  <li>Method <b>POST</b>; add header <code>Authorization</code> = <code>Bearer {keyText.slice(0, 14)}…</code></li>
                  <li>Request Body <b>JSON</b>: <code>amount</code>, <code>name</code>, <code>category</code>, and <code>date</code> (Current Date, format ISO 8601).</li>
                  <li>Optional: <b>Show Notification</b> with the response’s <code>message</code>. Tip: trigger it from a <b>Wallet / Transaction</b> automation to log Apple Pay taps automatically.</li>
                </ol>
              )}
              {tab === 'android' && (
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.75 }}>
                  <li>Install <b>HTTP Shortcuts</b>, <b>MacroDroid</b> or <b>Tasker</b>.</li>
                  <li>Create an <b>HTTP Request</b> action: POST to <code>{origin}/api/v1/transactions</code>.</li>
                  <li>Header <code>Authorization: Bearer {keyText.slice(0, 14)}…</code>, content type <code>application/json</code>.</li>
                  <li>Body: <code>{'{"amount": "%amount", "name": "%name", "category": "%cat", "date": "%date"}'}</code></li>
                  <li>Trigger it from a home-screen button, or from a <b>Notification / SMS received</b> trigger that extracts the amount from your bank alert.</li>
                </ol>
              )}
              {tab === 'curl' && (
                <>
                  <div className="code">{curl}</div>
                  <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => copy(curl, toast)}><Copy size={14} /> Copy</button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid g-2">
          <form className="card stack" onSubmit={saveProfile}>
            <h3 className="card-title">Profile</h3>
            <Field label="Name"><input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label="Phone" hint="Your phone number is your login."><input className="input" value={user.phone} disabled /></Field>
            <Field label="Currency">
              <select className="select" value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Save profile</button>
          </form>
          <form className="card stack" onSubmit={savePw}>
            <h3 className="card-title">Password</h3>
            <Field label="Current password"><input className="input" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New password" hint="At least 6 characters"><input className="input" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!pw.current_password || !pw.new_password}>Update password</button>
            <div className="divider" style={{ margin: '6px 0' }} />
            <div className="row">
              <button type="button" className="btn" onClick={() => { logout(); navigate('/login'); }}>Log out</button>
              <div className="spacer" />
              <button type="button" className="btn btn-ghost btn-danger" onClick={deleteAccount}>Delete account</button>
            </div>
          </form>
        </div>
      </div>

      {newKey && (
        <Modal title="Your new API key" onClose={() => setNewKey(null)}>
          <div className="stack">
            <div className="insight warn">Copy it now — for your security it won't be shown again.</div>
            <div className="code" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{newKey.key}</div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => copy(newKey.key, toast)}><Copy size={14} /> Copy key</button>
              <button className="btn btn-primary" onClick={() => setNewKey(null)}>Done</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
