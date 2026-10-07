import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const mobileWidths = [320, 360, 375, 390, 414, 430];
const tabletWidths = [768, 820, 1024];
const desktopWidths = [1280, 1440, 1920];

async function expectNoHorizontalOverflow(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

test('home permanece responsiva e sem violações axe automatizáveis', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');
  for (const width of [...mobileWidths, ...tabletWidths, ...desktopWidths]) {
    await expectNoHorizontalOverflow(page, width);
  }

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  await expect(page.locator('#empty-state')).toBeHidden();
  expect(consoleErrors).toEqual([]);
});

test('hooks de conversão usam dataLayer sem enviar dados do formulário', async ({ page }) => {
  await page.addInitScript(() => { window.dataLayer = []; });
  await page.goto('/');

  const nameField = page.locator('#contact-form input[name="name"]');
  await nameField.scrollIntoViewIfNeeded();
  await nameField.fill('Visitante de teste');
  await expect.poll(() => page.evaluate(() => window.dataLayer.map((item) => item.event))).toContain('contact_form_start');

  const events = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[href]')].find((item) => new URL(item.href).hostname === 'wa.me');
    if (!link) return window.dataLayer;
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return window.dataLayer;
  });

  expect(events.map((item) => item.event)).toContain('whatsapp_click');
  expect(JSON.stringify(events)).not.toContain('Visitante de teste');
});

test('menu mobile abre com foco e fecha com Escape', async ({ page }) => {
  await page.goto('/');
  await page.setViewportSize({ width: 375, height: 900 });

  const toggle = page.locator('.menu-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#mobile-nav')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#mobile-nav a').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});

test('catálogo estático mantém filtros na URL e aplica o fixture local', async ({ page }) => {
  await page.goto('/imoveis/');
  await page.locator('#purpose').selectOption('Alugar');
  await page.locator('#location').selectOption({ label: 'Buritis' });
  await page.locator('#search-form button[type="submit"]').click();

  await expect(page).toHaveURL(/purpose=Alugar/);
  await expect(page).toHaveURL(/location=Buritis/);
  await expect(page.locator('[data-listing-card] h3')).toHaveText(['Loft Harmonia']);
});

test('catálogo anuncia falha de carregamento e oferece nova tentativa', async ({ page }) => {
  await page.route('**/api/v2/properties**', (route) => route.abort());
  await page.goto('/imoveis/');

  await expect(page.locator('#empty-state')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#empty-state')).toContainText('Não foi possível carregar os imóveis.');
  await expect(page.locator('#filter-summary')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#retry-properties-empty')).toBeVisible();
});

test('galeria usa dialog nativo, navegação e restauração de foco', async ({ page }) => {
  await page.goto('/imoveis/apartamento-solar/');
  await page.setViewportSize({ width: 375, height: 900 });

  const trigger = page.locator('[data-gallery-open]');
  await trigger.click();
  await expect(page.locator('[data-gallery-lightbox]')).toBeVisible();
  await expect(page.locator('[data-gallery-lightbox]')).toHaveAttribute('open', '');
  await page.locator('[data-gallery-lightbox-next]').click();
  await expect(page.locator('[data-gallery-lightbox-current]')).toHaveText('02');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('reduced motion desativa scroll suave e transições', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(`${process.env.E2E_BASE_URL || 'http://127.0.0.1:4320'}/`);
  const state = await page.evaluate(() => ({
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    transitionDurations: [...document.querySelectorAll('*')]
      .map((element) => getComputedStyle(element).transitionDuration)
      .filter((duration) => duration !== '0s')
  }));
  expect(state.reduced).toBe(true);
  expect(state.scrollBehavior).toBe('auto');
  expect(state.transitionDurations).toEqual([]);
  await context.close();
});

test('404 mantém SEO noindex e landmark principal', async ({ page }) => {
  const response = await page.goto('/rota-inexistente/');
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle(/Página não encontrada/);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
