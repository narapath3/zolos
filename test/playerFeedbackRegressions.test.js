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
    assert.match(handler, /trustedSender\(socket\)/);
    assert.ok(handler.indexOf("shouldRateLimitEvent(socket._rateLimitTracker, 'player_dead', 2, 10000)") < handler.indexOf('clearAggroForCharacter(player.characterId)'));
    assert.ok(handler.indexOf('clearAggroForCharacter(player.characterId)') < handler.indexOf("isBoundedString(payload?.monsterName, 80)"));
    assert.match(handler, /const monsterName = payload\.monsterName\.trim\(\)/);
    assert.match(engine, /export function clearAggroForCharacter\(characterId\)/);
    assert.match(engine, /monster\.aggroChar = null/);
    assert.match(engine, /monster\.targetX = monster\.spawnX/);
});

test('stall refresh pings require an authenticated character and are rate limited', async () => {
    const server = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
    const handler = server.slice(server.indexOf("socket.on('stall_change'"), server.indexOf('// --- ADMIN ANNOUNCEMENT ---'));

    assert.match(handler, /const player = trustedSender\(socket\)/);
    assert.match(handler, /!player\?\.verified \|\| !player\.characterId/);
    assert.ok(handler.indexOf("shouldRateLimitEvent(socket._rateLimitTracker, 'stall_change', 4, 10000)") < handler.indexOf("io.emit('stalls_update')"));
});

test('kill streak milestones relay with trusted identity, map and bounded cadence', async () => {
    const server = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
    const handler = server.slice(server.indexOf("socket.on('kill_streak'"), server.indexOf('// --- LATENCY PONG ---'));

    assert.match(server, /const KILL_STREAK_MILESTONES = new Set\(\[10, 20, 50, 100, 200, 500\]\)/);
    assert.match(handler, /const player = trustedSender\(socket\)/);
    assert.match(handler, /KILL_STREAK_MILESTONES\.has\(count\)/);
    assert.match(handler, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'kill_streak', 2, 10000\)/);
    assert.match(handler, /userId: player\.userId/);
    assert.match(handler, /username: player\.username/);
    assert.match(handler, /mapId = resolveTrustedMap\(player\)/);
    assert.match(handler, /io\.to\(`map:\$\{mapId\}`\)\.emit\('kill_streak'/);
    assert.doesNotMatch(handler, /payload\.(userId|username|mapId)/);
});

test('latency measurement has a bounded Socket.IO acknowledgement path', async () => {
    const server = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
    const sync = await readFile(new URL('../src/network/GameSync.js', import.meta.url), 'utf8');
    const socketClient = await readFile(new URL('../src/network/SocketClient.js', import.meta.url), 'utf8');
    const handler = server.slice(server.indexOf("socket.on('cli_pong'"), server.indexOf('// --- CHAT ---'));
    const srvPing = sync.slice(sync.indexOf("socket.on('srv_ping'"), sync.indexOf('// Client-side RTT measurement'));

    assert.match(socketClient, /socket\.volatile\.emit\('cli_pong', Date\.now\(\), \(\) =>/);
    assert.match(handler, /typeof acknowledge !== 'function' \|\| !Number\.isFinite\(t\)/);
    assert.match(handler, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'cli_pong', 4, 10000\)/);
    assert.match(handler, /acknowledge\(\)/);
    assert.match(srvPing, /socket\.emit\('srv_pong', t\)/);
    assert.doesNotMatch(srvPing, /cli_pong/);
});

test('server latency samples require the latest issued challenge and bounded echo cadence', async () => {
    const server = await readFile(new URL('../server/server.js', import.meta.url), 'utf8');
    const pong = server.slice(server.indexOf("socket.on('srv_pong'"), server.indexOf('// --- CLIENT-SIDE PING ---'));
    const echo = server.slice(server.indexOf("socket.on('client_ping'"), server.indexOf('// Socket.io acknowledgement ping'));
    const scheduler = server.slice(server.indexOf('// ===== Latency (ping) measurement ====='), server.indexOf('// ============ PVP MMR'));

    assert.match(scheduler, /s\._lastServerPingAt = now[\s\S]*s\.emit\('srv_ping', now\)/);
    assert.match(pong, /!Number\.isFinite\(t\) \|\| t !== socket\._lastServerPingAt/);
    assert.match(pong, /socket\._lastServerPingAt = null/);
    assert.match(pong, /const rtt = Date\.now\(\) - t/);
    assert.match(echo, /!Number\.isFinite\(t\)/);
    assert.match(echo, /shouldRateLimitEvent\(socket\._rateLimitTracker, 'client_ping', 4, 10000\)/);
});

