import { post, get, session } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import { authErrors } from '../utils/validation.js';

function validate(values, register = false) {
  const details = authErrors(values, register);
  if (Object.keys(details).length) throw new ApiError({ code: 'VALIDATION_ERROR', message: Object.values(details)[0], details }, 400);
}
function save(data) {
  const token = data.token || data.access_token;
  if (!token || !data.user) throw new ApiError({ code: 'INVALID_RESPONSE', message: 'Phản hồi đăng nhập thiếu token hoặc người dùng.' }, 200);
  session.setToken(token);
  return data.user;
}
export async function login(values) {
  validate(values);
  const { data } = await post('/auth/login', { email: values.email, password: values.password });
  return save(data);
}
export async function register(values) {
  validate(values, true);
  const { full_name, email, phone, password } = values;
  const { data } = await post('/auth/register', { full_name, email, phone, password });
  return data.token || data.access_token ? save(data) : login({ email, password });
}
export async function currentUser() {
  const { data } = await get('/auth/me');
  return data.user || data;
}
export async function logout() {
  try { await post('/auth/logout'); } finally { session.clear(); }
}
