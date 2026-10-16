import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Utensils, Users, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../lib/store';
import { CURRENCIES } from '../lib/format';
import { Field } from '../components/ui';
import { BrandMark } from '../components/Layout';

function Art() {
  return (
    <div className="auth-art">
      <div className="blob" style={{ width: 420, height: 420, background: '#E5489B', right: -140, top: -120 }} />
      <div className="blob" style={{ width: 360, height: 360, background: '#7C5CFF', left: -120, bottom: 40, opacity: 0.7 }} />
      <div className="blob" style={{ width: 260, height: 260, background: '#FF8A4C', right: 60, bottom: -120, opacity: 0.8 }} />
      <div className="row" style={{ position: 'relative', zIndex: 1 }}>
        <BrandMark /><span className="brand-name" style={{ color: '#fff' }}>Tally</span>
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <h1>Money, <em>beautifully</em> kept.</h1>
        <p style={{ color: 'rgba(255,255,255,.7)', maxWidth: 420, fontSize: 16, marginTop: 18 }}>
          Every rupee, card swipe and shared dinner — logged automatically from your phone, settled with friends in a tap.
        </p>
      </div>
      <div className="stack" style={{ position: 'relative', zIndex: 1, gap: 12 }}>
        <div className="floaty"><span className="cat-ic" style={{ background: 'rgba(255,122,89,.2)', color: '#FFB49E' }}><Utensils size={18} /></span><div style={{ flex: 1 }}><b>Dinner at Toit</b><div style={{ fontSize: 12, opacity: .65 }}>Food · auto-logged</div></div><b>₹1,840</b></div>
        <div className="floaty" style={{ marginLeft: 60 }}><span className="cat-ic" style={{ background: 'rgba(124,92,255,.25)', color: '#C9BCFF' }}><Users size={18} /></span><div style={{ flex: 1 }}><b>Goa Trip</b><div style={{ fontSize: 12, opacity: .65 }}>You're owed</div></div><b style={{ color: '#7DE8C1' }}>₹4,200</b></div>
        <div className="floaty"><span className="cat-ic" style={{ background: 'rgba(59,167,255,.22)', color: '#A9D6FF' }}><Smartphone size={18} /></span><div style={{ flex: 1 }}><b>Shortcut synced</b><div style={{ fontSize: 12, opacity: .65 }}>via Tally API</div></div></div>
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} placeholder="••••••••" style={{ paddingRight: 44 }} />
      <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ position: 'absolute', right: 4, top: 5 }} onClick={() => setShow((s) => !s)} aria-label="Toggle password visibility">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function Login() {
  return <AuthForm mode="login" />;
}
export function Signup() {
  return <AuthForm mode="signup" />;
}

function AuthForm({ mode }) {
  const signup = mode === 'signup';
  const { login } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Where to go after logging in (e.g. back to an invite link). Only same-site paths.
  const rawNext = params.get('next') || '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
  const carry = next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  const [form, setForm] = useState({ name: '', phone: '', password: '', currency: 'INR' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    try {
      const { token, user } = await api(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body: form });
      await login(token, user);
      navigate(next, { replace: true });
    } catch (err) {
      setErrors(err.details || {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <form className="stack" onSubmit={submit} style={{ gap: 16 }}>
          <div className="mobile-top" style={{ padding: 0, marginBottom: 20 }}>
            <div className="row" style={{ gap: 8 }}><BrandMark size={30} /><span className="brand-name" style={{ fontSize: 24 }}>Tally</span></div>
          </div>
          <div>
            <div className="eyebrow">{signup ? 'Get started' : 'Welcome back'}</div>
            <h2 className="page-title" style={{ fontSize: 44 }}>
              {signup ? <>Create your <em className="grad-text">account</em></> : <>Log <em className="grad-text">in</em></>}
            </h2>
          </div>
          {signup && (
            <Field label="Your name" error={errors.name}>
              <input className="input" value={form.name} onChange={set('name')} autoComplete="name" placeholder="Asha Rao" />
            </Field>
          )}
          <Field label="Phone number" error={errors.phone}>
            <input className="input" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" placeholder="+91 98765 43210" />
          </Field>
          <Field label="Password" error={errors.password}>
            <PasswordInput value={form.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} />
          </Field>
          {signup && (
            <Field label="Currency">
              <select className="select" value={form.currency} onChange={set('currency')}>
                {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          )}
          {error && !Object.keys(errors).length && <div className="insight bad">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account' : 'Log in'}</button>
          <div className="muted" style={{ textAlign: 'center' }}>
            {signup ? <>Already have an account? <Link className="link" to={`/login${carry}`}>Log in</Link></> : <>New to Tally? <Link className="link" to={`/signup${carry}`}>Create an account</Link></>}
          </div>
        </form>
      </div>
    </div>
  );
}
