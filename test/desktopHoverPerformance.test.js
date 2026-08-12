import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('desktop hover raycasts are coalesced to one animation-frame callback', () => {
  const section = main.slice(main.indexOf('// Mouse move for monster/player hovering'), main.indexOf('\n}\n\nlet characterLoadInFlight'));
  assert.match(section, /let pendingHoverEvent = null/);
  assert.match(section, /if \(hoverFrameId === null\) hoverFrameId = requestAnimationFrame\(updateCanvasHover\)/);
  assert.match(section, /const e = pendingHoverEvent;\s*\n\s*pendingHoverEvent = null/);
  assert.match(section, /if \(!e \|\| document\.hidden\) return/);
  const hoverCallback = section.slice(section.indexOf('const updateCanvasHover ='), section.indexOf("canvas.addEventListener('mousemove'"));
  assert.equal((hoverCallback.match(/getMouseIntersection\(/g) || []).length, 1);
});
