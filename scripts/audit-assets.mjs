import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEMS, FISH_SPECIES } from '../src/engine/GameData.js';
import { itemIconMarkup, itemIconPath } from '../src/engine/ItemVisuals.js';
import { getCard } from '../src/cards/CardCatalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const existsForPublicPath = (assetPath) => assetPath?.startsWith('/assets/') && fs.existsSync(path.join(publicRoot, assetPath.slice(1)));
const itemRows = Object.entries(ITEMS).map(([name, data]) => {
  const markup = itemIconMarkup({ item_name: name, item_type: data.type, emoji: data.emoji });
  const pathName = itemIconPath(name);
  const isPetAtlas = markup.includes('item-visual--pet') && fs.existsSync(path.join(publicRoot, 'assets/pets/pet-sanctuary-atlas-v1.png'));
  const isCard = pathName?.startsWith('/assets/cards/') && existsForPublicPath(pathName);
  const dynamicModel = markup.includes('data-item-model=');
  const authoredArt = Boolean((pathName && existsForPublicPath(pathName)) || isPetAtlas || isCard || dynamicModel);
  return { name, type: data.type || 'unknown', path: pathName, renderMode: isPetAtlas ? 'pet-atlas' : (isCard ? 'card-png' : (pathName && existsForPublicPath(pathName) ? 'png' : (dynamicModel ? 'dynamic-3d' : 'fallback'))), authoredArt, fallback: !authoredArt };
});
const fishRows = Object.keys(FISH_SPECIES).map(name => ({ name, path: itemIconPath(name), exists: existsForPublicPath(itemIconPath(name)) }));
const visualFiles = [
  'src/ui/GameUI.js', 'src/ui/AdminUI.js', 'server/admin/index.html',
  'src/ui/PlayerProfileModal.js', 'src/ui/LoadingOverlay.js', 'src/ui/GlobalAnnouncements.js',
];
const emojiRe = /item\.emoji|\$\{[^}]*\.emoji[^}]*\}|emoji\s*\|\|/g;
const rawEmojiVisualCalls = Object.fromEntries(visualFiles.map(relative => {
  const text = fs.readFileSync(path.join(root, relative), 'utf8');
  return [relative, [...text.matchAll(emojiRe)].map(match => ({ index: match.index, text: match[0] }))];
}));
const result = {
  generatedAt: new Date().toISOString(),
  itemCatalog: { total: itemRows.length, authoredArt: itemRows.filter(row => row.authoredArt).length, fallback: itemRows.filter(row => row.fallback).length, byRenderMode: Object.fromEntries([...new Set(itemRows.map(row => row.renderMode))].map(mode => [mode, itemRows.filter(row => row.renderMode === mode).length])) },
  fishCatalog: { total: fishRows.length, missing: fishRows.filter(row => !row.exists).length },
  pets: { atlas: '/assets/pets/pet-sanctuary-atlas-v1.png', exists: fs.existsSync(path.join(publicRoot, 'assets/pets/pet-sanctuary-atlas-v1.png')) },
  rawEmojiVisualCalls,
  fallbackItems: itemRows.filter(row => row.fallback).map(row => ({ name: row.name, type: row.type })),
};
console.log(JSON.stringify(result, null, 2));
