import { useEffect, useState } from 'react';
import { Bell, BellOff, Check, Download, Share, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { currentSubscription, disablePush, enablePush, pushSupported, useInstall } from '../lib/pwa';

/** Settings card: install Tally as an app and turn notifications on for this device. */
export default function AppCard() {
  const { toast } = useApp();
  const { standalone, ios, canInstall, install } = useInstall();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();
  const permission = supported ? Notification.permission : 'unsupported';

  useEffect(() => {
    currentSubscription().then((s) => setSubscribed(!!s)).catch(() => {});
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      await enablePush();
      setSubscribed(true);
      const { sent } = await api('/push/test', { method: 'POST' });
      toast(sent ? 'Notifications on — check for a test message' : 'Notifications on');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  async function turnOff() {
    setBusy(true);
    await disablePush();
    setSubscribed(false);
    setBusy(false);
    toast('Notifications off for this device');
  }
  async function test() {
    const { sent } = await api('/push/test', { method: 'POST' });
    toast(sent ? 'Test sent' : 'No devices are set up yet', sent ? 'ok' : 'error');
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-start', marginBottom: 6 }}>
        <span className="dot-ic" style={{ background: 'var(--ink)', color: '#fff', width: 38, height: 38, borderRadius: 12 }}><Bell size={18} /></span>
        <div>
          <h3 className="card-title" style={{ fontSize: 16 }}>App & notifications</h3>
          <div className="card-sub">Get Tally on your home screen and hear when friends split or settle with you.</div>
        </div>
      </div>

      <div className="steps">
        <div className="step">
          <span className={`step-num ${standalone ? 'done' : ''}`}>{standalone ? <Check size={15} /> : <Smartphone size={14} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>{standalone ? 'Installed on this device' : 'Install the app'}</h4>
            {standalone ? (
              <p style={{ marginBottom: 0 }}>You're using Tally as an app.</p>
            ) : canInstall ? (
              <>
                <p>Opens full-screen from your home screen, like any other app.</p>
                <button className="btn btn-primary" onClick={install}><Download size={15} /> Install Tally</button>
              </>
            ) : ios ? (
              <p style={{ marginBottom: 0 }}>
                In Safari, tap <b>Share</b> <Share size={13} style={{ verticalAlign: -2 }} /> then <b>Add to Home Screen</b>. Open Tally from there.
              </p>
            ) : (
              <p style={{ marginBottom: 0 }}>Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
            )}
          </div>
        </div>

        <div className="step">
          <span className={`step-num ${subscribed ? 'done' : ''}`}>{subscribed ? <Check size={15} /> : <Bell size={14} />}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>{subscribed ? 'Notifications are on' : 'Turn on notifications'}</h4>
            {!supported ? (
              <p style={{ marginBottom: 0 }}>
                {ios && !standalone
                  ? 'On iPhone, notifications work once Tally is on your Home Screen. Install it first (above), then come back here from the app.'
                  : "This browser doesn't support notifications."}
              </p>
            ) : permission === 'denied' ? (
              <p style={{ marginBottom: 0 }}>Notifications are blocked for Tally. Allow them in your {ios ? 'iPhone Settings → Notifications → Tally' : 'browser’s site settings'}, then try again.</p>
            ) : subscribed ? (
              <>
                <p>On this device you'll hear when someone adds you to a group, splits a bill with you, pays you, confirms your payment, or when you go over a budget.</p>
                <div className="row row-wrap">
                  <button className="btn" onClick={test}>Send a test</button>
                  <button className="btn btn-ghost" disabled={busy} onClick={turnOff}><BellOff size={15} /> Turn off</button>
                </div>
              </>
            ) : (
              <>
                <p>Know when a friend pays you, adds a bill you're part of, or reminds you to settle up.</p>
                <button className="btn btn-grad" disabled={busy} onClick={turnOn}><Bell size={15} /> Turn on notifications</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
