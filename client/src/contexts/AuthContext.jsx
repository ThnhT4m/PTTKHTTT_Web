import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { session } from '../api/client.js';
import * as auth from '../services/auth.js';
export { homeFor } from '../utils/roles.js';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const clear = useCallback((event) => {
    session.clear();
    setUser(null);
    setSessionError('');
    setAuthNotice(event?.type === 'auth:expired' ? 'Phiên đăng nhập đã hết hiệu lực. Vui lòng đăng nhập lại.' : '');
  }, []);
  useEffect(() => {
    let mounted = true;
    setSessionError('');
    setLoading(true);
    const token = session.getToken();
    if (token) auth.currentUser()
      .then((value) => {
        if (mounted && token === session.getToken()) setUser(value);
      })
      .catch((error) => {
        if (!mounted || token !== session.getToken()) return;
        if (error.status === 401) clear();
        else setSessionError(error.message);
      })
      .finally(() => { if (mounted) setLoading(false); });
    else { setUser(null); setLoading(false); }
    const sync = (event) => {
      if (event.key === session.key || event.key === null) {
        setUser(null);
        setRevision((n) => n + 1);
      }
    };
    window.addEventListener('auth:expired', clear);
    window.addEventListener('storage', sync);
    return () => {
      mounted = false;
      window.removeEventListener('auth:expired', clear);
      window.removeEventListener('storage', sync);
    };
  }, [clear, revision]);
  async function login(values) {
    const value = await auth.login(values);
    setUser(value);
    setSessionError('');
    setAuthNotice('');
    return value;
  }
  async function register(values) {
    const value = await auth.register(values);
    setUser(value);
    setSessionError('');
    return value;
  }
  async function logout() {
    try { await auth.logout(); } finally { clear(); }
  }
  return (
    <AuthContext.Provider value={{ user, loading, authNotice, sessionError, retrySession: () => setRevision((n) => n + 1), login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
