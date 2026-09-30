import { hasStorage, storage } from './config.js';

export function safeFileName(value) {
  return String(value || 'imagem')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100) || 'imagem';
}

export async function storagePresign(filePath) {
  if (!hasStorage()) throw new Error('STORAGE_NOT_CONFIGURED');
  const base = storage.apiUrl.replace(/\/$/, '');
  const url = `${base}/v1/storage/presign/put?path=${encodeURIComponent(filePath)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${storage.apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) throw new Error(body.error || `STORAGE_PRESIGN_${response.status}`);
  return body.url;
}
