import { createContext, useContext, useEffect, useState } from 'react';
import { get, post } from '../api/client';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  function clear() {
    localStorage.removeItem('sportbooking.token');
    setUser(null);
  }
  useEffect(() => {
    let mounted = true;
    if (localStorage.getItem('sportbooking.token'))
      get('/auth/me')
        .then((r) => {
          if (mounted) setUser(r.data.user || r.data);
        })
        .catch(clear)
        .finally(() => {
          if (mounted) setLoading(false);
        });
    else setLoading(false);
    window.addEventListener('auth:expired', clear);
    return () => {
      mounted = false;
      window.removeEventListener('auth:expired', clear);
    };
  }, []);
  async function login(values) {
    const { data } = await post('/auth/login', values);
    localStorage.setItem('sportbooking.token', data.token || data.access_token);
    setUser(data.user);
    return data.user;
  }
  async function register(values) {
    const { data } = await post('/auth/register', values);
    if (data.token || data.access_token) {
      localStorage.setItem('sportbooking.token', data.token || data.access_token);
      setUser(data.user);
      return data.user;
    }
    return login({ email: values.email, password: values.password });
  }
  async function logout() {
    try {
      await post('/auth/logout');
    } finally {
      clear();
    }
  }
  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export const homeFor = (role) =>
  role === 'ADMIN' ? '/admin' : role === 'VENUE_MANAGER' ? '/manager/venues' : '/venues';
