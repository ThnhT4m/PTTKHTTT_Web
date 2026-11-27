export function tokenKey(mode) {
  return mode === 'mock' ? 'sportbooking.mock.token' : 'sportbooking.token';
}
export function createSession(mode, storage = globalThis.localStorage) {
  const key = tokenKey(mode);
  return {
    key,
    getToken: () => storage?.getItem(key) || null,
    setToken: (token) => storage?.setItem(key, token),
    clear: () => storage?.removeItem(key),
  };
}
