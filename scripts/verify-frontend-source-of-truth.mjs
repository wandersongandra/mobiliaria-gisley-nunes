import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function equalFiles(left, right) {
  const [leftBuffer, rightBuffer] = await Promise.all([
    readFile(path.join(root, left)),
    readFile(path.join(root, right))
  ]);
  return leftBuffer.equals(rightBuffer);
}

for (const filename of ['index.html', 'main.js', 'styles.css', 'refinements.css']) {
  if (!await equalFiles(`admin/${filename}`, `public/admin/${filename}`)) {
    throw new Error(`ADMIN_ARTIFACT_DRIFT:${filename}`);
  }
}

const manifest = JSON.parse(await readFile(path.join(root, 'dist', '.vite', 'manifest.json'), 'utf8'));
const entry = manifest['src/main.js'];

if (!entry?.file || !entry.css?.[0]) {
  throw new Error('PUBLIC_ASSET_MANIFEST_INCOMPLETE');
}

for (const [source, artifact] of [[entry.file, 'public/assets/main.js'], [entry.css[0], 'public/assets/main.css']]) {
  if (!await equalFiles(`dist/${source}`, artifact)) {
    throw new Error(`PUBLIC_ARTIFACT_DRIFT:${artifact}`);
  }
}

console.log('[source-of-truth] admin and Laravel public artifacts are synchronized');
