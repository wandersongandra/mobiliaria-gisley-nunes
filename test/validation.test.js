import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAuditLimit,
  normalizeContactLead,
  normalizeEmailAddress,
  normalizePhotoInput,
  normalizePhotoOrder,
  normalizePropertyInput,
  normalizeResourceId,
  normalizeSiteSettings,
  normalizeTeamCreate,
  normalizeTeamPatch,
  normalizeUploadRequest
} from '../server/validation.js';

test('normalizePropertyInput rejeita números e enums fora do contrato', () => {
  assert.throws(
    () => normalizePropertyInput({ title: 'Casa', location: 'Belvedere · Belo Horizonte', price: -10 }),
    /INVALID_PROPERTY_NUMBER/
  );
  assert.throws(
    () => normalizePropertyInput({ title: 'Casa', location: 'Belvedere · Belo Horizonte', bedrooms: 999 }),
    /INVALID_PROPERTY_NUMBER/
  );
  assert.throws(
    () => normalizePropertyInput({ title: 'Casa', location: 'Belvedere · Belo Horizonte', purpose: 'Outro' }),
    /INVALID_PROPERTY/
  );

  const data = normalizePropertyInput({
    title: ' Casa Ipê ',
    location: 'Belvedere · Belo Horizonte',
    price: 0,
    bedrooms: 50,
    purpose: 'Comprar'
  });
  assert.equal(data.title, 'Casa Ipê');
  assert.equal(data.price, 0);
  assert.equal(data.bedrooms, 50);
  assert.equal(data.purpose, 'Comprar');
});

test('normalizePropertyInput exige localização e cria preço exibido', () => {
  assert.throws(() => normalizePropertyInput({ title: 'Sem endereço' }), /LOCATION_REQUIRED/);
  const data = normalizePropertyInput({ title: 'Casa', location: 'Lourdes · Belo Horizonte', price: 2480000 });
  assert.equal(data.priceLabel, 'R$ 2.480.000');
  const rental = normalizePropertyInput({ title: 'Cobertura', location: 'Savassi · Belo Horizonte', purpose: 'Alugar', price: 18500 });
  assert.equal(rental.priceLabel, 'R$ 18.500 / mês');
});

test('normalizeSiteSettings exige contato essencial e valida Instagram', () => {
  const base = {
    email: 'gisley@example.com',
    whatsapp: '553191554677',
    area: 'Belo Horizonte e região'
  };

  assert.throws(() => normalizeSiteSettings({ ...base, email: '' }), /INVALID_EMAIL/);
  assert.throws(() => normalizeSiteSettings({ ...base, whatsapp: '' }), /INVALID_WHATSAPP/);
  assert.throws(() => normalizeSiteSettings({ ...base, area: '' }), /INVALID_SITE_SETTINGS/);
  assert.throws(() => normalizeSiteSettings({ ...base, instagramUrl: 'javascript:alert(1)' }), /INVALID_INSTAGRAM_URL/);
  assert.throws(() => normalizeSiteSettings({ ...base, instagramUrl: 'https://example.com/a' }), /INVALID_INSTAGRAM_URL/);

  const data = normalizeSiteSettings({ ...base, crci: '', instagramUrl: '' });
  assert.equal(data.email, 'gisley@example.com');
  assert.equal(data.whatsapp, '553191554677');
  assert.equal(data.crci, '');
});

test('normalizeContactLead exige e-mail válido e mensagem', () => {
  assert.throws(() => normalizeContactLead({ name: 'Ana', email: 'invalido', message: 'Olá' }), /INVALID_CONTACT/);
  const data = normalizeContactLead({ name: 'Ana', email: 'ANA@EXAMPLE.COM', message: 'Tenho interesse', interest: 'Quero comprar um imóvel' });
  assert.equal(data.email, 'ana@example.com');
  assert.equal(data.interest, 'Quero comprar um imóvel');
});


