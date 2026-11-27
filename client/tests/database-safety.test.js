import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertQaAdmin, assertQaDatabase, assertQaEnvironment, assertOperationalDatabase } from '../scripts/lib/databaseSafety.mjs';

const local = name => `postgres://user:password@127.0.0.1:55435/${name}`;
test('QA refuses operational/default/shared databases before creating connections', () => {
  for (const name of ['sportbooking','postgres','production','sportbooking_test','sportbooking_tv3_live_ui_test','sportbooking_tv3_1795754409141_6ab3ea_ui_test_backup']) assert.throws(() => assertQaDatabase(local(name)));
  assert.throws(() => assertQaEnvironment({ DATABASE_URL: local('sportbooking') }));
  assert.throws(() => assertQaEnvironment({ TEST_DATABASE_URL: local('sportbooking') }));
});
test('QA accepts only local generated UI/backend names and correct database kind', () => {
  assertQaDatabase(local('sportbooking_tv3_1795754409141_6ab3ea_ui_test'),'ui');
  assertQaDatabase(local('sportbooking_tv3_1795754409141_6ab3ea_backend_test'),'backend');
  assert.throws(() => assertQaDatabase(local('sportbooking_tv3_1795754409141_6ab3ea_ui_test'),'backend'));
  assert.throws(() => assertQaDatabase('postgres://example.com/sportbooking_tv3_1795754409141_6ab3ea_ui_test'));
});
test('Operational runner cannot serve a QA database and QA bootstrap cannot use operational DB', () => {
  assertOperationalDatabase(local('sportbooking')); assertQaAdmin(local('postgres'));
  assert.throws(() => assertOperationalDatabase(local('sportbooking_tv3_1795754409141_6ab3ea_ui_test')));
  assert.throws(() => assertOperationalDatabase('postgres://example.com/sportbooking'));
  assert.throws(() => assertQaAdmin(local('sportbooking')));
});
test('Historical TASK 5/6 artifact targets are rejected before any DB or file writes', () => {
  const moduleUrl=new URL('./real/environment.mjs',import.meta.url).href;
  for(const task of ['task5','task6']){
    const result=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(moduleUrl)})`],{env:{...process.env,SPORTBOOKING_QA:task},encoding:'utf8',windowsHide:true});
    assert.notEqual(result.status,0);assert.match(result.stderr,/evidence is read-only/);
  }
});
