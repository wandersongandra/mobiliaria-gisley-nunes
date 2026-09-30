import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireManager } from '../server/auth.js';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

test('requireManager permite gestor', () => {
  const req = { admin: { role: 'manager' } };
  const res = createResponse();
  let called = false;
  requireManager()(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
});

test('requireManager bloqueia corretor/editor', () => {
  const req = { admin: { role: 'editor' } };
  const res = createResponse();
  let called = false;
  requireManager()(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'MANAGER_REQUIRED' });
});
