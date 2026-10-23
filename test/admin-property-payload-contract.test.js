import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../admin/main.js', import.meta.url), 'utf8');

test('admin property payload sends status instead of the UI-only published field', () => {
  assert.match(
    source,
    /data\.status = isManager && form\.elements\.published\.checked \? 'published' : 'draft';/
  );
  assert.match(source, /delete data\.published;/);
  assert.doesNotMatch(source, /data\.published\s*=/);
});

test('admin upload tolera arquivo sem MIME ou extensão quando a assinatura é de imagem permitida', () => {
  assert.match(source, /function imageSignatureContentType\(bytes\)/);
  assert.match(source, /await file\.slice\(0, 32\)\.arrayBuffer\(\)/);
  assert.match(source, /function imageUploadName\(file, contentType\)/);
  assert.match(source, /const classified = await Promise\.all\(incoming\.map\(async \(file\)/);
});
