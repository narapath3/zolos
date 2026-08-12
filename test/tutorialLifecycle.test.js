import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/ui/TutorialSystem.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('tutorial transitions clear polling and previous action handlers', () => {
  assert.match(source, /_showStep\(stepIndex\) \{\s*this\._clearStepHandlers\(\)/);
  assert.match(source, /this\._walkCheckInterval = setInterval/);
  assert.match(source, /clearInterval\(this\._walkCheckInterval\)/);
  assert.match(source, /window\._tutorialMonsterKillHandler = null/);
  assert.match(source, /window\._tutorialPanelHandler = null/);
});

test('tutorial owns a complete destroy lifecycle across character reloads', () => {
  assert.match(source, /destroy\(\) \{[\s\S]*this\._clearStepHandlers\(\)/);
  assert.match(source, /this\.stepTooltip\?\.remove\(\)/);
  assert.match(main, /window\.tutorialSystem\?\.destroy\?\.\(\)/);
});
