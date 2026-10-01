import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxAdminSessions, sessionIdleTimeoutMs } from '../server/config.js';

test('limite de sessões administrativas é limitado entre 1 e 10', () => {
  const previous = process.env.GISELY_MAX_ADMIN_SESSIONS;
  try {
    process.env.GISELY_MAX_ADMIN_SESSIONS = '0';
    assert.equal(maxAdminSessions(), 1);
    process.env.GISELY_MAX_ADMIN_SESSIONS = '99';
    assert.equal(maxAdminSessions(), 10);
    process.env.GISELY_MAX_ADMIN_SESSIONS = '3';
    assert.equal(maxAdminSessions(), 3);
    process.env.GISELY_MAX_ADMIN_SESSIONS = 'invalido';
    assert.equal(maxAdminSessions(), 5);
  } finally {
    if (previous === undefined) delete process.env.GISELY_MAX_ADMIN_SESSIONS;
    else process.env.GISELY_MAX_ADMIN_SESSIONS = previous;
  }
});

test('timeout ocioso administrativo é limitado entre 15 e 240 minutos', () => {
  const previous = process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES;
  try {
    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = '1';
    assert.equal(sessionIdleTimeoutMs(), 15 * 60 * 1000);
    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = '999';
    assert.equal(sessionIdleTimeoutMs(), 240 * 60 * 1000);
    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = '45';
    assert.equal(sessionIdleTimeoutMs(), 45 * 60 * 1000);
    process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = 'invalido';
    assert.equal(sessionIdleTimeoutMs(), 60 * 60 * 1000);
  } finally {
    if (previous === undefined) delete process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES;
    else process.env.GISELY_ADMIN_IDLE_TIMEOUT_MINUTES = previous;
  }
});
