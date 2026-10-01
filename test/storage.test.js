import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeFileName } from '../server/storage.js';

test('safeFileName remove caracteres inseguros e preserva extensão', () => {
  assert.equal(safeFileName(' Sala / Principal 01.JPG '), 'Sala-Principal-01.JPG');
  assert.equal(safeFileName('../../segredo.png'), 'segredo.png');
});

test('safeFileName sempre retorna um nome utilizável', () => {
  assert.equal(safeFileName('...'), 'imagem');
  assert.equal(safeFileName(''), 'imagem');
});


test('R2 gera URL S3 assinada e usa domínio de mídia somente para leitura', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `
    process.env.R2_ACCOUNT_ID = 'abc123';
    process.env.R2_BUCKET = 'gisley-nunes-imoveis';
    process.env.R2_ACCESS_KEY_ID = 'access-test';
    process.env.R2_SECRET_ACCESS_KEY = 'secret-test';
    process.env.MEDIA_PUBLIC_ORIGIN = 'https://media.gisley.test';
    process.env.MANUS_API_URL = '';
    process.env.MANUS_API_KEY = '';
    const storage = await import('./server/storage.js');
    const key = 'gisley/properties/property-id/sala-principal.webp';
    const uploadUrl = await storage.storagePresign(key, { contentType: 'image/webp' });
    process.stdout.write(JSON.stringify({
      uploadUrl,
      assetUrl: storage.storageAssetUrl(key),
      provider: storage.storageProviderName()
    }));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  const result = JSON.parse(output);
  const signed = new URL(result.uploadUrl);
  assert.equal(signed.hostname, 'abc123.r2.cloudflarestorage.com');
  assert.equal(signed.pathname, '/gisley-nunes-imoveis/gisley/properties/property-id/sala-principal.webp');
  assert.equal(signed.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(signed.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
  assert.ok(signed.searchParams.get('X-Amz-Signature'));
  assert.equal(result.assetUrl, 'https://media.gisley.test/gisley/properties/property-id/sala-principal.webp');
  assert.equal(result.provider, 'r2');
  assert.equal(result.uploadUrl.includes('secret-test'), false);
});
