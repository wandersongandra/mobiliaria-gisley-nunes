import assert from 'node:assert/strict';
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

console.log('[hostgator-workflow-security] PASS');
