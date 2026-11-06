import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const footer = await readFile(new URL('../resources/views/partials/footer.blade.php', import.meta.url), 'utf8');
const views = new URL('../resources/views/', import.meta.url);

test('rodapé Laravel identifica a autoria da Gandra.Tech com link seguro', () => {
  assert.match(footer, /Desenvolvido por/);
  assert.match(footer, /href="https:\/\/www\.gandra\.tech\//);
  assert.match(footer, />gandra\.tech<\/a>/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noopener noreferrer"/);
});

test('todas as páginas Blade públicas incluem o rodapé institucional', async () => {
  const pages = (await readdir(views)).filter((file) => file.endsWith('.blade.php'));
  assert.ok(pages.length >= 8, 'o inventário das páginas públicas não pode estar vazio');

  for (const page of pages) {
    const template = await readFile(new URL(page, views), 'utf8');
    assert.match(template, /@include\('partials\.footer'\)/, `rodapé ausente em ${page}`);
  }
});