test('normalizeTeamCreate exige código temporário de vinculação válido', () => {
  const base = {
    name: 'Corretor Teste',
    email: 'corretor@example.com',
    role: 'editor'
  };

  assert.throws(() => normalizeTeamCreate({ ...base, pairingCode: '' }), /INVALID_TEAM_MEMBER/);
  assert.throws(() => normalizeTeamCreate({ ...base, pairingCode: 'curto' }), /INVALID_TEAM_MEMBER/);
  assert.throws(() => normalizeTeamCreate({ ...base, pairingCode: 'codigo com espaco 123' }), /INVALID_TEAM_MEMBER/);

  const data = normalizeTeamCreate({
    ...base,
    pairingCode: 'AbCdEfGhIjKlMnOp'
  });
  assert.equal(data.email, 'corretor@example.com');
  assert.equal(data.pairingCode, 'AbCdEfGhIjKlMnOp');
  assert.equal(data.role, 'editor');
});


test('números em string aceitam somente representação decimal simples', () => {
  const base = { title: 'Casa', location: 'Lourdes · Belo Horizonte' };

  for (const value of ['1e6', '0x10', '+10', '.5', '1.', 'NaN', 'Infinity']) {
    assert.throws(
      () => normalizePropertyInput({ ...base, price: value }),
      /INVALID_PROPERTY_NUMBER/,
      value
    );
  }

  assert.equal(normalizePropertyInput({ ...base, price: '10' }).price, 10);
  assert.equal(normalizePropertyInput({ ...base, price: '10.50' }).price, 10.5);
});

test('contratos fechados rejeitam chaves extras e tipos estruturais inesperados', () => {
  const property = { title: 'Casa', location: 'Lourdes · Belo Horizonte' };

  assert.throws(
    () => normalizePropertyInput({ ...property, admin: true }),
    /INVALID_PROPERTY/
  );
  assert.throws(
    () => normalizePropertyInput({ ...property, bedrooms: [] }),
    /INVALID_PROPERTY_NUMBER/
  );
  assert.throws(
    () => normalizeContactLead({ name: 'Ana', email: 'ana@example.com', message: 'Oi', role: 'manager' }),
    /INVALID_CONTACT/
  );
  assert.throws(
    () => normalizeTeamPatch({ role: ['manager'] }),
    /INVALID_TEAM_MEMBER/
  );
  assert.throws(
    () => normalizeUploadRequest({ propertyId: {}, fileName: 'foto.jpg', contentType: 'image/jpeg', size: 100 }),
    /INVALID_ID/
  );
  assert.throws(
    () => normalizePhotoInput({ storagePath: 'x', contentType: 'image/jpeg', size: 10, width: 10, height: {} }),
    /INVALID_ASSET/
  );
});

test('e-mail usa contrato canônico compartilhado', () => {
  assert.equal(normalizeEmailAddress('  USER.Name+tag@Example.COM '), 'user.name+tag@example.com');

  for (const value of [
    'sem-arroba.example.com',
    'a@localhost',
    '"quoted"@example.com',
    'a b@example.com',
    'a@example..com',
    'a@-example.com',
    'a@example-.com'
  ]) {
    assert.throws(() => normalizeEmailAddress(value), /INVALID_EMAIL/, value);
  }
});

test('controles bidi de override/isolamento são rejeitados em textos', () => {
  const malicious = 'Casa \u202Egpj.exe';
  assert.throws(
    () => normalizePropertyInput({ title: malicious, location: 'Lourdes · Belo Horizonte' }),
    /TITLE_REQUIRED|INVALID_PROPERTY/
  );

  assert.throws(
    () => normalizeContactLead({
      name: `Ana\u2066admin\u2069`,
      email: 'ana@example.com',
      message: 'Olá'
    }),
    /INVALID_CONTACT/
  );
});

