import { ApiError } from './errors.js';

export function createHttpTransport(base = '/api', fetcher = globalThis.fetch) {
  return async (path, { method, body, signal, token }) => {
    const response = await fetcher(`${base.replace(/\/$/, '')}${path}`, {
      method, signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  };
}

export function createApiClient({ transport, session, onExpired = () => {} }) {
  async function request(path, { method = 'GET', body, signal } = {}) {
    const token = session.getToken();
    let result;
    try {
      signal?.throwIfAborted();
      result = await transport(path, { method, body, signal, token });
      signal?.throwIfAborted();
    } catch (error) {
      if (error.name === 'AbortError' || signal?.aborted) throw error;
      if (error instanceof ApiError) throw error;
      throw new ApiError({ code: 'NETWORK_ERROR' }, 0);
    }
    const { status, payload } = result;
    if (status < 200 || status >= 300 || payload?.success === false) {
      // A login/register 401 means invalid credentials, not an expired session.
      if (status === 401 && token && token === session.getToken() &&
          !['/auth/login', '/auth/register'].includes(path.split('?')[0])) {
        session.clear();
        onExpired();
      }
      throw new ApiError(payload?.error || {}, status, payload?.server_time);
    }
    if (payload?.success !== true || !Object.hasOwn(payload, 'data') ||
        typeof payload.server_time !== 'string' || !Number.isFinite(Date.parse(payload.server_time))) {
      throw new ApiError({ code: 'INVALID_RESPONSE', message: 'Phản hồi máy chủ không đúng API Contract.' }, status);
    }
    return { data: payload.data, server_time: payload.server_time };
  }
  return {
    request,
    get: (path, options) => request(path, options),
    post: (path, body = {}, options) => request(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    del: (path, body, options) => request(path, { ...options, method: 'DELETE', body }),
  };
}
export function query(values) {
  const q = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) q.set(k, String(v));
  });
  return q.toString();
}
