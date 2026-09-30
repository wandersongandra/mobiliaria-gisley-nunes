import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSiteInfo, getSiteInfo, getTestimonials } from '../server/site.js';

// Garante que os testes exercitem o fallback, nunca uma conexão real.
process.env.DATABASE_URL = '';

test('defaultSiteInfo possui os campos editáveis pelo admin', () => {
  for (const key of ['crci', 'area', 'email', 'whatsapp', 'phoneDisplay', 'instagramUrl']) {
    assert.ok(defaultSiteInfo[key], `campo ausente: ${key}`);
  }
});

test('getSiteInfo retorna o fallback quando não há banco', async () => {
  const site = await getSiteInfo();
  assert.equal(site.name, defaultSiteInfo.name);
  assert.ok(site.crci);
  assert.ok(site.email);
});

test('getTestimonials retorna uma lista com autor e texto', async () => {
  const testimonials = await getTestimonials();
  assert.ok(Array.isArray(testimonials));
  assert.ok(testimonials.length >= 1);
  assert.ok(testimonials[0].author);
  assert.ok(testimonials[0].quote);
});