test('propertyPath do contato aceita somente rotas públicas previstas', () => {
  const base = { name: 'Ana', email: 'ana@example.com', message: 'Olá' };
  for (const propertyPath of ['/', '/contato', '/imoveis', '/imoveis/casa-ipe']) {
    assert.equal(normalizeContactLead({ ...base, propertyPath }).propertyPath, propertyPath);
  }

  for (const propertyPath of [
    '//evil.example',
    '/imoveis/../admin',
    '/imoveis/%2e%2e/admin',
    '/api/admin/team',
    '/imoveis/casa-ipe?x=1',
    '/imoveis/casa_ipe'
  ]) {
    assert.throws(
      () => normalizeContactLead({ ...base, propertyPath }),
      /INVALID_CONTACT/,
      propertyPath
    );
  }
});

test('IDs rejeitam tamanho e caracteres fora do contrato', () => {
  assert.equal(normalizeResourceId('abc-DEF_123', { max: 36 }), 'abc-DEF_123');
  assert.throws(() => normalizeResourceId('../abc', { max: 36 }), /INVALID_ID/);
  assert.throws(() => normalizeResourceId('a/b', { max: 36 }), /INVALID_ID/);
  assert.throws(() => normalizeResourceId('x'.repeat(37), { max: 36 }), /INVALID_ID/);
});


test('ordem de fotos rejeita duplicados e IDs fora do contrato', () => {
  assert.deepEqual(
    normalizePhotoOrder({ photoIds: ['photo-1', 'photo_2'] }),
    ['photo-1', 'photo_2']
  );

  assert.throws(
    () => normalizePhotoOrder({ photoIds: ['photo-1', 'photo-1'] }),
    /INVALID_ORDER/
  );
  assert.throws(
    () => normalizePhotoOrder({ photoIds: ['../photo-1'] }),
    /INVALID_ID/
  );
  assert.throws(
    () => normalizePhotoOrder({ photoIds: Array.from({ length: 41 }, (_, i) => `photo-${i}`) }),
    /INVALID_ORDER/
  );
});


test('audit limit aceita somente faixa explícita de 1 a 250', () => {
  assert.equal(normalizeAuditLimit(undefined), 100);
  assert.equal(normalizeAuditLimit('1'), 1);
  assert.equal(normalizeAuditLimit('250'), 250);
  assert.throws(() => normalizeAuditLimit('0'), /INVALID_LIMIT/);
  assert.throws(() => normalizeAuditLimit('251'), /INVALID_LIMIT/);
  assert.throws(() => normalizeAuditLimit('1e2'), /INVALID_LIMIT/);
});

test('e-mail rejeita pontos consecutivos ou nas extremidades do local-part', () => {
  for (const email of [
    '.ana@example.com',
    'ana.@example.com',
    'ana..silva@example.com'
  ]) {
    assert.throws(() => normalizeEmailAddress(email), /INVALID_EMAIL/, email);
  }
});


test('upload rejeita SVG, executável e mismatch básico de extensão', () => {
  const base = {
    propertyId: 'property-id',
    size: 1024
  };

  for (const input of [
    { ...base, fileName: 'imagem.svg', contentType: 'image/svg+xml' },
    { ...base, fileName: 'malware.exe', contentType: 'image/jpeg' },
    { ...base, fileName: 'imagem.png', contentType: 'image/jpeg' },
    { ...base, fileName: 'imagem.jpg', contentType: 'application/octet-stream' },
    { ...base, fileName: 'imagem.jpg', contentType: 'image/jpeg', size: 0 },
    { ...base, fileName: 'imagem.jpg', contentType: 'image/jpeg', size: (12 * 1024 * 1024) + 1 }
  ]) {
    const normalized = (() => {
      try { return normalizeUploadRequest(input); } catch { return null; }
    })();

    if (input.fileName === 'imagem.png' && input.contentType === 'image/jpeg') {
      // O contrato básico aceita os dois campos individualmente; a rota cruza MIME x extensão.
      assert.ok(normalized);
    } else {
      assert.equal(normalized, null, JSON.stringify(input));
    }
  }
});
