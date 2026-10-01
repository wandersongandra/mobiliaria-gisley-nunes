import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  bindStaffAccessFromPairing,
  closePool,
  consumeAuthChallenge,
  createAdminSession,
  createAuthChallenge,
  createIdentityPairing,
  findActiveAdminSession,
  getPool,
  migrate,
  revokeAdminSession,
  revokeAdminSessionsByOpenId,
  saveStaffAccess
} from '../server/db.js';

const enabled = process.env.RUN_MYSQL_AUTH_INTEGRATION === 'true';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertDedicatedTestDatabase() {
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.DATABASE_SSL_MODE, 'disable');

  let url;
  try {
    url = new URL(process.env.DATABASE_URL || '');
  } catch {
    assert.fail('DATABASE_URL de integração ausente ou inválida');
  }

  assert.equal(url.protocol, 'mysql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, process.env.MYSQL_TEST_PORT || '3306');
  assert.equal(url.username, 'gisley_ci');
  assert.equal(url.pathname, '/gisley_phase2_test');
}

test('MySQL valida concorrência, pairing atômico, limite e revogação de sessões', {
  skip: !enabled,
  timeout: 30000
}, async () => {
  assertDedicatedTestDatabase();

  const pool = getPool();
  const [[database]] = await pool.query('SELECT DATABASE() AS name');
  assert.equal(database.name, 'gisley_phase2_test');

  const [tables] = await pool.execute(
    'SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type=?',
    ['BASE TABLE']
  );
  assert.equal(tables.length, 0, 'o schema de integração deve estar vazio antes das migrations');

  const suffix = randomUUID();
  const challengeHashes = [hash(`challenge-a:${suffix}`), hash(`challenge-b:${suffix}`)];
  const pairingHashes = [hash(`pairing-conflict:${suffix}`), hash(`pairing-race:${suffix}`)];
  const identityOpenIds = [`f2-auth:${suffix}`, `f2-conflict:${suffix}`, `f2-race:${suffix}`];
  const identityEmails = [
    `f2-auth-${suffix}@example.invalid`,
    `f2-conflict-${suffix}@example.invalid`,
    `f2-race-${suffix}@example.invalid`
  ];
  const createdJtis = Array.from({ length: 8 }, () => randomUUID());
  let schemaReady = false;

  try {
    await migrate();
    schemaReady = true;

    const challengeStateHash = challengeHashes[0];
    await createAuthChallenge({
      stateHash: challengeStateHash,
      redirectUri: 'https://panel.example.invalid/admin',
      expiresAtMs: Date.now() + 60_000
    });
    const challengeResults = await Promise.all([
      consumeAuthChallenge(challengeStateHash),
      consumeAuthChallenge(challengeStateHash)
    ]);
    assert.equal(challengeResults.filter(Boolean).length, 1);
    assert.equal(challengeResults.filter((value) => value?.redirectUri).length, 1);

    await saveStaffAccess({
      email: identityEmails[1],
      openId: identityOpenIds[1],
      name: 'Conflito de teste',
      role: 'editor',
      invitedBy: 'mysql-integration-test'
    });
    await createIdentityPairing({
      codeHash: pairingHashes[0],
      openId: identityOpenIds[0],
      email: identityEmails[1],
      expiresAtMs: Date.now() + 60_000
    });

    await assert.rejects(
      bindStaffAccessFromPairing({
        codeHash: pairingHashes[0],
        email: identityEmails[1],
        name: 'Não deve vincular'
      }),
      { message: 'TEAM_MEMBER_EXISTS' }
    );
    const [[retainedPairing]] = await pool.execute(
      'SELECT code_hash FROM morada_identity_pairings WHERE code_hash=?',
      [pairingHashes[0]]
    );
    assert.ok(retainedPairing, 'conflito deve reverter sem consumir o pairing');

    await createIdentityPairing({
      codeHash: pairingHashes[1],
      openId: identityOpenIds[2],
      email: identityEmails[2],
      expiresAtMs: Date.now() + 60_000
    });
    const bindingResults = await Promise.all([
      bindStaffAccessFromPairing({
        codeHash: pairingHashes[1],
        email: identityEmails[2],
        name: 'Vínculo concorrente A'
      }),
      bindStaffAccessFromPairing({
        codeHash: pairingHashes[1],
        email: identityEmails[2],
        name: 'Vínculo concorrente B'
      })
    ]);
    assert.equal(bindingResults.filter(Boolean).length, 1);

    await saveStaffAccess({
      email: identityEmails[0],
      openId: identityOpenIds[0],
      name: 'Sessões de teste',
      role: 'manager',
      invitedBy: 'mysql-integration-test'
    });
    await Promise.all(createdJtis.map((jti) => createAdminSession({
      jti,
      openId: identityOpenIds[0],
      email: identityEmails[0],
      expiresAtMs: Date.now() + 60 * 60 * 1000
    })));

    const [sessions] = await pool.execute(
      'SELECT jti,revoked_at FROM morada_admin_sessions WHERE open_id=?',
      [identityOpenIds[0]]
    );
    assert.equal(sessions.length, createdJtis.length);
    assert.equal(sessions.filter((session) => !session.revoked_at).length, 3);
    assert.equal(sessions.filter((session) => session.revoked_at).length, 5);

    const activeJti = sessions.find((session) => !session.revoked_at).jti;
    assert.equal(await revokeAdminSession(activeJti), true);
    assert.equal(await findActiveAdminSession(activeJti), null);
    assert.equal(await revokeAdminSessionsByOpenId(identityOpenIds[0]), 2);
  } finally {
    try {
      if (schemaReady) {
        for (const stateHash of challengeHashes) {
          await pool.execute('DELETE FROM morada_auth_challenges WHERE state_hash=?', [stateHash]);
        }
        for (const codeHash of pairingHashes) {
          await pool.execute('DELETE FROM morada_identity_pairings WHERE code_hash=?', [codeHash]);
        }
        for (const openId of identityOpenIds) {
          await pool.execute('DELETE FROM morada_admin_sessions WHERE open_id=?', [openId]);
          await pool.execute('DELETE FROM morada_staff_access WHERE open_id=?', [openId]);
        }
        await pool.execute('DELETE FROM morada_staff_access WHERE email=?', [identityEmails[1]]);
      }
    } finally {
      await closePool();
    }
  }
});
