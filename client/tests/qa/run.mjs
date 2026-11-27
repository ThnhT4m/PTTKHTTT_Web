import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
process.env.SPORTBOOKING_QA ||= 'task6.1';
process.env.SPORTBOOKING_QA_SUITE = process.env.QA_PHASE === 'before' ? 'extended-before' : process.env.QA_PHASE === 'edge' ? 'fault' : 'extended-after';
const { createEnvironment, artifacts } = await import('../real/environment.mjs');
const { runFinalChecks } = await import('./suite.mjs');
let environment;
const results = [];
async function check(id, name, details, run) {
  const row = { id, name, ...details, status: 'FAIL' };
  try { row.evidence = await run(); row.status = 'PASS'; console.log(`PASS ${id} ${name}`); }
  catch (error) { row.error = String(error.message).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]'); console.log(`FAIL ${id} ${name}: ${row.error}`); }
  results.push(row);
  await writeFile(new URL('checks.json', artifacts), JSON.stringify(results, null, 2));
}
try {
  environment = await createEnvironment();
  console.log(`TASK 6 new database: ${environment.uiDatabase.name}; evidence: ${artifacts.pathname}`);
  const metrics = await runFinalChecks(environment, check);
  await writeFile(new URL('summary.json', artifacts), JSON.stringify({ date: new Date().toISOString(), database: environment.uiDatabase.name, postgres: environment.version, metrics, pass: results.filter((x) => x.status === 'PASS').length, fail: results.filter((x) => x.status === 'FAIL').length, results }, null, 2));
  assert.ok(results.every((r) => r.status === 'PASS'), 'Final QA has failed checks; do not declare acceptance.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await environment?.close(); }
