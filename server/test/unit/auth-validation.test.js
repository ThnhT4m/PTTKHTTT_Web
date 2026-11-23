import test from 'node:test';
import assert from 'node:assert/strict';
import { password, registerBody, loginBody } from '../../src/modules/auth/auth.validation.js';

test('Password: không bỏ qua hậu tố vượt giới hạn 72 byte bcrypt', () => {
  assert.equal(password.safeParse('a'.repeat(72)).success, true);
  assert.equal(password.safeParse('a'.repeat(72) + 'x').success, false);
  assert.equal(password.safeParse('a'.repeat(72) + 'y').success, false);
});

test('Password: đếm byte UTF-8 cho tiếng Việt và emoji, không chỉ số ký tự', () => {
  assert.equal(password.safeParse('ế'.repeat(24)).success, true);
  assert.equal(password.safeParse('ế'.repeat(25)).success, false);
  assert.equal(password.safeParse('🔑'.repeat(18)).success, true);
  assert.equal(password.safeParse('🔑'.repeat(19)).success, false);
});

test('Auth: register/login cùng giới hạn mật khẩu, không trim mật khẩu', () => {
  const valid = { email: '  PERSON@EXAMPLE.COM  ', password: ' Pass word ' };
  assert.deepEqual(loginBody.parse(valid), { email: 'person@example.com', password: ' Pass word ' });
  assert.equal(registerBody.parse({ ...valid, full_name: ' Nguyễn An ' }).full_name, 'Nguyễn An');
  for (const value of ['', 'short', 'a'.repeat(73), 'ế'.repeat(25)]) {
    assert.equal(loginBody.safeParse({ ...valid, password: value }).success, false);
    assert.equal(registerBody.safeParse({ ...valid, full_name: 'Khách test', password: value }).success, false);
  }
});

test('Register: chặn tự cấp role hoặc trường truy cập đặc quyền', () => {
  const valid = { full_name: 'Khách test', email: 'test@example.com', password: 'Demo@12345' };
  for (const extra of [{ role: 'ADMIN' }, { is_active: true }, { token_version: 1 }]) {
    assert.equal(registerBody.safeParse({ ...valid, ...extra }).success, false);
  }
});
