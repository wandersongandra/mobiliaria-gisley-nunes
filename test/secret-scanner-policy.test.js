import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scanner = fileURLToPath(new URL('../scripts/scan-secrets.mjs', import.meta.url));

function createRepository(files) {
  const directory = mkdtempSync(join(tmpdir(), 'gisley-secret-scan-'));
  execFileSync('git', ['init', '-q'], { cwd: directory });
  execFileSync('git', ['config', 'user.name', 'Security test'], { cwd: directory });
  execFileSync('git', ['config', 'user.email', 'security-test@example.invalid'], { cwd: directory });
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), value);
  execFileSync('git', ['add', '.'], { cwd: directory });
  execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: directory });
  return directory;
}

function runScanner(cwd) {
  try {
    return { status: 0, output: execFileSync(process.execPath, [scanner], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (error) {
    return { status: error.status, output: String(error.stderr || '') };
  }
}

test('secret scanner rejects an example-looking database credential outside fixtures', () => {
  const prefix = ['DATABASE', '_URL=mysql://user:'].join('');
  const directory = createRepository({ 'leak.env': prefix + 'example-password@db.invalid' });
  try {
    const result = runScanner(directory);
    assert.equal(result.status, 1);
    assert.match(result.output, /database-url/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('secret scanner permits only known placeholder values in .env.example', () => {
  const key = ['R2_SECRET', '_ACCESS_KEY='].join('');
  const directory = createRepository({ '.env.example': key + 'troque-por-um-segredo' });
  try {
    const result = runScanner(directory);
    assert.equal(result.status, 0, result.output);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
