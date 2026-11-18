const BASE = import.meta.env.VITE_API_BASE || '/api';
export class ApiError extends Error {
  constructor(error, status) {
    super(error.message || 'Không thể hoàn thành yêu cầu.');
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}
export async function request(path, { method = 'GET', body, signal } = {}) {
  const token = localStorage.getItem('sportbooking.token');
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Không kết nối được máy chủ. Kiểm tra backend và thử lại.');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    if (response.status === 401) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(
      payload?.error || { message: `Máy chủ trả lỗi ${response.status}.` },
      response.status,
    );
  }
  return { data: payload?.data, server_time: payload?.server_time };
}
export const get = (path, options) => request(path, options);
export const post = (path, body = {}) => request(path, { method: 'POST', body });
export const patch = (path, body) => request(path, { method: 'PATCH', body });
export function query(values) {
  const q = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== '' && v !== undefined && v !== null) q.set(k, String(v));
  });
  return q.toString();
}
