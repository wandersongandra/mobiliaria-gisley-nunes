import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../admin/main.js', import.meta.url), 'utf8');
const contactForm = readFileSync(new URL('../resources/views/home.blade.php', import.meta.url), 'utf8');

assert.match(index, /href="#leads-view" data-view="leads-view"/);
assert.match(index, /id="lead-search" name="search"/);
assert.match(index, /id="lead-summary-em_contato"/);
assert.match(contactForm, /name="phone" type="tel" autocomplete="tel"/);
assert.match(index, /data-manager-only hidden type="button">Exportar CSV/);
assert.match(index, /data-manager-only hidden type="button">Exportar JSON/);
assert.match(source, /request\('\/api\/admin\/leads\/assignees'\)/);
assert.match(source, /assigned_to_email = assigned \|\| null/);
assert.match(source, /escapeHTML\(lead\.internal_notes \|\| ''\)/);
assert.match(source, /https:\/\/wa\.me\/\$\{encodeURIComponent\(phone\)\}/);
assert.match(source, /for \(const key of \['search', 'status', 'date_from', 'date_to'\]\)/);

console.log('[admin-leads-contract] PASS');
