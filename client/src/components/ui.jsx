import { useEffect } from 'react';
import {
  Utensils, ShoppingBasket, ShoppingBag, Receipt, HandCoins, Sparkles, Car, Plane, HeartPulse, Clapperboard,
  GraduationCap, TrendingUp, House, Repeat, Wallet, CircleDashed, Tag, Coffee, Gift, Dumbbell, Baby, PawPrint,
  Fuel, Shirt, Gamepad2, Music, Wifi, Zap, Briefcase, Landmark, Bus, Pill, Book, Scissors, X, CircleCheck, TriangleAlert,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { colorFor, initials, money, tint } from '../lib/format';

export const ICONS = {
  utensils: Utensils, 'shopping-basket': ShoppingBasket, 'shopping-bag': ShoppingBag, receipt: Receipt,
  'hand-coins': HandCoins, sparkles: Sparkles, car: Car, plane: Plane, 'heart-pulse': HeartPulse,
  clapperboard: Clapperboard, 'graduation-cap': GraduationCap, 'trending-up': TrendingUp, home: House,
  repeat: Repeat, wallet: Wallet, 'circle-dashed': CircleDashed, tag: Tag, coffee: Coffee, gift: Gift,
  dumbbell: Dumbbell, baby: Baby, 'paw-print': PawPrint, fuel: Fuel, shirt: Shirt, gamepad: Gamepad2,
  music: Music, wifi: Wifi, zap: Zap, briefcase: Briefcase, landmark: Landmark, bus: Bus, pill: Pill,
  book: Book, scissors: Scissors,
};

export const PALETTE = ['#FF7A59', '#E5489B', '#9B5CFF', '#7C5CFF', '#4C6FFF', '#0EA5E9', '#14B8C4', '#1FB88A', '#2BB673', '#F2A93B', '#EF4444', '#64748B'];

export function CatIcon({ cat, size = 'md' }) {
  const Icon = ICONS[cat?.icon] || Tag;
  const color = cat?.color || '#64748B';
  return (
    <span className={`cat-ic ${size === 'sm' ? 'sm' : ''}`} style={{ background: tint(color, 0.13), color }}>
      <Icon size={size === 'sm' ? 15 : 19} strokeWidth={2} />
    </span>
  );
}

export function Money({ value, signed, className = '', compact }) {
  const { currency } = useApp();
  const v = Number(value) || 0;
  const s = money(Math.abs(v), currency, { compact });
  return <span className={`num ${className}`}>{signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''}{s}</span>;
}

export function Avatar({ name, size }) {
  return (
    <span className={`avatar ${size === 'sm' ? 'sm' : ''}`} style={{ background: colorFor(name) }}>
      {initials(name)}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          {t.kind === 'error' ? <TriangleAlert size={16} /> : <CircleCheck size={16} />} {t.text}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon = Sparkles, title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-art"><Icon size={26} /></div>
      <div className="serif">{title}</div>
      <div style={{ maxWidth: 360, margin: '0 auto' }}>{children}</div>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function Progress({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="progress">
      <div style={{ width: `${pct}%`, background: over ? 'var(--red)' : color || 'var(--grad)' }} />
    </div>
  );
}

export function Field({ label, error, children, hint }) {
  return (
    <label className="field">
      {label && <span>{label}</span>}
      {children}
      {error ? <small className="err">{error}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}
