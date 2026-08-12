import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

// Everything the login screen does not need. Each of these is imported only by
// main.js, so a static import here drags it back into the initial bundle.
const GAME_ONLY = [
  'engine/SceneManager.js',
  'engine/CombatSystem.js',
  'engine/ParticleSystem.js',
  'engine/SoundManager.js',
  'engine/AdaptiveRendererSystem.js',
  'ui/GameUI.js',
  'ui/BGMHUD.js',
  'ui/AdminUI.js',
  'ui/TutorialSystem.js',
  'ui/GlobalAnnouncements.js',
  'network/GameSync.js',
];

test('main.js does not statically import any game-only module', () => {
  for (const path of GAME_ONLY) {
    assert.doesNotMatch(
      main,
      new RegExp(`^import[^\\n]*['"]\\./${path.replace('.', '\\.')}['"]`, 'm'),
      `${path} must stay behind loadGameModules()`,
    );
    assert.match(main, new RegExp(`import\\('\\./${path.replace('.', '\\.')}'\\)`), `${path} must be lazily imported`);
  }
});

test('the login screen still gets the models its 3D showcase renders', () => {
  // LoginShowcase3D builds real heroes and monsters; deferring these would
  // leave the login screen empty.
  assert.match(main, /^import \{ CharacterManager \} from '\.\/engine\/CharacterManager\.js';$/m);
  assert.match(main, /^import \{ MonsterManager \} from '\.\/engine\/MonsterManager\.js';$/m);
});

test('every lazily bound symbol is assigned by loadGameModules', () => {
  const loader = main.match(/function loadGameModules\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.notEqual(loader, '', 'loadGameModules must exist');

  // Collect the `let` declarations that stand in for the deferred imports.
  const declared = new Set();
  for (const block of main.matchAll(/^let ([A-Za-z0-9_, ]+);$/gm)) {
    for (const name of block[1].split(',')) declared.add(name.trim());
  }

  // Only the names this test cares about — app state vars are declared the same
  // way, so restrict to the ones the loader is responsible for.
  const lazy = [
    'SceneManager', 'CombatSystem', 'ParticleSystem', 'SoundManager',
    'AdaptiveRendererSystem', 'GameUI', 'AdminUI', 'TutorialSystem',
    'GlobalAnnouncements', 'initBGMHUD',
    'loadCharacter', 'saveCharacter', 'loadCharacterCards', 'saveInventoryItem',
    'joinPresence', 'leavePresence', 'startAutoSave', 'stopAutoSave', 'sendSaveState',
    'broadcastPosition', 'broadcastMonsterHit', 'reportMonsterHit', 'broadcastAttackHit',
    'broadcastChat', 'broadcastSkillCast', 'updatePresence',
    'getDeterministicGuestName', 'isPlaceholderName', 'sendBossHit',
  ];

  for (const name of lazy) {
    assert.ok(declared.has(name), `${name} must be declared as a lazy binding`);
    assert.match(loader, new RegExp(`\\b${name}\\b`), `${name} is never assigned by loadGameModules`);
  }
});

test('every GameSync symbol main.js calls is one the loader assigns', () => {
  const loader = main.match(/function loadGameModules\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  // Strip comments — prose like "sendWarpRequest() asks the server..." is not
  // a call site.
  const body = main
    .slice(main.indexOf('// ============ App State ============'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const gameSync = fs.readFileSync(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
  const exported = [...gameSync.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)/gm)].map(m => m[1]);

  // Some call sites pull their own handle out of a local dynamic import; those
  // are self-contained and need nothing from the shared bindings.
  const locallyImported = new Set();
  const localForms = [
    /const \{([^}]*)\} = await import\('\.\/network\/GameSync\.js'\)/g,
    /import\('\.\/network\/GameSync\.js'\)\.then\(\(\{([^}]*)\}\)/g,
  ];
  for (const form of localForms) {
    for (const m of body.matchAll(form)) {
      for (const name of m[1].split(',')) locallyImported.add(name.trim());
    }
  }

  for (const name of exported) {
    if (locallyImported.has(name)) continue;
    if (!new RegExp(`\\b${name}\\(`).test(body)) continue; // not used by main.js
    assert.match(loader, new RegExp(`\\b${name}\\b`), `main.js calls ${name}() but the loader never binds it`);
  }
});

test('the game bundle is resolved before the character load that needs it', () => {
  const select = main.match(/async function showCharacterSelect\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(select, /await loadGameModules\(\);/);
  assert.ok(
    select.indexOf('await loadGameModules()') < select.indexOf('loadCharacterResilient()'),
    'modules must be loaded before the first GameSync call',
  );
});

test('a failed module load can be retried', () => {
  const loader = main.match(/function loadGameModules\(\) \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(loader, /gameModulesPromise = null;[\s\S]*?throw error;/);
});
