import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesImageSignature, safeFileName, storagePathBelongsToProperty } from '../server/storage.js';

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


test('matchesImageSignature reconhece formatos permitidos e rejeita disfarces', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
  const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00]);
  const webp = Uint8Array.from(Buffer.from('RIFF1234WEBP', 'ascii'));
  const avif = Uint8Array.from(Buffer.from('\x00\x00\x00\x18ftypavif00000000', 'binary'));
  const fake = Uint8Array.from(Buffer.from('<script>alert(1)</script>', 'utf8'));

  assert.equal(matchesImageSignature(jpeg, 'image/jpeg'), true);
  assert.equal(matchesImageSignature(png, 'image/png'), true);
  assert.equal(matchesImageSignature(webp, 'image/webp'), true);
  assert.equal(matchesImageSignature(avif, 'image/avif'), true);
  assert.equal(matchesImageSignature(fake, 'image/jpeg'), false);
  assert.equal(matchesImageSignature(jpeg, 'image/png'), false);
});


test('caminho de storage pertence somente ao imóvel esperado', () => {
  const propertyId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';

  assert.equal(
    storagePathBelongsToProperty(
      `gisley/properties/${propertyId}/foto.webp`,
      propertyId
    ),
    true
  );

  assert.equal(
    storagePathBelongsToProperty(
      `gisley/properties/${otherId}/foto.webp`,
      propertyId
    ),
    false
  );

  assert.equal(
    storagePathBelongsToProperty(
      `gisley/properties/${propertyId}/../${otherId}/foto.webp`,
      propertyId
    ),
    false
  );

  assert.equal(
    storagePathBelongsToProperty(
      `morada/properties/${propertyId}/foto.webp`,
      propertyId
    ),
    false
  );

  assert.equal(
    storagePathBelongsToProperty('gisley/properties/qualquer/foto.webp', '../qualquer'),
    false
  );
});


test('R2 HEAD retorna tamanho e MIME reais do objeto', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `
    process.env.R2_ACCOUNT_ID='abc123';
    process.env.R2_BUCKET='gisley-nunes-imoveis';
    process.env.R2_ACCESS_KEY_ID='access-test';
    process.env.R2_SECRET_ACCESS_KEY='secret-test';
    globalThis.fetch = async () => new Response(null, {
      status: 200,
      headers: {
        'content-length': '2097152',
        'content-type': 'image/webp; charset=binary'
      }
    });
    const storage = await import('./server/storage.js');
    const meta = await storage.storageObjectMetadata('gisley/properties/property-id/foto.webp');
    process.stdout.write(JSON.stringify(meta));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.deepEqual(JSON.parse(output), {
    exists: true,
    size: 2097152,
    contentType: 'image/webp'
  });
});
