import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { thisMonth } from './format';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [categories, setCategories] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [txModal, setTxModal] = useState(null); // null | {} (new) | transaction (edit)
  const [version, setVersion] = useState(0); // bump to make pages refetch

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setCategories([]);
  }, []);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const loadCategories = useCallback(async () => {
    const { categories } = await api('/categories', { query: { month: thisMonth() } });
    setCategories(categories);
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(({ user }) => { setUser(user); return loadCategories(); })
      .catch(() => logout())
      .finally(() => setBooting(false));
  }, [loadCategories, logout]);

  const login = useCallback(async (token, u) => {
    setToken(token);
    setUser(u);
    await loadCategories();
  }, [loadCategories]);

  const toast = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    loadCategories().catch(() => {});
  }, [loadCategories]);

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c])), [categories]);

  const value = {
    user, setUser, booting, login, logout,
    categories, catMap, loadCategories,
    toast, toasts,
    txModal, openTx: (tx = {}) => setTxModal(tx), closeTx: () => setTxModal(null),
    version, refresh,
    currency: user?.currency || 'INR',
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
