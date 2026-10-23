import { createServer } from 'node:http';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

let adminServer;
let adminOrigin;

test.beforeAll(async () => {
  adminServer = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }

    const allowed = pathname === '/admin' || pathname === '/admin/' || pathname.startsWith('/admin/') || pathname.startsWith('/images/');
    const requestedPath = pathname === '/admin' || pathname === '/admin/' ? '/admin/index.html' : pathname;
    const filename = path.resolve(publicRoot, `.${requestedPath}`);
    if (!allowed || !filename.startsWith(`${publicRoot}${path.sep}`)) {
      response.writeHead(404).end('Not found');
      return;
    }

    const details = statSync(filename, { throwIfNoEntry: false });
    if (!details?.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }

    const resolvedFilename = realpathSync(filename);
    if (!resolvedFilename.startsWith(`${publicRoot}${path.sep}`)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const type = contentTypes[path.extname(resolvedFilename).toLowerCase()] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(readFileSync(resolvedFilename));
  });

  await new Promise((resolve) => adminServer.listen(0, '127.0.0.1', resolve));
  adminOrigin = `http://127.0.0.1:${adminServer.address().port}`;
});

test.afterAll(async () => {
  if (adminServer?.listening) await new Promise((resolve, reject) => adminServer.close((error) => error ? reject(error) : resolve()));
});

async function openAdmin(page, overrides = {}, path = '/admin/') {
  await page.route('**/api/admin/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const defaults = {
      '/api/admin/session': { authenticated: true, csrfToken: 'synthetic-csrf', user: { name: 'Equipe de teste', role: 'manager' } },
      '/api/admin/properties': { properties: [], pagination: { current_page: 1, last_page: 1, total: 0, from: null, to: null }, summary: { total: 0, active: 0, published: 0, draft: 0 } },
      '/api/admin/leads': { leads: [], pagination: { current_page: 1, last_page: 1, total: 0, from: null, to: null }, summary: { new: 0 } },
      '/api/admin/team': { team: [] },
      '/api/admin/team/invitations': { invitations: [] },
      '/api/admin/site': { site: { whatsapp: '', phoneDisplay: '', email: '', address: '', crci: '', area: '', instagramUrl: '', instagramDisplay: '' }, testimonials: [] },
      '/api/admin/audit': { audit: [] }
    };
    const response = overrides[pathname] ?? defaults[pathname];
    if (!response) return route.fulfill({ status: 404, json: { message: 'Not mocked' } });
    if (typeof response === 'function') return response(route);
    return route.fulfill({ json: response });
  });
  await page.route(/^https:\/\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(`${adminOrigin}${path}`);
}

test('admin remove token de convite da barra de endereço e o preserva para o login', async ({ page }) => {
  const token = 'A'.repeat(43);
  await openAdmin(page, {
    '/api/admin/session': { authenticated: false, csrfToken: '', user: null }
  }, `/admin/?invite=${token}&keep=1`);

  await expect(page).toHaveURL(`${adminOrigin}/admin/?keep=1`);
  await expect(page.locator('#login-button')).toHaveAttribute('href', `/api/auth/login?invite=${token}`);
});

test('admin mostra contatos como indisponíveis e permite repetir a consulta', async ({ page }) => {
  let failures = 1;
  await openAdmin(page, {
    '/api/admin/leads': async (route) => {
      if (failures-- > 0) return route.fulfill({ status: 503, json: { message: 'synthetic unavailable' } });
      return route.fulfill({ json: { leads: [], pagination: { current_page: 1, last_page: 1, total: 0, from: null, to: null }, summary: { new: 0 } } });
    }
  });

  await expect(page.locator('#metric-total')).toHaveText('00');
  await expect(page.locator('#metric-leads-new')).toHaveText('—');
  await page.locator('#retry-admin-leads').click();
  await expect(page.locator('#metric-leads-new')).toHaveText('00');
  await expect(page.locator('#session-indicator')).toHaveText('Sessão autenticada');
});

test('admin recupera a equipe após falha e sincroniza navegação com histórico', async ({ page }) => {
  let failures = 1;
  await openAdmin(page, {
    '/api/admin/team': async (route) => {
      if (failures-- > 0) return route.fulfill({ status: 503, json: { message: 'synthetic unavailable' } });
      return route.fulfill({ json: { team: [{ name: 'Usuária sintética', email: 'fake@example.test', role: 'manager', active: true, is_self: true, is_bootstrap: true }] } });
    }
  });

  const teamLink = page.locator('[data-view="team-view"]');
  await teamLink.click();
  await expect(page).toHaveURL(/#team-view$/);
  await expect(page.locator('#team-view h3')).toBeFocused();
  await expect(teamLink).toHaveAttribute('aria-current', 'page');
  await page.locator('#retry-team-load').click();
  await expect(page.getByText('Usuária sintética')).toBeVisible();

  await page.goBack();
  await expect(page.locator('#dashboard-view')).toBeVisible();
  await expect(page.locator('[data-view="dashboard-view"]')).toHaveAttribute('aria-current', 'page');
});

test('upload de fotos pode ser aberto pelo teclado e o painel cabe no celular', async ({ page }) => {
  await openAdmin(page);
  await page.locator('#new-property-top').click();

  const upload = page.locator('#photo-upload-trigger');
  await expect(upload).toHaveAttribute('aria-controls', 'photo-input');
  const chooserPromise = page.waitForEvent('filechooser');
  await upload.focus();
  await page.keyboard.press('Enter');
  expect((await chooserPromise).isMultiple()).toBe(true);

  await page.locator('.dialog-close').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('admin aponta para o site público e inicia novos imóveis como rascunho', async ({ page }) => {
  await openAdmin(page);

  await expect(page.locator('.side-nav [data-public-site-link]')).toHaveAttribute(
    'href',
    'https://www.gisleynunesimoveis.com.br/'
  );

  await page.locator('#new-property-top').click();
  await expect(page.locator('input[name="published"]')).not.toBeChecked();
  await page.locator('.dialog-close').click();
});


test('cadastro de imóvel envia o contrato compatível e mantém o modal dentro da janela', async ({ page }) => {
  let savedPayload = null;
  await openAdmin(page, {
    '/api/admin/properties': async (route) => {
      if (route.request().method() === 'POST') {
        savedPayload = await route.request().postDataJSON();
        return route.fulfill({ json: { property: {
          id: 'property-test-1', title: savedPayload.title, location: savedPayload.location,
          city: savedPayload.city, purpose: savedPayload.purpose, type: savedPayload.type,
          status: savedPayload.status, featured: savedPayload.featured, photos: []
        } } });
      }
      return route.fulfill({ json: { properties: [], pagination: { current_page: 1, last_page: 1, total: 0, from: null, to: null }, summary: { total: 0, active: 0, published: 0, draft: 0 } } });
    }
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#new-property-top').click();
  await page.locator('input[name="title"]').fill('Casa de teste contratual');
  await page.locator('#property-dialog input[name="location"]').fill('Centro · Belo Horizonte');
  await expect(page.locator('input[name="published"]')).not.toBeChecked();
  await page.locator('#save-property').click();

  await expect.poll(() => savedPayload).not.toBeNull();
  expect(savedPayload.status).toBe('draft');
  expect(savedPayload).not.toHaveProperty('published');
  expect(savedPayload).toHaveProperty('featured', false);
  await expect(page.locator('#property-dialog')).toBeHidden();

  await page.locator('#new-property-top').click();
  await expect(page.locator('#dialog-title')).toBeVisible();
  const bounds = await page.locator('#property-dialog').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport);
});
