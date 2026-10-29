import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../admin/main.js', import.meta.url), 'utf8');

assert.match(
  source,
  /data\.status = isManager && form\.elements\.published\.checked \? 'published' : 'draft';/
);
assert.match(source, /delete data\.published;/);
assert.doesNotMatch(source, /data\.published\s*=/);
assert.doesNotMatch(source, /status: 'draft', published:/);

console.log('[admin-payload-contract] PASS');
