import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { BrandMark } from '../components/Logo';

/** Landing page for invite links: preview the group, then sign up / log in / join. */
export default function Join() {
  const { token } = useParams();
  const { user, toast, refresh } = useApp();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/join/${token}`);

  useEffect(() => {
    api(`/invites/${token}`).then(setInvite).catch((e) => setError(e.message));
  }, [token]);

  async function join() {
    setBusy(true);
    try {
      const { group_id, already } = await api(`/invites/${token}/accept`, { method: 'POST' });
      toast(already ? "You're already in this group" : `Welcome to ${invite.group.name}!`);
      refresh();
      navigate(`/splits/${group_id}`, { replace: true });
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 20, background: 'var(--grad-soft)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 30, textAlign: 'center', boxShadow: 'var(--shadow-lg)' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 22 }}>
          <BrandMark size={30} /><span className="brand-name" style={{ fontSize: 24 }}>Jellyfish</span>
        </div>
        {error ? (
          <>
            <div className="serif" style={{ fontSize: 30 }}>Link not working</div>
            <p className="muted">{error}. Ask your friend to send a fresh invite.</p>
            <Link className="btn" to="/">Go to Jellyfish</Link>
          </>
        ) : !invite ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : (
          <>
            <div style={{ fontSize: 44, width: 84, height: 84, margin: '0 auto 14px', display: 'grid', placeItems: 'center', borderRadius: 26, background: '#fff', boxShadow: 'var(--shadow)' }}>
              {invite.group.emoji}
            </div>
            <div className="muted" style={{ fontSize: 13.5 }}>{invite.group.owner || 'A friend'} invited you to</div>
            <h1 className="page-title" style={{ fontSize: 38, margin: '4px 0 6px' }}>{invite.group.name}</h1>
            <div className="muted row" style={{ justifyContent: 'center', gap: 6, fontSize: 13 }}>
              <Users size={14} /> {invite.group.members} people splitting expenses
            </div>
            {invite.invited_as && (
              <div className="insight info" style={{ marginTop: 16, textAlign: 'left' }}>
                <span>You were added as <b>“{invite.invited_as}”</b>. Joining links everything already split with you to your account.</span>
              </div>
            )}
            <div className="stack" style={{ marginTop: 22, gap: 10 }}>
              {user ? (
                <button className="btn btn-grad btn-block" disabled={busy} onClick={join}>Join as {user.name}</button>
              ) : (
                <>
                  <Link className="btn btn-grad btn-block" to={`/signup?next=${next}`}>Create an account to join</Link>
                  <Link className="btn btn-block" to={`/login?next=${next}`}>I already have an account</Link>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
