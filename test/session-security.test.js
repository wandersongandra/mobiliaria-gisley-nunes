import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminSessionState } from '../server/db.js';

test('adminSessionState distingue sessão ativa revogada expirada e ociosa', () => {
  const now = 2_000_000;
  const idle = 60_000;
  const base = {
    revoked_at: null,
    expires_at_ms: now + 300_000,
    last_seen_at_ms: now - 10_000
  };

  assert.equal(adminSessionState(base, { nowMs: now, idleTimeoutMs: idle }), 'active');
  assert.equal(adminSessionState({ ...base, revoked_at: '2026-10-01 12:00:00' }, { nowMs: now, idleTimeoutMs: idle }), 'revoked');
  assert.equal(adminSessionState({ ...base, expires_at_ms: now }, { nowMs: now, idleTimeoutMs: idle }), 'absolute_expired');
  assert.equal(adminSessionState({ ...base, last_seen_at_ms: now - idle }, { nowMs: now, idleTimeoutMs: idle }), 'idle_expired');
  assert.equal(adminSessionState(null, { nowMs: now, idleTimeoutMs: idle }), 'missing');
  assert.equal(adminSessionState({ ...base, expires_at_ms: 'invalido' }, { nowMs: now, idleTimeoutMs: idle }), 'absolute_expired');
  assert.equal(adminSessionState({ ...base, last_seen_at_ms: 'invalido' }, { nowMs: now, idleTimeoutMs: idle }), 'idle_expired');
});
