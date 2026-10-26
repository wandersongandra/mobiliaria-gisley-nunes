import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const templates = await Promise.all([
  readFile(new URL('../resources/views/partials/footer.blade.php', import.meta.url), 'utf8'),
  readFile(new URL('../views/partials/footer.ejs', import.meta.url), 'utf8')
]);

test('rodapés identificam a autoria da Gandra.Tech com link seguro', () => {
  for (const template of templates) {
    assert.match(template, /Desenvolvido por/);
    assert.match(template, /href="https:\/\/www\.gandra\.tech\//);
    assert.match(template, />gandra\.tech<\/a>/);
    assert.match(template, /target="_blank"/);
    assert.match(template, /rel="noopener noreferrer"/);
  }
});
