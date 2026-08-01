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

test('priest cooldowns remain per-skill and respawn restores the owner mesh', async () => {
    const character = await readFile(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
    assert.match(character, /this\.cooldowns\[skillId\] = skill\.cooldown/);
    assert.doesNotMatch(character, /for \(const .*cooldowns.*skill\.cooldown/);
    assert.match(character, /this\.mesh\.visible = !firstPerson/);
});

test('monster labels expose danger level and the legacy Lunatic is publicly Moonhare', async () => {
    const data = await readFile(new URL('../src/engine/GameData.js', import.meta.url), 'utf8');
    const monsters = await readFile(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');
    const cards = await readFile(new URL('../src/cards/CardCatalog.js', import.meta.url), 'utf8');
    assert.match(data, /lunatic:\s*\{[\s\S]*?name: 'Moonhare'/);
    assert.match(monsters, /_updateDangerLabel\(playerLevel\)/);
    assert.match(monsters, /deadly: '#ff4d55'.*danger: '#ffd34e'.*even: '#ffffff'/);
    assert.match(monsters, /labelStagger/);
    assert.match(cards, /displayName: 'Moonhare'/);
});
