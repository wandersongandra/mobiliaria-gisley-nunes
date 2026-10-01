import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isProduction } from './config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let cached = null;

function manifest() {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(path.join(root, 'dist', '.vite', 'manifest.json'), 'utf8'));
    return cached;
  } catch (error) {
    if (isProduction) throw new Error('ASSET_MANIFEST_MISSING', { cause: error });
    cached = {};
    return cached;
  }
}

export function assets() {
  if (!isProduction) return { js: '/src/main.js', css: '' };
  const entries = Object.values(manifest());
  const entry = entries.find((item) => item.isEntry) || entries[0];
  if (!entry?.file) throw new Error('ASSET_MANIFEST_MISSING');
  return {
    js: `/${entry.file}`,
    css: entry.css?.[0] ? `/${entry.css[0]}` : ''
  };
}

export function assertAssetsReady() {
  assets();
  return true;
}
