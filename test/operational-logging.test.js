import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logOperationalError, safeErrorLabel } from '../server/operational-logging.js';

test('logs operacionais não incluem mensagens ou stack traces não classificados', () => {
  const secretLike = new Error('jwt=secret cookie=session OAuth code=abc x-amz-signature=xyz lead message=private');
  secretLike.stack = `${secretLike.message}\n at /srv/app/server/auth.js`;

  assert.equal(safeErrorLabel(secretLike), 'UNCLASSIFIED');

  const entries = [];
  logOperationalError((entry) => entries.push(entry), 'oauth.callback_failed', secretLike);
  assert.deepEqual(entries, ['[oauth.callback_failed] UNCLASSIFIED']);
  assert.doesNotMatch(entries.join('\n'), /secret|session|abc|xyz|private|auth\.js/);
});

test('logs preservam códigos técnicos explicitamente permitidos e neutralizam eventos desconhecidos', () => {
  const entries = [];
  logOperationalError((entry) => entries.push(entry), 'api.error', Object.assign(new Error('unsafe'), { code: 'ER_LOCK_DEADLOCK' }));
  logOperationalError((entry) => entries.push(entry), '[api] injected secret', new Error('unsafe'));

  assert.deepEqual(entries, ['[api.error] ER_LOCK_DEADLOCK', '[startup.failed] UNCLASSIFIED']);
});
