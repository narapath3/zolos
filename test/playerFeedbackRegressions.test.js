import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('chat submission uses one Chrome-safe path for click and Enter', async () => {
    const ui = await readFile(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

    assert.match(ui, /const sendMessage = \(event\) =>/);
    assert.match(ui, /event\?\.preventDefault\?\.\(\)/);
    assert.match(ui, /e\.isComposing \|\| e\.keyCode === 229/);
    assert.match(ui, /if \(e\.defaultPrevented\) return/);
    assert.match(html, /<button type="button" id="btn-send-chat"/);
});

test('player death clears server-authoritative monster aggro before announcement validation', async () => {
    const server = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
    const engine = await readFile(new URL('../server/game/monsterEngine.js', import.meta.url), 'utf8');

    const handler = server.slice(server.indexOf("socket.on('player_dead'"), server.indexOf('// --- DISCONNECT ---'));
    assert.ok(handler.indexOf('clearAggroForCharacter(player.characterId)') < handler.indexOf('if (!payload || !payload.monsterName) return'));
    assert.match(engine, /export function clearAggroForCharacter\(characterId\)/);
    assert.match(engine, /monster\.aggroChar = null/);
    assert.match(engine, /monster\.targetX = monster\.spawnX/);
});

test('players can zoom, disable fog, and cannot walk through shop colliders', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const ui = await readFile(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
    const scene = await readFile(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
    const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

    assert.match(html, /maximum-scale=5\.0, user-scalable=yes/);
    assert.match(html, /id="settings-fog-enabled"/);
    assert.match(ui, /zolos_fog_enabled/);
    assert.match(scene, /setFogEnabled\(enabled\)/);
    assert.match(scene, /resolvePlayerCollisions\(position, previousPosition\)/);
    assert.match(main, /sceneManager\.resolvePlayerCollisions\(character\.mesh\.position/);
});
