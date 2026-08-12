import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSource = readFileSync(
    new URL('../src/main.js', import.meta.url),
    'utf8',
);
const gameSyncSource = readFileSync(
    new URL('../src/network/GameSync.js', import.meta.url),
    'utf8',
);
const gameUISource = readFileSync(new URL('../src/ui/GameUI.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');

test('sendWarpRequest supports simulation in offline mode', () => {
    // Verify that sendWarpRequest checks isOfflineMode and has a mockPlayers check code path.
    assert.match(
        gameSyncSource,
        /if\s*\(isOfflineMode\)\s*\{/
    );
    assert.match(
        gameSyncSource,
        /mockPlayers\.find\(/
    );
    assert.match(
        gameSyncSource,
        /window\.warpManager\.onWarpResult/
    );
});

test('warpManager.onWarpResult falls back to coordinate defaults', () => {
    // Verify that the callback handles coordinate fallbacks if they are not numbers.
    assert.match(
        mainSource,
        /let\s+sx,\s*sz;/
    );
    assert.match(
        mainSource,
        /payload\.x\s*!=\s*null\s*&&\s*payload\.z\s*!=\s*null/
    );
});

test('warpManager handles pending request timeout', () => {
    assert.match(
        mainSource,
        /_timeoutId\s*=\s*setTimeout\(/
    );
    assert.match(
        mainSource,
        /clearTimeout\(/
    );
    assert.match(
        mainSource,
        /10000/
    );
});

test('warp-to-friend uses correlated live server coordinates', () => {
    assert.match(gameSyncSource, /const requestId = `warp:/);
    assert.match(gameSyncSource, /socket\.emit\('warp_request', \{ targetUserId, requestId \}\)/);
    assert.match(mainSource, /payload\.requestId !== this\._pending\.requestId/);
    assert.match(gameUISource, /sendWarpRequest\(target\.userId \|\| target\.username\)/);
    assert.doesNotMatch(gameUISource.slice(gameUISource.indexOf('// Warp-to-friend from profile popup'), gameUISource.indexOf('// PVP duel challenge from profile popup')), /this\._doWarp\(targetMap\)/);
});

test('server commits warp room, map and trusted position atomically', () => {
    const start = serverSource.indexOf("socket.on('warp_request'");
    const end = serverSource.indexOf('// ============ PVP DUEL SYSTEM', start);
    const warp = serverSource.slice(start, end);
    assert.match(warp, /const oldMapId = requester\.mapId/);
    assert.match(warp, /socket\.leave\(`map:\$\{oldMapId\}`\)/);
    assert.match(warp, /requester\.mapId = targetMapId/);
    assert.match(warp, /socket\.join\(`map:\$\{targetMapId\}`\)/);
    const transition = warp.indexOf('requester.mapId = targetMapId');
    const successEmit = warp.indexOf("socket.emit('warp_result'", transition);
    assert.ok(transition >= 0 && successEmit > transition);
    assert.match(warp, /requester\.lastPos = \{[\s\S]*mapId: targetMapId/);
    assert.match(warp, /broadcastPlayerList\(oldMapId\)[\s\S]*broadcastPlayerList\(targetMapId\)/);
});

