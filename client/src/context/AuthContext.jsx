import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { getToken, setToken, tokenKey, isAdminScope, TOKEN_CHANGE_EVENT } from '../services/api';
import { me, login as loginApi, logout as logoutApi, register as registerApi } from '../services/authService';
import { detachPush } from '../services/pushService';

const AuthContext = createContext(null);

// Moving between /admin and the site switches to that area's own session (AYK-114).
// Rendered only inside a router.
function ScopeWatcher() {
  const { pathname } = useLocation();
  const scope = /^\/admin(\/|$)/.test(pathname) ? 'admin' : 'site';
  const scopeRef = useRef(scope);
  useEffect(() => {
    if (scopeRef.current === scope) return;
    scopeRef.current = scope;
    window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
  }, [scope]);
  return null;
}
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [provider, setProvider] = useState(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [loading, setLoading] = useState(true);
  const refreshVersion = useRef(0);
  const retriesRef = useRef(0);
  const refreshRef = useRef(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    const version = ++refreshVersion.current;
    const current = () => version === refreshVersion.current && getToken() === token;
    if (!token) {
      setUser(null);
      setProvider(null);
      setLoading(false);
      return null;
    }
    try {
      const data = await me();
      if (!current()) return null;
      retriesRef.current = 0;
      // An admin account belongs to /admin only (AYK-114): an old site session of one is closed.
      if (data.user?.role === 'admin' && !isAdminScope()) {
        setToken(null);
        setUser(null);
        setProvider(null);
        return null;
      }
      setUser(data.user);
      setProvider(data.provider || null);
      return data;
    } catch (err) {
      // A profile endpoint failure does not make a valid login invalid.
      // The /me endpoint returns 403 only for blocked or inactive accounts.
      const sameSession = version === refreshVersion.current && (!getToken() || getToken() === token);
      // Busy or offline is not a sign-out: keep the session and try again shortly.
      if (sameSession && (err.response?.status === 429 || !err.response) && retriesRef.current < 5) {
        retriesRef.current += 1;
        await new Promise(resolve => setTimeout(resolve, 3000 * retriesRef.current));
        if (version === refreshVersion.current) return await refreshRef.current();
        return null;
      }
      if (sameSession && [401, 403].includes(err.response?.status)) {
        setToken(null);
        setUser(null);
        setProvider(null);
      }
      return null;
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, []);
  refreshRef.current = refresh;

  useEffect(() => {
    try { localStorage.removeItem('lsm_auth_session'); } catch (_) {}
    const changed = (event) => {
      if (event.type === 'storage' && event.key !== tokenKey() && event.key !== null) return;
      ++refreshVersion.current;
      setUser(null);
      setProvider(null);
      setLoading(Boolean(getToken()));
      setSessionEpoch(value => value + 1);
    };
    window.addEventListener(TOKEN_CHANGE_EVENT, changed);
    window.addEventListener('storage', changed);
    const restored = event => { if (event.persisted) changed(event); };
    window.addEventListener('pageshow', restored);
    return () => {
      window.removeEventListener(TOKEN_CHANGE_EVENT, changed);
      window.removeEventListener('storage', changed);
      window.removeEventListener('pageshow', restored);
    };
  }, []);
  useEffect(() => { void refresh(); }, [refresh, sessionEpoch]);
  const inRouter = useInRouterContext();

  const login = async (creds) => {
    const data = await loginApi(creds);
    setUser(data.user);
    setProvider(data.provider || null);
    setLoading(false);
    void refresh();
    return data;
  };

  const register = async (payload) => {
    const data = await registerApi(payload);
    setUser(data.user);
    setProvider(data.provider || null);
    setLoading(false);
    void refresh();
    return data;
  };

  const logout = async () => {
    await detachPush();
    // A neighbourhood picked for browsing belongs to this account only.
    try { localStorage.removeItem('ayk_browse_area'); } catch (_) { /* private mode */ }
    ++refreshVersion.current;
    setUser(null);
    setProvider(null);
    await logoutApi();
  };

  // Helpers for permission gating throughout the admin UI.
  //   - isSuperAdmin: bypasses every per-section check.
  //   - hasPermission(key): true if super OR key is in permissions.
  //   - hasAnyPermission(keys): true if any of the listed keys passes.
  const isAdmin = user?.role === 'admin';
  const isSuperAdmin = isAdmin && !!user?.is_super_admin;
  const perms = Array.isArray(user?.permissions) ? user.permissions : [];
  const hasPermission = (key) => isAdmin && (isSuperAdmin || perms.includes(key));
  const hasAnyPermission = (keys) => isAdmin && (isSuperAdmin || keys.some((k) => perms.includes(k)));

  return (
    <AuthContext.Provider value={{
      user, provider, loading, login, register, logout, refresh, setUser, sessionEpoch,
      isAdmin, isSuperAdmin, permissions: perms, hasPermission, hasAnyPermission,
    }}>
      {inRouter && <ScopeWatcher />}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
