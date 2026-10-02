import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { apiErrorHandler, classifyHttpError, knownHttpErrorCodes } from '../server/errors.js';

test('erros de validação conhecidos nunca viram 500', () => {
  const validationCodes = [
    'TITLE_REQUIRED','LOCATION_REQUIRED','INVALID_INPUT','INVALID_ID','INVALID_SLUG',
    'INVALID_NUMBER','INVALID_BOOLEAN','INVALID_ENUM','INVALID_PROPERTY',
    'INVALID_PROPERTY_NUMBER','INVALID_ASSET','INVALID_FILE','INVALID_CONTACT',
    'INVALID_EMAIL','INVALID_WHATSAPP','INVALID_SITE_SETTINGS','INVALID_INSTAGRAM_URL',
    'INVALID_TESTIMONIAL','INVALID_LEAD_STATUS','INVALID_ORDER','INVALID_LIMIT',
    'INVALID_TEAM_MEMBER','INVALID_PAIRING'
  ];

  const known = knownHttpErrorCodes();
  for (const code of validationCodes) {
    assert.equal(known.has(code), true, code);
    const contract = classifyHttpError(new Error(code));
    assert.ok(contract.status >= 400 && contract.status < 500, code);
    assert.equal(contract.code, code);
  }
});

test('erro desconhecido permanece opaco', () => {
  assert.deepEqual(
    classifyHttpError(new Error('SELECT password FROM secrets')),
    { status: 500, code: 'INTERNAL_ERROR' }
  );
});

async function withParserServer(run) {
  const app = express();
  app.use(express.json({ limit: '256kb', type: 'application/json' }));
  app.post('/echo', (req, res) => res.json({ ok: true }));
  app.use(apiErrorHandler);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const address = server.address();
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('JSON malformado retorna 400 sem detalhe interno', async () => {
  await withParserServer(async (origin) => {
    const response = await fetch(`${origin}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"quebrado":'
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'INVALID_JSON' });
  });
});

test('body acima de 256 KB retorna 413', async () => {
  await withParserServer(async (origin) => {
    const response = await fetch(`${origin}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(270 * 1024) })
    });
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: 'PAYLOAD_TOO_LARGE' });
  });
});
