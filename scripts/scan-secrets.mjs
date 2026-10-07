import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const patterns = [
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'github-fine-grained-token', re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { name: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'sensitive-env', re: /\b(?:R2_SECRET_ACCESS_KEY|MANUS_API_KEY|GISELY_SESSION_SECRET)\s*=\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9+/_=-]{20,}))/g },
  { name: 'database-url', re: /\bDATABASE_URL\s*=\s*mysql:\/\/([^:\s]+):([^@\s]+)@/g }
];

const allowedSecretFingerprints = new Set([
  'c6e70b5b12dfae6cb4ca3cd7bbb2823b89c46be3055d618ed38f0dbb38eb737f',
  'e2186dbdb1bb4193608605e84f33208765b5693b55edd4f730a719a100eeea6f',
  '0edec44622570ac7bcc0c17d3fe4bf7b8968bb6cfee88be83f6c4d21d232deb5',
  '6c9548eabf9ae126801c074196b81284ced5623ed1e1d8d6dc3330db1f50a67d',
  'e3fe5a2828ef845aef6fe762bcb6fa7abb664d2d0604499c817bf511b98bd4a8',
  'acffdb356f84071a45619fd1228aa092b3c3b07a2b1995457c851e0eaabad5dc',
  '4c8a4911db7c3812e5fe5dfd193a262c14df7eca64ed20547a0d2f685eab47a0'
]);

function fingerprint(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

const allowedFragments = [
  'troque-por-um-segredo',
  'secret-test',
  'usuario:senha',
  '<SECRET',
  '<ACCESS',
  'example',
  'changeme',
  'change-me',
  'placeholder'
];

function allowed(match, captured = '', location = '') {
  const value = String(match || '').toLowerCase();
  if (allowedFragments.some((fragment) => value.includes(fragment.toLowerCase()))) return true;
  const historicalFixture = /(^|[:\\/])test[\\/]/.test(String(location))
    || /(^|[:\\/])\.env\.example$/.test(String(location));
  return historicalFixture && Boolean(captured) && allowedSecretFingerprints.has(fingerprint(captured));
}

function scanText(text, { scope, location }) {
  const findings = [];
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    for (const match of String(text || '').matchAll(re)) {
      const value = match[0];
      const captured = String(match[1] || match[2] || match[3] || '').replace(/^['"]|['"]$/g, '');
      if (allowed(value, captured, location)) continue;
      if (name === 'sensitive-env' && captured.length < 20) continue;
      findings.push({
        scope,
        location,
        type: name,
        preview: value.slice(0, 12) + (value.length > 12 ? '…' : '')
      });
      if (findings.length >= 50) return findings;
    }
  }
  return findings;
}

function git(args, maxBuffer = 100 * 1024 * 1024) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

const findings = [];
const tracked = git(['grep', '-nI', '-e', '.', 'HEAD', '--', ':!pnpm-lock.yaml']).toString();
for (const line of tracked.split('\n')) {
  if (!line) continue;
  const match = line.match(/^HEAD:(.*?):(\d+):(.*)$/);
  if (!match) continue;
  findings.push(...scanText(match[3], {
    scope: 'tracked-files',
    location: `${match[1]}:${match[2]}`
  }));
}

const history = git([
  'log',
  '-p',
  '--all',
  '--full-history',
  '--no-ext-diff',
  '--format=commit:%H',
  '--',
  '.',
  ':(exclude)pnpm-lock.yaml'
]);

let currentCommit = 'unknown';
let currentPath = 'unknown';
for (const line of history.split('\n')) {
  if (line.startsWith('commit:')) {
    currentCommit = line.slice('commit:'.length).trim();
    currentPath = 'unknown';
    continue;
  }
  if (line.startsWith('+++ b/')) {
    currentPath = line.slice('+++ b/'.length).trim();
    continue;
  }
  if (!line.startsWith('+') && !line.startsWith('-')) continue;
  if (line.startsWith('+++') || line.startsWith('---')) continue;
  findings.push(...scanText(line.slice(1), {
    scope: 'git-history',
    location: `${currentCommit.slice(0, 12)}:${currentPath}`
  }));
  if (findings.length >= 50) break;
}

if (findings.length) {
  console.error('Potential secrets detected. Values are redacted:');
  for (const finding of findings) {
    console.error(`- [${finding.scope}] ${finding.location} ${finding.type}: ${finding.preview}`);
  }
  process.exit(1);
}

console.log('Secret scan: PASS');
