import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../.github/workflows/hostgator-deploy-gated.yml', import.meta.url),
  'utf8'
);

assert.match(workflow, /permissions:\n  contents: read\n  actions: read\n/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
assert.match(workflow, /--branch "\$REQUESTED_REF"/);
assert.match(workflow, /--commit "\$DEPLOY_SHA"/);
assert.match(workflow, /--event push/);
assert.match(workflow, /--limit 1/);
assert.match(workflow, /\.headSha == \$sha/);
assert.match(workflow, /\.headBranch == \$branch/);
assert.match(workflow, /\.event == "push"/);
assert.match(workflow, /\.status == "completed"/);
assert.match(workflow, /\.conclusion == "success"/);

const gateStart = workflow.indexOf('- name: Require green release CI for exact SHA');
const checkout = workflow.indexOf('- uses: actions/checkout@');
const ssh = workflow.indexOf('- name: Install strict SSH material');
assert.ok(gateStart > checkout && ssh > gateStart, 'CI gate must run after checkout and before SSH setup');

const gate = workflow.slice(gateStart, ssh);
for (const path of [
  '.github/workflows/ci.yml',
  '.github/workflows/laravel-ci.yml',
  '.github/workflows/codeql.yml',
  '.github/workflows/production-build.yml',
]) {
  assert.ok(gate.includes(path), `Missing mandatory release gate: ${path}`);
}

const jqStart = gate.indexOf('if ! jq -e --arg sha');
const jqFilterStart = gate.indexOf("'\n", jqStart) + 2;
const jqFilterEnd = gate.indexOf("\n            ' <<<", jqFilterStart);
assert.ok(jqStart >= 0 && jqFilterStart > 1 && jqFilterEnd > jqFilterStart, 'must find the real jq predicate in deploy gate');
const jqPredicate = gate.slice(jqFilterStart, jqFilterEnd);

const testedSha = 'a'.repeat(40);
const testedBranch = 'migration/laravel-backend-2026-10-02';
const allowed = {
  headSha: testedSha,
  headBranch: testedBranch,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};
function isAllowed(runs) {
  const result = spawnSync('jq', [
    '-e', '--arg', 'sha', testedSha, '--arg', 'branch', testedBranch, jqPredicate,
  ], { input: JSON.stringify(runs), encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  assert.ok([0, 1].includes(result.status), result.stderr);
  return result.status === 0;
}

assert.equal(isAllowed([allowed]), true, 'all green for exact SHA must pass');
assert.equal(isAllowed([]), false, 'missing CI must block');
assert.equal(isAllowed([{ ...allowed, headSha: 'b'.repeat(40) }]), false, 'wrong SHA must block');
assert.equal(isAllowed([{ ...allowed, headBranch: 'main' }]), false, 'wrong branch must block');
assert.equal(isAllowed([{ ...allowed, event: 'pull_request' }]), false, 'PR run must not unlock deployment');
assert.equal(isAllowed([{ ...allowed, status: 'in_progress', conclusion: null }]), false, 'incomplete CI must block');
assert.equal(isAllowed([{ ...allowed, conclusion: 'failure' }]), false, 'failed CI must block');
assert.equal(isAllowed([allowed, allowed]), false, 'ambiguous runs must block');

console.log('[hostgator-workflow-security] PASS');
