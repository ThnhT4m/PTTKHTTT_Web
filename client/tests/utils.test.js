import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordError, authErrors, utf8Bytes, isISODate, isVND } from '../src/utils/validation.js';
import { todayVN, timeVN, dateVN, money, addDays } from '../src/utils/format.js';
import { homeFor, canAccess } from '../src/utils/roles.js';

test('password validates 72 UTF-8 bytes for ASCII, Vietnamese and emoji without trimming', () => {
  for (const value of ['a'.repeat(72), 'ế'.repeat(24), '😀'.repeat(18)]) {
    assert.equal(utf8Bytes(value), 72);
    assert.equal(passwordError(value), '');
    assert.ok(passwordError(value + 'a'));
  }
  assert.ok(passwordError('1234567'));
  assert.equal(passwordError(' 123456 '), '');
  assert.equal(passwordError('        '), '');
});
test('auth forms validate credentials and registration fields consistently', () => {
  assert.deepEqual(authErrors({ email: 'customer@example.com', password: 'Demo@12345' }), {});
  assert.ok(authErrors({ email: 'x', password: 'short' }).email);
  assert.ok(authErrors({ email: 'a@b.vn', password: 'Demo@12345', full_name: '  ', phone: 'abc' }, true).full_name);
  assert.ok(authErrors({ email: 'a@b.vn', password: 'Demo@12345', full_name: 'An', phone: 'abc' }, true).phone);
});
test('Vietnam time is independent of host timezone at midnight and leap days', () => {
  assert.equal(todayVN('2026-11-24T17:00:00Z'), '2026-11-25');
  assert.equal(timeVN('2026-11-24T17:00:00Z'), '00:00');
  assert.equal(dateVN('2026-11-24T17:00:00Z'), '25/11/2026');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dateVN('invalid'), '—');
  assert.equal(timeVN(null), '—');
  assert.equal(money(120000).replace(/\s/g, ''), '120.000₫');
});
test('calendar and VND validation reject overflow and fractional money', () => {
  assert.equal(isISODate('2028-02-29'), true);
  for (const day of ['2026-02-29', '2026-11-31', '2026-1-01', 'abc']) assert.equal(isISODate(day), false);
  assert.equal(isVND(120000), true);
  for (const amount of [-1, 1.5, NaN, Infinity, '120000']) assert.equal(isVND(amount), false);
});
test('all three roles have distinct homes and protected routes', () => {
  assert.deepEqual(['CUSTOMER', 'VENUE_MANAGER', 'ADMIN'].map(homeFor), ['/venues', '/manager/venues', '/admin']);
  assert.equal(canAccess(null, ['CUSTOMER']), false);
  assert.equal(canAccess({ role: 'CUSTOMER' }, ['VENUE_MANAGER']), false);
  assert.equal(canAccess({ role: 'ADMIN' }, ['ADMIN']), true);
});
