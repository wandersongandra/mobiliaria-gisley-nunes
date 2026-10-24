import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const normalizeNewlines = (content) => content.replace(/\r\n/g, '\n');
const ci = normalizeNewlines(await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const codeql = normalizeNewlines(await readFile(new URL('../.github/workflows/codeql.yml', import.meta.url), 'utf8'));
const laravelCi = normalizeNewlines(await readFile(new URL('../.github/workflows/laravel-ci.yml', import.meta.url), 'utf8'));
const hostgatorDeploy = normalizeNewlines(await readFile(new URL('../.github/workflows/hostgator-deploy-gated.yml', import.meta.url), 'utf8'));
const dependabot = normalizeNewlines(await readFile(new URL('../.github/dependabot.yml', import.meta.url), 'utf8'));

test('workflows não concedem escrita de conteúdo nem usam pull_request_target', () => {
  assert.doesNotMatch(`${ci}\n${codeql}`, /pull_request_target/);
  assert.match(ci, /permissions:\n  contents: read/);
  assert.match(codeql, /permissions:\n  contents: read\n  actions: read\n  security-events: write/);
  assert.doesNotMatch(`${ci}\n${codeql}`, /^\s+contents:\s*write\s*$/m);
});

test('todas as GitHub Actions estão fixadas em SHA completo com versão de atualização', () => {
  const actionRefs = `${ci}\n${codeql}`.split('\n').filter((line) => /^\s*-?\s*uses:/.test(line));
  assert.ok(actionRefs.length > 0);
  assert.ok(actionRefs.every((line) => /uses:\s+[^@\s]+@[a-f0-9]{40}\s+#\s+v\d+/.test(line)), actionRefs.join('\n'));
});

test('CI bloqueia dependências de produção com avisos moderados ou superiores', () => {
  assert.match(ci, /pnpm audit --prod --audit-level=moderate/);
});

test('CodeQL cobre o backend PHP e o branch efetivo de produção', () => {
  assert.match(codeql, /- migration\/laravel-backend-2026-10-02/);
  assert.match(codeql, /languages: javascript-typescript,php/);
});

test('deploy gated resolve explicitamente o ref para push e dispatch manual', () => {
  assert.match(hostgatorDeploy, /ref: \$\{\{ github\.event_name == 'push' && github\.ref \|\| inputs\.ref \}\}/);
  assert.match(hostgatorDeploy, /REQUESTED_REF: \$\{\{ github\.event_name == 'push' && 'migration\/laravel-backend-2026-10-02' \|\| inputs\.ref \}\}/);
  assert.match(hostgatorDeploy, /DEPLOY_SHA: \$\{\{ github\.event_name == 'push' && github\.sha \|\| inputs\.sha \}\}/);
});

test('Laravel CI aguarda MySQL com retry limitado antes de configurar triggers', () => {
  const waitStep = laravelCi.indexOf('- name: Wait for ephemeral MySQL');
  const configureStep = laravelCi.indexOf('- name: Configure ephemeral MySQL trigger support');

  assert.ok(waitStep >= 0 && configureStep > waitStep);
  assert.match(laravelCi.slice(waitStep, configureStep), /for attempt in \{1\.\.15\}; do/);
  assert.match(laravelCi.slice(waitStep, configureStep), /mysqladmin --connect-timeout=2 --host=127\.0\.0\.1 --port=3306 --user=root ping --silent/);
  assert.match(laravelCi.slice(waitStep, configureStep), /exit 1/);
});

test('Dependabot monitora dependências npm e GitHub Actions', () => {
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
});
