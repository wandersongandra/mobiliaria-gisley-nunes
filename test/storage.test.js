import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeFileName } from '../server/storage.js';

test('safeFileName remove caracteres inseguros e preserva extensão', () => {
  assert.equal(safeFileName(' Sala / Principal 01.JPG '), 'Sala-Principal-01.JPG');
  assert.equal(safeFileName('../../segredo.png'), 'segredo.png');
});

test('safeFileName sempre retorna um nome utilizável', () => {
  assert.equal(safeFileName('...'), 'imagem');
  assert.equal(safeFileName(''), 'imagem');
});
