import assert from 'node:assert/strict';

const local = value => {
  const url = new URL(value);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol), 'PostgreSQL URL required.');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Only local PostgreSQL is permitted.');
  return url;
};
export function assertQaDatabase(value, kind) {
  const url = local(value);
  assert.match(url.pathname, /^\/sportbooking_tv3_\d{13}_[a-f0-9]{6}_(ui|backend)_test$/, 'QA requires a newly named, isolated test database; operational databases are forbidden.');
  if (kind) assert.ok(url.pathname.endsWith(`_${kind}_test`), 'Wrong QA database kind.');
  return url;
}
export function assertQaAdmin(value) {
  const url = local(value);
  assert.equal(url.pathname, '/postgres', 'QA bootstrap may only CREATE new databases from postgres.');
  return url;
}
export function assertOperationalDatabase(value) {
  const url = local(value);
  assert.equal(url.pathname, '/sportbooking', 'Website must use the operational sportbooking database, never a QA database.');
  return url;
}
export function assertQaEnvironment(env) {
  for (const key of ['DATABASE_URL', 'TEST_DATABASE_URL']) if (env[key]) assertQaDatabase(env[key]);
}
