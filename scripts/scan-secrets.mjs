import { execFileSync } from 'node:child_process';

const patterns = [
  { name: 'private-key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'github-fine-grained-token', re: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { name: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'sensitive-env', re: /\b(?:R2_SECRET_ACCESS_KEY|MANUS_API_KEY|GISELY_SESSION_SECRET)\s*=\s*([^\s#]+)/g },
  { name: 'database-url', re: /\bDATABASE_URL\s*=\s*mysql:\/\/([^:\s]+):([^@\s]+)@/g }
];

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

function allowed(match) {
  const value = String(match || '').toLowerCase();
  return allowedFragments.some((fragment) => value.includes(fragment.toLowerCase()));
}

function scan(text, scope) {
  const findings = [];
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    for (const match of text.matchAll(re)) {
      const value = match[0];
      const captured = String(match[1] || match[2] || '').replace(/^['"]|['"]$/g, '');
      if (allowed(value)) continue;
      if (name === 'sensitive-env' && captured.length < 20) continue;
      findings.push({
        scope,
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

const tracked = git(['grep', '-nI', '-e', '.', 'HEAD', '--', ':!pnpm-lock.yaml']).toString();
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

const findings = [
  ...scan(tracked, 'tracked-files'),
  ...scan(history, 'git-history')
];

if (findings.length) {
  console.error('Potential secrets detected. Values are redacted:');
  for (const finding of findings) {
    console.error(`- [${finding.scope}] ${finding.type}: ${finding.preview}`);
  }
  process.exit(1);
}

console.log('Secret scan: PASS');
