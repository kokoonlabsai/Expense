import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Smartphone, X } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { enablePush, isIOS, isStandalone, pushSupported } from '../lib/pwa';

const KEY = 'tally.nudge.dismissed';
const dismissedBefore = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

/** One-time, dismissible prompt on the dashboard to install the app / turn on notifications. */
export default function AppNudge() {
  const { toast } = useApp();
  const [hidden, setHidden] = useState(dismissedBefore);
  if (hidden) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
    setHidden(true);
  };

  let content = null;
  if (isIOS() && !isStandalone()) {
    content = (
      <>
        <span className="cat-ic" style={{ background: '#fff', color: 'var(--violet)' }}><Smartphone size={18} /></span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b>Put Tally on your Home Screen</b>
          <div className="muted" style={{ fontSize: 12.5 }}>It opens like an app and can notify you when friends pay you.</div>
        </div>
        <Link to="/settings" className="btn btn-sm btn-primary">Show me</Link>
      </>
    );
  } else if (pushSupported() && Notification.permission === 'default') {
    content = (
      <>
        <span className="cat-ic" style={{ background: '#fff', color: 'var(--pink)' }}><Bell size={18} /></span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <b>Turn on notifications</b>
          <div className="muted" style={{ fontSize: 12.5 }}>Know when a friend pays you, splits a bill with you, or you go over budget.</div>
        </div>
        <button
          className="btn btn-sm btn-primary"
          onClick={async () => {
            try {
              await enablePush();
              await api('/push/test', { method: 'POST' });
              toast('Notifications on');
              dismiss();
            } catch (e) {
              toast(e.message, 'error');
            }
          }}
        >
          Turn on
        </button>
      </>
    );
  }
  if (!content) return null;
  return (
    <div className="notice dismissible" style={{ marginBottom: 18 }}>
      {content}
      <button className="btn btn-ghost btn-icon btn-sm notice-close" onClick={dismiss} aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}
