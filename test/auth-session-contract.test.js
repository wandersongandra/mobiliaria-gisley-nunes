import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dbSource = readFileSync(new URL('../server/db.js', import.meta.url), 'utf8');

function functionBlock(name, nextName) {
  const start = dbSource.indexOf(`export async function ${name}`);
  const end = dbSource.indexOf(`export async function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} ausente`);
  assert.ok(end > start, `${name} sem limite estrutural verificável`);
  return dbSource.slice(start, end);
}

test('OAuth challenge é consumível uma única vez sob lock transacional', () => {
  const schemaStart = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_auth_challenges');
  const schemaEnd = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_admin_sessions', schemaStart);
  const challengeSchema = dbSource.slice(schemaStart, schemaEnd);
  const consume = functionBlock('consumeAuthChallenge', 'createAdminSession');
  const create = functionBlock('createAuthChallenge', 'consumeAuthChallenge');

  assert.match(challengeSchema, /state_hash CHAR\(64\) PRIMARY KEY/);
  assert.match(challengeSchema, /invitation_hash CHAR\(64\) NULL/);
  assert.match(create, /invitation_hash/);
  assert.match(consume, /beginTransaction\(\)/);
  assert.match(consume, /FOR UPDATE/);
  assert.match(consume, /DELETE FROM morada_auth_challenges/);
  assert.match(consume, /commit\(\)/);
});

test('convite de equipe é hash-only, expira e vincula identidade uma única vez sob lock', () => {
  const schemaStart = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_staff_invitations');
  const schemaEnd = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_identity_pairings', schemaStart);
  const invitationSchema = dbSource.slice(schemaStart, schemaEnd);
  const accept = functionBlock('acceptStaffInvitation', 'createAuthChallenge');

  assert.match(invitationSchema, /token_hash CHAR\(64\) PRIMARY KEY/);
  assert.equal(invitationSchema.includes('invitation_token'), false);
  assert.match(invitationSchema, /accepted_at TIMESTAMP/);
  assert.match(invitationSchema, /revoked_at TIMESTAMP/);
  assert.match(accept, /SELECT token_hash,email,name,role,invited_by,expires_at_ms,accepted_at,revoked_at/);
  assert.match(accept, /FOR UPDATE/);
  assert.match(accept, /INSERT INTO morada_staff_access/);
  assert.match(accept, /accepted_at=CURRENT_TIMESTAMP/);
});

test('pairing code não é persistido em claro e o vínculo é uso único sob lock', () => {
  const schemaStart = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_identity_pairings');
  const schemaEnd = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_auth_challenges', schemaStart);
  const pairingSchema = dbSource.slice(schemaStart, schemaEnd);
  const bind = functionBlock('bindStaffAccessFromPairing', 'createAuthChallenge');

  assert.match(pairingSchema, /code_hash CHAR\(64\) PRIMARY KEY/);
  assert.equal(pairingSchema.includes('pairing_code'), false);
  assert.match(bind, /SELECT code_hash,open_id,email,expires_at_ms FROM morada_identity_pairings/);
  assert.match(bind, /FOR UPDATE/);
  assert.match(bind, /INSERT INTO morada_staff_access/);
  assert.match(bind, /DELETE FROM morada_identity_pairings/);
});

test('criação de sessão serializa a identidade e aplica limite de sessões', () => {
  const schemaStart = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_admin_sessions');
  const schemaEnd = dbSource.indexOf('CREATE TABLE IF NOT EXISTS morada_properties', schemaStart);
  const sessionSchema = dbSource.slice(schemaStart, schemaEnd);
  const create = functionBlock('createAdminSession', 'findActiveAdminSession');

  assert.match(sessionSchema, /jti CHAR\(36\) PRIMARY KEY/);
  assert.match(create, /SELECT open_id,active FROM morada_staff_access/);
  assert.match(create, /FOR UPDATE/);
  assert.match(create, /maxAdminSessions\(\)/);
  assert.match(create, /revoked_at=COALESCE\(revoked_at,CURRENT_TIMESTAMP\)/);
});
