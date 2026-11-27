import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { createEnvironment, artifacts } from './environment.mjs';
import { runApiChecks } from './api.mjs';
import { runBrowserChecks } from './browser.mjs';
import { assertQaDatabase } from '../../scripts/lib/databaseSafety.mjs';

const results = [], exec = promisify(execFile);
let environment;
async function check(tc, name, actor, run) {
  const record = { tc, name, actor, level: name.startsWith('Browser:') ? 'REAL_BROWSER_E2E' : 'REAL_HTTP_POSTGRESQL', status: 'FAIL' };
  try { record.evidence = await run(); record.status = 'PASS'; console.log(`PASS ${tc} ${name}`); }
  catch (error) { record.error = String(error.message).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]'); console.log(`FAIL ${tc} ${name}: ${record.error}`); }
  results.push(record);
}
try {
  environment = await createEnvironment();
  console.log(`PostgreSQL ${environment.version}; new DB ${environment.uiDatabase.name}; payment sandbox false.`);
  const frontend = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: environment.root, encoding: 'utf8' }).trim();
  await runApiChecks(environment, check);
  await runBrowserChecks(environment, check);
  assertQaDatabase(environment.backendDatabase.url, 'backend');
  const backend = await exec(process.execPath, ['--test', '--test-concurrency=1', 'test/acceptance.test.js', 'test/unit/auth-validation.test.js', 'test/unit/calendar.test.js'], { cwd: new URL('../../../server/', import.meta.url), env: { ...process.env, TEST_DATABASE_URL: environment.backendDatabase.url }, maxBuffer: 8 * 1024 * 1024 }).then((r) => ({ pass: true, output: r.stdout + r.stderr }), (e) => ({ pass: false, output: e.stdout + e.stderr }));
  await writeFile(new URL('backend-regression.log', artifacts), backend.output);
  const counts = { pass: Number(backend.output.match(/(?:ℹ|#) pass (\d+)/)?.[1] || 0), fail: Number(backend.output.match(/(?:ℹ|#) fail (\d+)/)?.[1] || 0), skip: Number(backend.output.match(/(?:ℹ|#) skipped (\d+)/)?.[1] || 0) };
  const report = { date: new Date().toISOString(), frontend, backend: execFileSync('git', ['rev-parse', 'origin/main'], { cwd: environment.root, encoding: 'utf8' }).trim(), postgres: environment.version, uiDatabase: environment.uiDatabase.name, backendDatabase: environment.backendDatabase.name, origin: environment.origin, paymentSandbox: false, results, backendRegression: { success: backend.pass, ...counts }, requests: environment.requests };
  await writeFile(new URL('results.json', artifacts), JSON.stringify(report, null, 2));
  console.log(`Real integration: ${results.filter((r) => r.status === 'PASS').length}/${results.length} passed; backend regression: ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip.`);
  if (results.some((r) => r.status !== 'PASS') || !backend.pass || counts.skip) process.exitCode = 1;
} catch (error) { console.error('TASK 5 blocked:', error.message); process.exitCode = 1; }
finally { await environment?.close(); }
