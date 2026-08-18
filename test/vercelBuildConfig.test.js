import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const repoRoot = new URL('../', import.meta.url);
const packageJson = JSON.parse(fs.readFileSync(new URL('package.json', repoRoot), 'utf8'));
const pnpmLock = fs.readFileSync(new URL('pnpm-lock.yaml', repoRoot), 'utf8');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('root package dependencies are represented in pnpm importer lockfile', () => {
  const importer = pnpmLock.split('\n\npackages:')[0];
  for (const section of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(packageJson[section] || {})) {
      const lockKey = name.includes('/') ? `'${name}'` : name;
      assert.match(
        importer,
        new RegExp(`^\\s{6}${escapeRegExp(lockKey)}:\\s*$`, 'm'),
        `${section}.${name} is missing from pnpm-lock.yaml importer`,
      );
    }
  }
});

test('Vercel build contract stays explicit', () => {
  const vercelConfig = fs.readFileSync(new URL('vercel.json', repoRoot), 'utf8');
  assert.match(vercelConfig, /"destination":\s*"\/index\.html"/);
  assert.match(vercelConfig, /"installCommand":\s*"pnpm install --frozen-lockfile"/);
  assert.match(vercelConfig, /"buildCommand":\s*"pnpm run build"/);
  assert.match(vercelConfig, /"outputDirectory":\s*"dist"/);
  assert.equal(packageJson.scripts.build, 'tsc && vite build');
});
