import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const logPath = join(root, 'backend-verification.log');
const log = createWriteStream(logPath, { flags: 'w' });
const started = Date.now();

function write(value) {
  process.stdout.write(value);
  log.write(value);
}

function run(command, args, { allowFailure = false } = {}) {
  write(`\n$ ${command} ${args.join(' ')}\n`);
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      write(text);
    });
    child.stderr.on('data', (chunk) => write(chunk.toString()));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code !== 0) write(`\nLệnh kết thúc với mã ${signal ?? code}.\n`);
      if (code === 0 || allowFailure) resolve({ code, output });
      else reject(new Error(`${command} thất bại (${signal ?? code}). Xem lỗi phía trên.`));
    });
  });
}

try {
  // Check before installing anything or starting services. A custom test URL
  // uses an existing PostgreSQL server and does not require Docker.
  const testUrl = process.env.TEST_DATABASE_URL;
  if (testUrl && !new URL(testUrl).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL phải có tên database kết thúc bằng _test.');
  }
  write(`Kiểm chứng backend bắt đầu: ${new Date().toISOString()}\nNode: ${process.version}\n`);
  const network = await run('npm', ['ping', '--fetch-retries=0', '--fetch-timeout=15000'], { allowFailure: true });
  const docker = testUrl ? null : await run('docker', ['info', '--format', '{{.ServerVersion}}'], { allowFailure: true });
  if (network.code !== 0 || (docker && docker.code !== 0)) {
    throw new Error('Chưa đủ kết nối npm hoặc quyền Docker. Không khởi tạo database và chưa chạy test tích hợp.');
  }

  // Server workspace only: no frontend build, dependency scripts or UI edits.
  await run('npm', ['ci', '--workspace', 'server', '--ignore-scripts', '--no-audit', '--no-fund']);
  if (!testUrl) {
    await run('docker', ['compose', 'up', '-d', '--wait', 'db']);
    const existing = await run('docker', ['compose', 'exec', '-T', 'db', 'psql', '-U', 'sportbooking',
      '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'sportbooking_test'"]);
    if (!existing.output.trim()) {
      await run('docker', ['compose', 'exec', '-T', 'db', 'createdb', '-U', 'sportbooking', 'sportbooking_test']);
    }
    // Build the connection from Compose's configured port. Refuse to test an
    // unrelated server occupying the old default port when Compose was changed.
    const published = await run('docker', ['compose', 'port', 'db', '5432']);
    const port = /:(\d+)\s*$/.exec(published.output)?.[1];
    if (!port) throw new Error('Không xác định được cổng PostgreSQL từ Docker Compose.');
    process.env.TEST_DATABASE_URL = `postgres://sportbooking:sportbooking_dev@127.0.0.1:${port}/sportbooking_test`;
  }
  await run('npm', ['run', 'check:server']);
  // The acceptance suite itself migrates/seeds ONLY its _test database.
  // Never seed, migrate or reset the user's development database here.
  await run('npm', ['test']);
  write('\nCác lệnh kiểm chứng đã thành công. Xem số pass/fail/skip trong kết quả test phía trên.\n');
} catch (error) {
  write(`\nKiểm chứng chưa hoàn tất: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  write(`\nThời gian: ${((Date.now() - started) / 1000).toFixed(1)} giây.\nLog: ${logPath}\n`);
  await new Promise((resolve) => log.end(resolve));
}
