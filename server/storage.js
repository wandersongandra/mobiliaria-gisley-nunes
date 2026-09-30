import { hasStorage, storage } from './config.js';

export function safeFileName(value) {
  return String(value || 'imagem').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 100) || 'imagem';
}

export async function storagePresign(filePath) {
  if (!hasStorage()) throw new Error('STORAGE_NOT_CONFIGURED');
  const url = `${storage.apiUrl}/v1/storage/presign/put?path=${encodeURIComponent(filePath)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${storage.apiKey}` } });
  const body = await response.json();
  if (!response.ok || !body.url) throw new Error(body.error || `STORAGE_PRESIGN_${response.status}`);
  return body.url;
}