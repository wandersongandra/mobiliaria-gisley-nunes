import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  new URL('../.github/workflows/hostgator-deploy-gated.yml', import.meta.url),
  'utf8'
);

assert.match(workflow, /permissions:\n  contents: read\n  actions: read\n/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /run_migrations:\n\s+description:.*\n\s+required: true\n\s+default: false\n\s+type: boolean/);
assert.match(workflow, /db_readiness:\n\s+description:.*\n\s+required: true\n\s+type: string/);
assert.match(workflow, /RUN_MIGRATIONS: \$\{\{ inputs\.run_migrations && '1' \|\| '0' \}\}/);
assert.match(workflow, /DB_READINESS: \$\{\{ inputs\.db_readiness \}\}/);
assert.match(workflow, /RUN_MIGRATIONS='\$RUN_MIGRATIONS'/);
assert.doesNotMatch(workflow, /RUN_MIGRATIONS=0 HEALTH_URL/);
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

const dbGateStart = workflow.indexOf('          case "$RUN_MIGRATIONS:$DB_READINESS" in');
const dbGateEnd = workflow.indexOf('\n          esac', dbGateStart);
assert.ok(dbGateStart > 0 && dbGateEnd > dbGateStart, 'database readiness gate must exist');
assert.ok(dbGateEnd < checkout, 'database readiness must be checked before checkout and SSH');
const dbGate = workflow.slice(dbGateStart, dbGateEnd + '\n          esac'.length)
  .split('\n').map((line) => line.replace(/^          /, '')).join('\n');

function databaseGateAllows(runMigrations, readiness) {
  const result = spawnSync('bash', ['-e', '-u', '-o', 'pipefail', '-c', dbGate], {
    env: { ...process.env, RUN_MIGRATIONS: runMigrations, DB_READINESS: readiness },
    encoding: 'utf8',
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result.status === 0;
}

assert.equal(databaseGateAllows('0', 'SCHEMA_ALREADY_CURRENT'), true, 'schema-confirmed deploy may skip migration');
assert.equal(databaseGateAllows('1', 'BACKUP_RESTORED_AND_VERIFIED'), true, 'backed-up deploy may migrate');
assert.equal(databaseGateAllows('0', ''), false, 'missing schema attestation must block');
assert.equal(databaseGateAllows('1', ''), false, 'missing backup attestation must block');
assert.equal(databaseGateAllows('0', 'BACKUP_RESTORED_AND_VERIFIED'), false, 'wrong attestation for no-migration must block');
assert.equal(databaseGateAllows('1', 'SCHEMA_ALREADY_CURRENT'), false, 'schema-only attestation must not enable migrations');
assert.equal(databaseGateAllows('2', 'BACKUP_RESTORED_AND_VERIFIED'), false, 'non-boolean migration mode must block');
assert.equal(databaseGateAllows('1', 'BACKUP_RESTORED_AND_VERIFIED_EXTRA'), false, 'inexact backup attestation must block');

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
