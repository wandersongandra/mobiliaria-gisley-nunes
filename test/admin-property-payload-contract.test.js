import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../admin/main.js', import.meta.url), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `função ${name} não encontrada`);
  const signatureEnd = source.indexOf(')', start);
  const openingBrace = source.indexOf('{', signatureEnd);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openingBrace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }

  assert.fail(`fim da função ${name} não encontrado`);
}

const buildPropertyPayload = vm.runInNewContext(`(${extractFunction('buildPropertyPayload')})`);
const buildInitialPropertyPayload = vm.runInNewContext(`(${extractFunction('buildInitialPropertyPayload')})`);

test('admin property payload mantém status/featured e remove published em qualquer caminho', () => {
  const published = buildPropertyPayload(
    { title: 'Casa teste', published: false, priceLabel: '' },
    { isManager: true, wantsPublished: true, isFeatured: true },
  );
  assert.equal(published.status, 'published');
  assert.equal(published.featured, true);
  assert.equal(Object.hasOwn(published, 'published'), false);
  assert.equal(Object.hasOwn(published, 'priceLabel'), false);

  const draft = buildPropertyPayload(
    { title: 'Casa rascunho', published: true },
    { isManager: false, wantsPublished: true, isFeatured: true },
  );
  assert.equal(draft.status, 'draft');
  assert.equal(draft.featured, false);
  assert.equal(Object.hasOwn(draft, 'published'), false);
});

test('payload inicial de upload não reintroduz published por spread ou literal', () => {
  for (const method of ['POST', 'PUT']) {
    const initial = buildInitialPropertyPayload(
      { method, title: 'Casa com fotos', status: 'published', featured: true, published: false },
      true,
    );
    assert.deepEqual({ ...initial }, { method, title: 'Casa com fotos', status: 'draft', featured: false });
  }

  const sourceOfInitialBuilder = extractFunction('buildInitialPropertyPayload');
  assert.doesNotMatch(sourceOfInitialBuilder, /\bpublished\s*:/);
  assert.match(sourceOfInitialBuilder, /delete payload\.published;/);
});

test('admin upload tolera arquivo sem MIME ou extensão quando a assinatura é de imagem permitida', () => {
  assert.match(source, /function imageSignatureContentType\(bytes\)/);
  assert.match(source, /await file\.slice\(0, 32\)\.arrayBuffer\(\)/);
  assert.match(source, /function imageUploadName\(file, contentType\)/);
  assert.match(source, /const classified = await Promise\.all\(incoming\.map\(async \(file\)/);
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /\/api\/admin\/properties\/\$\{propertyId\}\/photos\/upload/);
});
