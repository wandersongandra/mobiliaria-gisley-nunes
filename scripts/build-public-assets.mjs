import { copyFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  configFile: path.join(root, 'vite.config.js')
});

const manifest = JSON.parse(await readFile(path.join(root, 'dist', '.vite', 'manifest.json'), 'utf8'));
const entry = manifest['src/main.js'];

if (!entry?.file || !entry.css?.[0]) {
  throw new Error('PUBLIC_ASSET_MANIFEST_INCOMPLETE');
}

await copyFile(path.join(root, 'dist', entry.file), path.join(root, 'public', 'assets', 'main.js'));
await copyFile(path.join(root, 'dist', entry.css[0]), path.join(root, 'public', 'assets', 'main.css'));

for (const filename of ['index.html', 'main.js', 'styles.css', 'refinements.css']) {
  await copyFile(path.join(root, 'admin', filename), path.join(root, 'public', 'admin', filename));
}

console.log('[assets] public/assets and public/admin synchronized from source');
