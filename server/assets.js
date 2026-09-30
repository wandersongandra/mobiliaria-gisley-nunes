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
  } catch {
    cached = {};
  }
  return cached;
}

export function assets() {
  if (!isProduction) return { js: '/src/main.js', css: '' };
  const entry = Object.values(manifest()).find((item) => item.isEntry) || Object.values(manifest())[0];
  return {
    js: entry?.file ? `/${entry.file}` : '',
    css: entry?.css?.[0] ? `/${entry.css[0]}` : ''
  };
}