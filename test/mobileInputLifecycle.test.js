import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');

test('mobile actions suppress the synthetic click following touchstart', () => {
  const bind = source.match(/const bindTouchAction = \(button, action\) => \{([\s\S]*?)\n    \};/)?.[1] || '';
  assert.match(bind, /lastTouchAt = performance\.now\(\)/);
  assert.match(bind, /performance\.now\(\) - lastTouchAt < 700/);
  assert.match(source, /bindTouchAction\(sprintBtn, toggleSprint\)/);
  assert.match(source, /bindTouchAction\(attackBtn, triggerAttack\)/);
  assert.match(source, /bindTouchAction\(btn, \(\) => this\.castSkillSlot\(index\)\)/);
});

test('pinch and cancel paths cannot leave movement active or trigger a world tap', () => {
  assert.match(source, /const resetMovementInput = \(\) =>/);
  assert.match(source, /for \(const key of Object\.keys\(activeKeys\)\) triggerKeyEvent\(key, false\)/);
  assert.match(source, /if \(distance > 0\) window\.sceneManager\?\.setCameraZoom/);
  assert.match(source, /e\.type !== 'touchcancel' && duration < 250/);
});
