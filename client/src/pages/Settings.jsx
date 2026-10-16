import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Copy, KeyRound, Smartphone, Trash2 } from 'lucide-react';
import { api, API_ORIGIN } from '../lib/api';
import { useApp } from '../lib/store';
import { CURRENCIES, dayLabel } from '../lib/format';
import { Field } from '../components/ui';
import AppCard from '../components/AppCard';
import { disablePush } from '../lib/pwa';

function copy(text, toast, what = 'Copied') {
  navigator.clipboard?.writeText(text).then(() => toast(what), () => toast('Copy failed', 'error'));
}

/** The text people paste into the Shortcuts app's AI box to build the shortcut for them. */
function shortcutPrompt(url, key, categories) {
  return `Create a shortcut called "Log Expense" that does the following, in this order:

1. Ask me for a number with the prompt "Amount?".
2. Ask me for text with the prompt "What was it?".
3. Let me choose from this list with the prompt "Category?": ${categories.join(', ')}.
4. Send a POST request using "Get Contents of URL" to:
   ${url}
   with a header named "Authorization" whose value is exactly:
   Bearer ${key}
   and a JSON request body with these fields:
   - "amount" (number): the amount from step 1
   - "name" (text): the text from step 2
   - "category" (text): the item chosen in step 3
   - "date" (text): the current date formatted as ISO 8601
5. From the response, get the dictionary value for the key "message".
6. Show a notification with that message.`;
}

export default function Settings() {
  const { user, setUser, toast, refresh, logout } = useApp();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ name: user.name, currency: user.currency });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });

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
  async function deleteAccount() {
    if (prompt('This permanently deletes your account and data. Type DELETE to confirm.') !== 'DELETE') return;
    await api('/auth/me', { method: 'DELETE' });
    logout();
    navigate('/signup');
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1 className="page-title"><em>Settings</em></h1>
        </div>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <AppCard />
        <PhoneShortcut />

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
              <button type="button" className="btn" onClick={async () => { await disablePush(); logout(); navigate('/login'); }}>Log out</button>
              <div className="spacer" />
              <button type="button" className="btn btn-ghost btn-danger" onClick={deleteAccount}>Delete account</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function PhoneShortcut() {
  const { toast, categories } = useApp();
  const [keys, setKeys] = useState([]);
  const [fresh, setFresh] = useState(null); // the key we just created — only shown once
  const [copied, setCopied] = useState(false);

  const loadKeys = () => api('/auth/keys').then((r) => setKeys(r.keys)).catch(() => {});
  useEffect(() => { loadKeys(); }, []);

  const url = `${API_ORIGIN || window.location.origin}/api/v1/transactions`;
  const key = fresh || 'YOUR_KEY';
  const slugs = categories.filter((c) => c.slug !== 'income').map((c) => c.slug);

  async function createKey() {
    try {
      const k = await api('/auth/keys', { method: 'POST', body: { label: `iPhone · ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}` } });
      setFresh(k.key);
      loadKeys();
    } catch (err) { toast(err.message, 'error'); }
  }
  async function revoke(k) {
    if (!confirm(`Disconnect "${k.label}"? Shortcuts using it will stop working.`)) return;
    await api(`/auth/keys/${k.id}`, { method: 'DELETE' });
    loadKeys();
    toast('Key removed');
  }
  function copyPrompt() {
    copy(shortcutPrompt(url, key, slugs), toast, 'Prompt copied — paste it in Shortcuts');
    setCopied(true);
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
        <span className="dot-ic" style={{ background: 'var(--grad)', color: '#fff', width: 38, height: 38, borderRadius: 12 }}><Smartphone size={18} /></span>
        <div>
          <h3 className="card-title" style={{ fontSize: 16 }}>Log expenses from your iPhone</h3>
          <div className="card-sub">Add an expense in seconds with Siri, a home-screen button, or a double-tap on the back of your phone.</div>
        </div>
      </div>

      <div className="steps">
        <div className="step">
          <span className={`step-num ${fresh ? 'done' : ''}`}>{fresh ? <Check size={15} /> : 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>Create your key</h4>
            <p>It's a password just for the shortcut. You'll only see it once.</p>
            {fresh ? (
              <div className="row" style={{ gap: 8 }}>
                <code className="input" style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{fresh}</code>
                <button className="btn" onClick={() => copy(fresh, toast, 'Key copied')}><Copy size={14} /> Copy</button>
              </div>
            ) : (
              <button className="btn btn-primary" onClick={createKey}><KeyRound size={15} /> Create key</button>
            )}
          </div>
        </div>

        <div className="step">
          <span className={`step-num ${copied ? 'done' : ''}`}>{copied ? <Check size={15} /> : 2}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>Let your iPhone build the shortcut</h4>
            <p>Open the <b>Shortcuts</b> app, tap <b>+</b>, and paste this into the AI box. {fresh ? 'Your key is already filled in.' : 'Replace YOUR_KEY with your key.'}</p>
            <button className="btn btn-grad" onClick={copyPrompt}><Copy size={14} /> Copy setup prompt</button>
          </div>
        </div>

        <div className="step">
          <span className="step-num">3</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>Turn on double-tap <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></h4>
            <p style={{ marginBottom: 0 }}>Settings → Accessibility → Touch → Back Tap → Double Tap → <b>Log Expense</b></p>
          </div>
        </div>
      </div>

      {keys.length > 0 && (
        <>
          <div className="divider" style={{ margin: '14px 0 6px' }} />
          <div className="eyebrow" style={{ fontSize: 11 }}>Connected</div>
          {keys.map((k) => (
            <div key={k.id} className="row" style={{ padding: '8px 0', fontSize: 13.5 }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{k.label}</b> <span className="muted">· {k.last_used_at ? `last used ${dayLabel(k.last_used_at.slice(0, 10)).toLowerCase()}` : 'not used yet'}</span>
              </span>
              <button className="btn btn-ghost btn-sm btn-danger" onClick={() => revoke(k)}><Trash2 size={13} /> Remove</button>
            </div>
          ))}
        </>
      )}

      <div className="divider" style={{ margin: '12px 0' }} />
      <details className="more">
        <summary>Using Android, or building it yourself? Show details ›</summary>
        <div className="stack" style={{ gap: 10, fontSize: 13.5 }}>
          <div>Send a <b>POST</b> request to this address with the header <code>Authorization: Bearer {fresh ? `${fresh.slice(0, 10)}…` : 'YOUR_KEY'}</code>:</div>
          <div className="row" style={{ gap: 8 }}>
            <code className="input" style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 12.5 }}>{url}</code>
            <button className="btn" onClick={() => copy(url, toast, 'Address copied')}><Copy size={14} /></button>
          </div>
          <div>Body (JSON): <code>{'{"amount": 120, "name": "Coffee", "category": "food"}'}</code>. The date is optional and defaults to today.</div>
          <div className="muted" style={{ fontSize: 12.5 }}>Categories: {slugs.join(', ')}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>On Android, apps like <b>HTTP Shortcuts</b> or <b>MacroDroid</b> can send this from a home-screen button.</div>
        </div>
      </details>
    </div>
  );
}
