import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/ui/CardAlbum.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/styles/cards.css', import.meta.url), 'utf8');
const gameUi = fs.readFileSync(new URL('../../src/ui/GameUI.js', import.meta.url), 'utf8');
const indexCss = fs.readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');

test('album includes filters, progress, locked cards, detail, fusion, and reveal', () => {
  for (const hook of [
    'card-album__filters', 'card-album__progress', 'card-tile--locked',
    'card-detail__source', 'card-detail__pity', 'card-fusion',
    'card-drop-reveal',
  ]) assert.match(source, new RegExp(hook));
});

test('album is phone-safe, touch-safe, and motion-safe', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(min-width:\s*370px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /image-rendering:\s*pixelated/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
});

test('album interactions are semantic, focus-managed, queued, and authoritative', () => {
  assert.match(source, /<button[\s\S]*aria-pressed=/);
  assert.match(source, /<label>[\s\S]*<select/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /focusableElements\(container\)/);
  assert.match(source, /this\._lastFocus\?\.isConnected/);
  assert.match(source, /await this\.options\.onFuse\?\.\(card\.id\)/);
  assert.match(source, /this\.dropQueue\.push/);
  assert.match(source, /isEventSecret\(card, state\)/);
  assert.doesNotMatch(source, /combatSystem|pauseSimulation|tcg-emoji/);
});

test('GameUI owns one album and removes the injected emoji gallery', () => {
  assert.match(gameUi, /import \{ CardAlbum \} from '\.\/CardAlbum\.js'/);
  assert.match(gameUi, /this\.cardAlbum = new CardAlbum/);
  assert.match(gameUi, /refreshCardAlbum\(\)/);
  assert.match(gameUi, /showCardDropReveal\(cardId, context/);
  assert.match(gameUi, /this\.cardAlbum\?\.destroy\(\)/);
  assert.doesNotMatch(gameUi, /_ensureCardGalleryStyles|_renderCardGallery/);
  assert.match(indexCss, /^@import ['"]\.\/cards\.css['"];/);
});
