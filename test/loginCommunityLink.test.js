import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');

const anchor = html.match(/<a id="auth-facebook-link"[\s\S]*?<\/a>/)?.[0] || '';

// Pull an at-rule's body out by matching braces — `[\s\S]*?\}` stops at the
// first nested rule's closing brace, which is never the block we want.
function blockAt(source, headerPattern) {
  const header = source.match(headerPattern);
  if (!header) return '';
  let i = source.indexOf('{', header.index);
  if (i === -1) return '';
  const start = i + 1;
  let depth = 1;
  while (++i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
  }
  return source.slice(start, i - 1);
}

test('the login screen links to the official Facebook page', () => {
  assert.notEqual(anchor, '', 'the community link must exist on the login screen');
  assert.match(anchor, /href="https:\/\/www\.facebook\.com\/zolos\.online"/);
});

test('the outbound link cannot hand the opener to the target page', () => {
  assert.match(anchor, /target="_blank"/);
  // Without noopener the new tab can navigate this one via window.opener.
  assert.match(anchor, /rel="noopener noreferrer"/);
});

test('the link sits inside the auth panel, after the online counter', () => {
  const authScreen = html.slice(html.indexOf('<div id="auth-screen">'), html.indexOf('<!-- Game Screen -->'));
  assert.ok(authScreen.includes('auth-facebook-link'), 'must live on the login screen, not the game HUD');
  assert.ok(
    authScreen.indexOf('online-count') < authScreen.indexOf('auth-facebook-link'),
    'the community link belongs below the online counter',
  );
});

test('the pill is sized to fit a narrow phone without clipping', () => {
  const rule = css.match(/\.auth-social-link \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.notEqual(rule, '', 'the community link needs its own styling');
  assert.match(rule, /max-width: min\(92vw, \d+px\)/, 'must be capped against the viewport');
  assert.match(rule, /width: fit-content/);
  // Labels scale down on small screens rather than overflowing the pill.
  assert.match(css, /\.auth-social-title \{[\s\S]*?font-size: clamp\(/);
  assert.match(css, /\.auth-social-sub \{[\s\S]*?font-size: clamp\(/);
});

test('the link is keyboard reachable and respects reduced motion', () => {
  assert.match(css, /\.auth-social-link:focus-visible \{[\s\S]*?outline:/);
  const reduced = blockAt(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,400}?auth-social-link/);
  assert.match(reduced, /\.auth-social-link::after \{[\s\S]*?animation: none/);
});

test('hover flourishes stay behind a hover-capable media query', () => {
  // Touch devices latch :hover styles, so the lift/glow must be gated.
  const hoverBlock = blockAt(css, /@media \(hover: hover\)[\s\S]{0,200}?\.auth-social-link:hover/);
  assert.match(hoverBlock, /\.auth-social-link:hover \{/);
  assert.match(hoverBlock, /\.auth-social-link:hover \.auth-social-glyph \{/);
  // ...and nothing outside it should style the hover state.
  const outside = css.replace(hoverBlock, '');
  assert.doesNotMatch(outside, /\n\s*\.auth-social-link:hover \{/);
});
