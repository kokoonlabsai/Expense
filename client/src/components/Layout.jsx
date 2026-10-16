import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, Users, PiggyBank, Settings, Plus, LogOut } from 'lucide-react';
import { useApp } from '../lib/store';
import TransactionModal from './TransactionModal';
import { Avatar } from './ui';
import { BrandMark } from './Logo';
import { disablePush, syncPush } from '../lib/pwa';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/splits', label: 'Splits', icon: Users },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout, txModal, openTx, refresh } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // Home-screen shortcut "Add expense" opens /?add=1
  useEffect(() => {
    if (params.get('add')) {
      openTx();
      setParams({}, { replace: true });
    }
  }, [params, setParams, openTx]);

  // Notifications: keep this device registered, follow taps, refresh numbers when one arrives.
  useEffect(() => {
    syncPush();
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e) => {
      if (e.data?.type === 'navigate') navigate(e.data.url);
      if (e.data?.type === 'push') refresh();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate, refresh]);

  const signOut = async () => {
    await disablePush();
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openTx(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTx]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><BrandMark /><span className="brand-name">Jellyfish</span></div>
        <button className="btn btn-grad" style={{ margin: '0 0 14px', height: 44 }} onClick={() => openTx()}>
          <Plus size={18} /> Add expense <span className="kbd" style={{ color: 'rgba(255,255,255,.8)', borderColor: 'rgba(255,255,255,.4)', marginLeft: 4 }}>N</span>
        </button>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link">
            <Icon size={18} /> {label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="me-card">
            <Avatar name={user?.name} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{user?.phone}</div>
            </div>
            <button className="btn btn-ghost btn-icon" title="Log out" onClick={signOut}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="mobile-top">
          <div className="row" style={{ gap: 8 }}><BrandMark size={30} /><span className="brand-name" style={{ fontSize: 24 }}>Jellyfish</span></div>
          <NavLink to="/settings"><Avatar name={user?.name} size="sm" /></NavLink>
        </div>
        <Suspense fallback={<div className="page" />}><Outlet /></Suspense>
      </main>

      <nav className="tabbar">
        {NAV.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon size={20} />{label === 'Transactions' ? 'Activity' : label}</NavLink>
        ))}
        <button className="fab-mini" onClick={() => openTx()} aria-label="Add expense"><Plus size={24} /></button>
        {NAV.slice(2, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}><Icon size={20} />{label}</NavLink>
        ))}
      </nav>

      {txModal && <TransactionModal key={txModal.id || 'new'} />}
    </div>
  );
}
