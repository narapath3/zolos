import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LoginCanvasBg } from '../src/engine/LoginCanvasBg.js';

test('missing login canvas never schedules an animation frame', () => {
  const originalDocument = globalThis.document;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  let requestedFrames = 0;

  globalThis.document = { getElementById: () => null };
  globalThis.requestAnimationFrame = () => {
    requestedFrames += 1;
    return requestedFrames;
  };

  try {
    const background = new LoginCanvasBg('missing-canvas');
    background.start();
    assert.equal(requestedFrames, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test('AuthUI show restores the online-count subscription', async () => {
  const source = await readFile(new URL('../src/ui/AuthUI.js', import.meta.url), 'utf8');
  const showMethod = source.slice(source.lastIndexOf('    show()'));
  assert.match(showMethod, /this\._subscribeOnlineCount\(\)/);
});

test('login stylesheet does not request the missing epic background', async () => {
  const source = await readFile(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /login_bg_epic\.png/);
});
