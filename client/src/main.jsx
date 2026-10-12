import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { AppProvider, useApp } from './lib/store';
import Layout from './components/Layout';
import { Toasts } from './components/ui';
import { Login, Signup } from './pages/Auth';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Groups = lazy(() => import('./pages/Groups'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const Budgets = lazy(() => import('./pages/Budgets'));
const Settings = lazy(() => import('./pages/Settings'));

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  return (
    <Routes>
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
