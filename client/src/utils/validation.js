export const utf8Bytes = (value) => new TextEncoder().encode(value).length;
export function passwordError(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Mật khẩu cần ít nhất 8 ký tự.';
  if (utf8Bytes(password) > 72) return 'Mật khẩu tối đa 72 byte UTF-8; tiếng Việt và emoji có thể dùng nhiều byte.';
  return '';
}
export function authErrors(values, register = false) {
  const errors = {};
  if (typeof values.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) errors.email = 'Email không hợp lệ.';
  const password = passwordError(values.password);
  if (password) errors.password = password;
  if (register) {
    if (typeof values.full_name !== 'string' || values.full_name.trim().length < 2 || values.full_name.length > 120)
      errors.full_name = 'Họ tên cần từ 2 đến 120 ký tự.';
    if (values.phone && (typeof values.phone !== 'string' || !/^[0-9+ ().-]{8,20}$/.test(values.phone))) errors.phone = 'Số điện thoại không hợp lệ.';
  }
  return errors;
}
export function isISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export const isVND = (value) => Number.isSafeInteger(value) && value >= 0;
