import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_URL, api } from '../campaign/lib/api';

// Who is signed in, from GET /auth/me. The session lives in an HttpOnly cookie the page never reads.
const AuthContext = createContext(null);

export const loginUrl = () => `${API_URL}/auth/google/login`;

export const AuthProvider = ({ children }) => {
  const [me, setMe] = useState(null); // null while loading
  const [unreachable, setUnreachable] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await api('/auth/me');
      setMe(next);
      setUnreachable(false);
    } catch {
      setUnreachable(true);
      setMe((cur) => cur ?? { configured: false, require_login: false, signed_in: false, user: null, restricted: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    // Any API call that comes back "login required" means the session ended: ask again.
    window.addEventListener('ll-login-required', refresh);
    return () => window.removeEventListener('ll-login-required', refresh);
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      await refresh();
    }
  }, [refresh]);

  const value = useMemo(() => ({ me, loading: me === null, unreachable, refresh, logout }), [me, unreachable, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
