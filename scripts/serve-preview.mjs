import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist-preview');
const port = Number(process.env.PREVIEW_PORT || 4320);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function safePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const relative = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(root, relative);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`) ? candidate : null;
}

async function resolveFile(urlPath) {
  const candidate = safePath(urlPath);
  if (!candidate) return null;

  const candidates = [candidate];
  if (urlPath.endsWith('/')) candidates.push(path.join(candidate, 'index.html'));
  else if (!path.extname(candidate)) candidates.push(path.join(candidate, 'index.html'));

  for (const filename of candidates) {
    try {
      const details = await stat(filename);
      if (details.isFile()) return filename;
    } catch {
      // Try the next deterministic candidate.
    }
  }

  return null;
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
  const filename = await resolveFile(requestUrl.pathname);
  const fallback = filename || await resolveFile('/404.html');

  if (!fallback) {
    response.writeHead(404).end('Not found');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  const status = filename ? 200 : 404;
  const type = contentTypes[path.extname(fallback).toLowerCase()] || 'application/octet-stream';
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(fallback).pipe(response);
});

await access(root);
server.listen(port, '127.0.0.1', () => {
  console.log(`[preview-server] http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
