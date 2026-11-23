import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['knexfile.js', ...['src', 'test', 'scripts'].flatMap((dir) =>
  readdirSync(join(root, dir), { recursive: true }).filter((name) => name.endsWith('.js'))
    .map((name) => join(dir, name)))];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(1);
}
console.log(`Cú pháp hợp lệ: ${files.length} file JavaScript backend.`);
