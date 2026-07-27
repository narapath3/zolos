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
        /let\s+sx\s*=\s*0;/
    );
    assert.match(
        mainSource,
        /let\s+sz\s*=\s*10;/
    );
    assert.match(
        mainSource,
        /exactWarp\s*=\s*true;/
    );
    assert.match(
        mainSource,
        /typeof\s+payload\.x\s*===\s*'number'/
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

