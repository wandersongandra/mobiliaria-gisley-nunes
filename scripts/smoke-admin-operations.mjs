/**
 * Visual/interaction smoke for the admin UI using an isolated fake API.
 * It never connects to the real CRM, changes production data, or emulates backend authorization.
 * Requires a local Chromium binary; the Laravel tests cover authorization separately.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const json = (body) => JSON.stringify(body);
const uuid = '11111111-2222-4333-8444-555555555555';
const fixtures = {
  '/api/admin/session': { authenticated: true, csrfToken: 'smoke-only', user: { name: 'Gestora de Teste', role: 'manager', email: 'manager@example.test' } },
  '/api/admin/properties': { properties: [{ id: uuid, title: 'Casa de teste', location: 'Belo Horizonte', city: 'Belo Horizonte', purpose: 'Comprar', type: 'Casa', status: 'draft', availability: 'reserved', price: 500000, price_label: 'R$ 500.000', can_edit: true, photos: [] }], summary: { total: 1, active: 1, published: 0, draft: 1 }, pagination: { total: 1, from: 1, to: 1, current_page: 1, last_page: 1 } },
  '/api/admin/leads': { leads: [], summary: { new: 1, total: 1 }, pagination: { total: 0, current_page: 1, last_page: 1 } },
  '/api/admin/leads/assignees': { assignees: [{ name: 'Gestora', email: 'manager@example.test' }] },
  '/api/admin/attention': { newCount: 1, overdue: 2, today: 1, nextSevenDays: 3, appointments: [{ id: uuid, name: 'Cliente Exemplo', interest: 'Quero comprar um imóvel', assignedTo: 'manager@example.test', followUpDate: '2026-11-06' }], metrics: { totalLast30Days: 12, closedLast30Days: 3, conversionPercent: 25, averageFirstResponseMinutes: 34, responsesMeasured: 9 } },
  '/api/admin/notifications': { unread: 1, items: [{ id: uuid, leadId: uuid, kind: 'new_lead', readAt: null, createdAt: '2026-11-07 08:00:00' }] },
  '/api/admin/forms': { forms: [] },
  '/api/admin/team': { team: [{ email: 'manager@example.test', name: 'Gestora', role: 'manager', active: true, last_login_at: '2026-11-07 10:00:00', is_self: true, is_bootstrap: true }] },
  '/api/admin/team/invitations': { invitations: [] },
};

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const fixture = fixtures[path];
  if (fixture) {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(json(fixture));
    return;
  }
  const asset = {
    '/admin/': ['admin/index.html', 'text/html'],
    '/admin/index.html': ['admin/index.html', 'text/html'],
    '/admin/main.js': ['admin/main.js', 'text/javascript'],
    '/admin/styles.css': ['admin/styles.css', 'text/css'],
    '/admin/refinements.css': ['admin/refinements.css', 'text/css'],
    '/images/gisley-nunes-imoveis-logo.jpeg': ['public/images/gisley-nunes-imoveis-logo.jpeg', 'image/jpeg'],
  }[path];
  if (!asset) { res.writeHead(404); res.end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': asset[1] });
    res.end(await readFile(join(root, asset[0])));
  } catch {
    res.writeHead(404); res.end();
  }
});

// Manual GUI fallback for restricted executors that cannot start headless Chromium.
// Serves fixture data only on loopback; never connects to a real client database.
if (process.argv.includes('--serve-fixtures')) {
  await new Promise((resolveListen) => server.listen(8788, '127.0.0.1', resolveListen));
  console.log('Admin fixture preview: http://127.0.0.1:8788/admin/');
  await new Promise((resolveStop) => process.once('SIGINT', resolveStop));
  await new Promise((resolveClose) => server.close(resolveClose));
  process.exit(0);
}

const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const temporaryProfile = await mkdtemp(join(tmpdir(), 'gisley-admin-smoke-'));
let chromium;
let chromiumClosed;
let chromiumExit;
let chromiumStderr = '';
let ws;
let nextId = 1;
const requests = new Map();

try {
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  chromium = spawn(process.env.CHROMIUM_BIN || '/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--remote-debugging-port=0', `--user-data-dir=${temporaryProfile}`,
    `http://127.0.0.1:${port}/admin/`,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chromiumClosed = new Promise((resolveClose) => chromium.once('close', resolveClose));
  chromium.once('exit', (code, signal) => { chromiumExit = `${code ?? 'null'}/${signal ?? 'none'}`; });
  chromium.stderr.on('data', (chunk) => { chromiumStderr = (chromiumStderr + String(chunk)).slice(-1200); });

  let debugPort;
  for (let attempt = 0; attempt < 400; attempt++) {
    try { debugPort = Number((await readFile(join(temporaryProfile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await delay(50); }
  }
  assert.ok(debugPort, `Chromium DevTools did not start (exit=${chromiumExit ?? 'running'}, ${chromiumStderr.trim().slice(-600)})`);
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    const tabs = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
    target = tabs.find((tab) => tab.type === 'page' && tab.url.includes('/admin/'));
    if (target) break;
    await delay(50);
  }
  assert.ok(target?.webSocketDebuggerUrl, 'Admin tab was not created');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => { ws.addEventListener('open', resolveOpen, { once: true }); ws.addEventListener('error', rejectOpen, { once: true }); });
  ws.addEventListener('message', (event) => {
    const result = JSON.parse(event.data);
    const pending = requests.get(result.id);
    if (!pending) return;
    requests.delete(result.id);
    if (result.error) pending.reject(new Error(result.error.message));
    else pending.resolve(result.result);
  });
  const send = (method, params = {}) => new Promise((resolveRequest, rejectRequest) => {
    const id = nextId++;
    requests.set(id, { resolve: resolveRequest, reject: rejectRequest });
    ws.send(json({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate("!!document.querySelector('#dashboard:not([hidden]) #attention-counts')?.textContent.includes('atrasados')")) break;
    await delay(50);
  }

  assert.equal(await evaluate("document.querySelector('#attention-counts')?.textContent.includes('2 atrasados')"), true);
  assert.equal(await evaluate("document.querySelector('#notification-count')?.textContent"), '1');
  assert.equal(await evaluate("document.querySelector('#property-availability-filter')?.tagName"), 'SELECT');
  assert.equal(await evaluate("document.querySelector('#attention-metrics')?.textContent.includes('25%')"), true);

  assert.equal(await evaluate("document.querySelector('#notification-toggle').click(); !document.querySelector('#notification-center').hidden"), true);
  assert.equal(await evaluate("document.querySelector('#notification-list').textContent.includes('Novo contato recebido')"), true);
  await evaluate("document.querySelector('#notification-close').click(); document.querySelector('#new-property-top').click(); document.querySelector('#property-form').elements.title.value = 'Imóvel da prévia'; document.querySelector('#preview-property').click();");
  assert.equal(await evaluate("document.querySelector('#property-preview-dialog').open && document.querySelector('#property-preview-title').textContent"), 'Imóvel da prévia');
  await evaluate("document.querySelector('#close-property-preview').click(); document.querySelector('#property-dialog').close(); document.querySelector('[data-view=\"forms-view\"]').click();");
  assert.equal(await evaluate("!!document.querySelector('#form-field-add')"), true);
  await evaluate("document.querySelector('#form-field-add').click();");
  assert.equal(await evaluate("JSON.parse(document.querySelector('#form-template-form').elements.definition.value).fields.length"), 1);
  await evaluate("document.querySelector('[data-view=\"team-view\"]').click();");
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate("!!document.querySelector('#team-access-review')")) break;
    await delay(50);
  }
  assert.equal(await evaluate("document.querySelector('#team-access-review')?.textContent.includes('gestor(es)')"), true);

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("document.querySelector('[data-view=\"dashboard-view\"]').click();");
  await delay(300);
  const mobile = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const screenshotPath = join(tmpdir(), 'gisley-admin-operations-mobile.png');
  await writeFile(screenshotPath, Buffer.from(mobile.data, 'base64'));
  console.log(`[admin-browser-smoke] PASS — dashboard, notifications, preview, form builder, team, mobile (${screenshotPath})`);
} finally {
  ws?.close();
  chromium?.kill('SIGTERM');
  await new Promise((resolveClose) => server.close(resolveClose));
  // Chromium writes profile files asynchronously while shutting down. Removing
  // the profile before the browser closes races with those writes on CI hosts.
  if (chromiumClosed) {
    const exitedGracefully = await Promise.race([
      chromiumClosed.then(() => true),
      delay(4000).then(() => false),
    ]);
    if (!exitedGracefully) {
      chromium.kill('SIGKILL');
      await chromiumClosed;
    }
  }
  await rm(temporaryProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
