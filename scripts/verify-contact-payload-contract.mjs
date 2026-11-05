import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const formStart = source.indexOf('function initContactForm()');
const formEnd = source.indexOf('\nfunction ', formStart + 1);
const formSource = source.slice(formStart, formEnd === -1 ? undefined : formEnd);

if (!formSource.includes('phone: data.phone')) {
  throw new Error('CONTACT_PHONE_MISSING_FROM_PAYLOAD');
}

console.log('[contact-payload-contract] PASS');
