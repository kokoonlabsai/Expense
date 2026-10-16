import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles.css';
import { AppProvider, useApp } from './lib/store';
import Layout from './components/Layout';
import { Toasts } from './components/ui';
import { Login, Signup } from './pages/Auth';
import Join from './pages/Join';
import { registerServiceWorker } from './lib/pwa';

registerServiceWorker();
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Groups = lazy(() => import('./pages/Groups'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Settings = lazy(() => import('./pages/Settings'));

// Remember where a logged-out visitor was headed (e.g. a shared group link).
function ToLogin() {
  const { pathname } = useLocation();
  const next = pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
  return <Navigate to={`/login${next}`} replace />;
}

function Routed() {
  const { user, booting } = useApp();
  if (booting) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><div className="brand-mark" style={{ animation: 'pop 1s ease infinite alternate' }} /></div>;
  }
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/join/:token" element={<Join />} />
        <Route path="*" element={<ToLogin />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/join/:token" element={<Join />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="splits" element={<Groups />} />
        <Route path="splits/:id" element={<GroupDetail />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Routed />
        <Toasts />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>
);