test('players can zoom, fog stays disabled globally, and shops remain solid', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const ui = await readFile(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
    const scene = await readFile(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
    const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

    assert.match(html, /maximum-scale=5\.0, user-scalable=yes/);
    assert.doesNotMatch(html, /id="settings-fog-enabled"/);
    assert.doesNotMatch(ui, /zolos_fog_enabled/);
    assert.match(scene, /this\.scene\.fog = null/);
    assert.match(scene, /setFogEnabled\(\)[\s\S]*this\.fogEnabled = false;[\s\S]*this\.scene\.fog = null;/);
    assert.match(scene, /resolvePlayerCollisions\(position, previousPosition\)/);
    assert.match(main, /sceneManager\.resolvePlayerCollisions\(character\.mesh\.position/);
});

test('vending street leaves a walkable aisle between every pair of stalls', async () => {
    const scene = await readFile(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');

    assert.match(scene, /const STALL_SPACING = 5\.25/);
    assert.match(scene, /\(slot - 3\.5\) \* STALL_SPACING/);
    assert.equal((scene.match(/group\.userData\.collisionRadius = 1\.55/g) || []).length, 2);

    const spacing = 5.25;
    const stallRadius = 1.55;
    const playerRadius = 0.42;
    assert.ok(spacing - (2 * (stallRadius + playerRadius)) >= 1.25);
});

test('all four town services use detailed role-specific NPC models', async () => {
    const scene = await readFile(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');

    assert.match(scene, /_buildPremiumShopkeeper\(role, appearance = null\)/);
    for (const role of ['merchant', 'appraiser', 'smith', 'keeper']) {
        assert.match(scene, new RegExp(`_buildPremiumShopkeeper\\('${role}'\\)`));
    }
    assert.match(scene, /new THREE\.CapsuleGeometry/);
    assert.match(scene, /new THREE\.TorusGeometry/);
    assert.match(scene, /userData\.npcModelRole = role/);
});

test('every playable hero class receives the shared remaster and unique silhouette layers', async () => {
    const character = await readFile(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
    const particles = await readFile(new URL('../src/engine/ParticleSystem.js', import.meta.url), 'utf8');

    for (const job of ['swordsman', 'mage', 'archer', 'priest']) {
        assert.match(character, new RegExp(`job === '${job}'`));
    }
    for (const layer of ['belt', 'buckle', 'collar', 'chestGem']) assert.match(character, new RegExp(`const ${layer} =`));
    for (const skill of ['bash', 'heal', 'magnumBreak', 'endure', 'fireBolt', 'frostNova', 'energyCoat', 'doubleStrafe', 'arrowShower', 'concentration', 'holyLight', 'blessing']) {
        assert.match(particles, new RegExp(`case '${skill}'`));
    }
});

test('hero hair and furry creatures use tapered strand detail without global fur', async () => {
    const character = await readFile(new URL('../src/engine/CharacterManager.js', import.meta.url), 'utf8');
    const pets = await readFile(new URL('../src/engine/PetModels.js', import.meta.url), 'utf8');
    const monsters = await readFile(new URL('../src/engine/MonsterAnatomy.js', import.meta.url), 'utf8');

    assert.match(character, /hairStrandMaterial/);
    assert.match(character, /userData\.hairStrand = true/);
    assert.match(pets, /const furColors = \{ kitten:.*puppy:.*sunfox:.*moon_hare:/);
    assert.match(pets, /userData\.furStrand = true/);
    assert.match(monsters, /const furClumps =/);
    for (const type of ['lunatic', 'bigfoot', 'nine_tail', 'savage']) assert.match(monsters, new RegExp(`type === '${type}'`));
    assert.doesNotMatch(pets, /furColors = \{[^}]*poring/);
});

test('remaining boxy vendors and elite monsters receive professional sculpt passes', async () => {
    const scene = await readFile(new URL('../src/engine/SceneManager.js', import.meta.url), 'utf8');
    const anatomy = await readFile(new URL('../src/engine/MonsterAnatomy.js', import.meta.url), 'utf8');
    const monsters = await readFile(new URL('../src/engine/MonsterManager.js', import.meta.url), 'utf8');

    assert.match(scene, /_buildPremiumShopkeeper\('merchant', app\)/);
    assert.match(scene, /vendor\.visible = false/);
    assert.match(anatomy, /export function addEliteSculptDetails/);
    assert.match(anatomy, /userData\.eliteSculpt = true/);
    assert.match(monsters, /addEliteSculptDetails/);
    for (const family of ['skeleton', 'raydric', 'harpy', 'gargoyle', 'storm_dragon', 'abyss_knight']) {
        assert.match(anatomy, new RegExp(family));
    }
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

test('inventory detail and Equip share one canonical card socket per gear slot', async () => {
    const ui = await readFile(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
    const detailStart = ui.indexOf('let socketHtml');
    const detailEnd = ui.indexOf("document.getElementById('detail-price-val')", detailStart);
    const detail = ui.slice(detailStart, detailEnd);
    const pickerStart = ui.indexOf('_openCardSocketPicker(cardItem)');
    const pickerEnd = ui.indexOf('async _socketCardToItem', pickerStart);
    const picker = ui.slice(pickerStart, pickerEnd);

    assert.match(detail, /const maxSockets = 1/);
    assert.match(detail, /this\.character\?\.equippedCards\?\.\[equipmentSlot\]/);
    assert.match(detail, /this\._openCardPicker\(slotId\)/);
    assert.match(detail, /this\._unsocketCard\(slotId\)/);
    assert.doesNotMatch(detail, /item\.stats\.cards/);
    assert.match(picker, /await this\._socketCard\(slotId, cardItem\.item_name\)/);
    assert.match(picker, /\(\$\{occupied \? 1 : 0\}\/1 socket\)/);
    assert.doesNotMatch(picker, /maxSockets = 4|_socketCardToItem\(/);
});
