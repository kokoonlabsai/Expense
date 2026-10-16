import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { thisMonth } from './format';

const AppCtx = createContext(null);
const USER_KEY = 'tally.user';
const CATS_KEY = 'tally.categories';

// Remember the signed-in user and categories so the installed app opens instantly, even offline.
const readCache = (key) => {
  try { return getToken() ? JSON.parse(localStorage.getItem(key)) : null; } catch { return null; }
};
const writeCache = (key, value) => {
  try { value ? localStorage.setItem(key, JSON.stringify(value)) : localStorage.removeItem(key); } catch { /* private mode */ }
};
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }) {
  const [user, setUserState] = useState(() => readCache(USER_KEY));
  const [booting, setBooting] = useState(() => !!getToken() && !readCache(USER_KEY));
  const [categories, setCategoriesState] = useState(() => readCache(CATS_KEY) || []);

  const setUser = useCallback((u) => { setUserState(u); writeCache(USER_KEY, u); }, []);
  const setCategories = useCallback((c) => { setCategoriesState(c); writeCache(CATS_KEY, c); }, []);
  const [toasts, setToasts] = useState([]);
  const [txModal, setTxModal] = useState(null); // null | {} (new) | transaction (edit)
  const [version, setVersion] = useState(0); // bump to make pages refetch

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setCategories(null);
    setCategoriesState([]);
  }, [setUser, setCategories]);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const loadCategories = useCallback(async () => {
    const { categories } = await api('/categories', { query: { month: thisMonth() } });
    setCategories(categories);
  }, [setCategories]);

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(({ user }) => { setUser(user); return loadCategories(); })
      // A 401 already logs out (see setUnauthorizedHandler). Anything else — e.g. offline — keeps the cached session.
      .catch(() => {})
      .finally(() => setBooting(false));
  }, [loadCategories, setUser]);

  const login = useCallback(async (token, u) => {
    setToken(token);
    setUser(u);
    await loadCategories();
  }, [loadCategories, setUser]);

  const toast = useCallback((text, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    loadCategories().catch(() => {});
  }, [loadCategories]);

  const openTx = useCallback((tx = {}) => setTxModal(tx), []);
  const closeTx = useCallback(() => setTxModal(null), []);

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.slug, c])), [categories]);

  const value = {
    user, setUser, booting, login, logout,
    categories, catMap, loadCategories,
    toast, toasts,
    txModal, openTx, closeTx,
    version, refresh,
    currency: user?.currency || 'INR',
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
