import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const codeql = await readFile(new URL('../.github/workflows/codeql.yml', import.meta.url), 'utf8');
const dependabot = await readFile(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');

test('workflows não concedem escrita de conteúdo nem usam pull_request_target', () => {
  assert.doesNotMatch(`${ci}\n${codeql}`, /pull_request_target/);
  assert.match(ci, /permissions:\n  contents: read/);
  assert.match(codeql, /permissions:\n  contents: read\n  actions: read\n  security-events: write/);
  assert.doesNotMatch(`${ci}\n${codeql}`, /^\s+contents:\s*write\s*$/m);
});

test('CI bloqueia dependências de produção com avisos moderados ou superiores', () => {
  assert.match(ci, /pnpm audit --prod --audit-level=moderate/);
});

test('Dependabot monitora dependências npm e GitHub Actions', () => {
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
});
