import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const outputDir = path.resolve(
  process.env.CLOUDFLARE_PREVIEW_DIR || fileURLToPath(new URL('../dist-preview', import.meta.url))
);

test('Cloudflare frontend artifact excludes PHP runtime and admin files', () => {
  const forbidden = ['index.php', '.htaccess', 'admin'];
  const exposed = forbidden.filter((entry) => existsSync(path.join(outputDir, entry)));

  assert.deepEqual(exposed, []);
  assert.ok(existsSync(path.join(outputDir, 'index.html')));
  assert.ok(existsSync(path.join(outputDir, 'images', 'gisley-nunes-imoveis-logo.jpeg')));
});
