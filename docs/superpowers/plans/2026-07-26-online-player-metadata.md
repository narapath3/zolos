# Online Player Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Online Players row reliably display Thai city, level, and shared server-measured ping while remaining safe and responsive on mobile.

**Architecture:** A pure server serializer produces one consistent public roster shape for map and global broadcasts. A pure client formatter converts roster records into escaped presentation data, while `GameUI` renders reusable semantic row classes and CSS handles mobile wrapping.

**Tech Stack:** JavaScript ES modules, Node.js test runner, Socket.IO, Vite, CSS.

## Global Constraints

- Online rows show Thai city, `LV <number>`, and `<number>ms`.
- Offline friends show last city, level, and `Offline`; stale ping is never displayed.
- Ping colors are green below 80ms, amber from 80–159ms, and red from 160ms.
- Unavailable ping displays `--ms`; unknown maps display `ไม่ทราบเมือง`; invalid levels display `LV 1`.
- The server is authoritative for other players’ ping; only the local row may use local RTT as a temporary fallback.
- Player metadata must be escaped before HTML rendering.
- Rows are at least 44px high and do not overflow at 320px or 390px.
- Preserve Global/Friends filtering and profile-click behavior.
- Do not modify the user’s existing uncommitted `src/main.js`.

---

## File Structure

- Modify `server/securityPolicy.js`: add the shared public roster serializer.
- Modify `server/server.js`: use the serializer for map/global/periodic rosters.
- Create `src/ui/OnlinePlayerMeta.js`: Thai map labels, normalization, ping classes, and HTML escaping.
- Modify `src/ui/GameUI.js`: render normalized two-line player rows without inline presentation styles.
- Modify `src/styles/index.css`: responsive row layout and metadata badges.
- Create `test/onlinePlayerMetadata.test.js`: pure server/client contract tests.

### Task 1: Normalize the authoritative server roster

**Files:**
- Modify: `server/securityPolicy.js`
- Modify: `server/server.js:964-1020`
- Create: `test/onlinePlayerMetadata.test.js`

**Interfaces:**
- Produces: `serializeOnlinePlayer(info)` returning `{userId,username,level,mapId,device,ping,characterId}`.
- Consumes: trusted `onlinePlayers` records.

- [ ] **Step 1: Write the failing serializer tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeOnlinePlayer } from '../server/securityPolicy.js';

test('online roster serializer includes trusted metadata', () => {
  assert.deepEqual(serializeOnlinePlayer({
    userId: 'u1', username: 'Hero', level: 42, mapId: 'payon',
    device: 'mobile', ping: 78.6, characterId: 'c1',
  }), {
    userId: 'u1', username: 'Hero', level: 42, mapId: 'payon',
    device: 'mobile', ping: 79, characterId: 'c1',
  });
});

test('online roster serializer normalizes missing and invalid values', () => {
  assert.deepEqual(serializeOnlinePlayer({
    username: '<img>', level: -10, mapId: '../bad', device: 'watch', ping: -5,
  }), {
    userId: null, username: '<img>', level: 1, mapId: 'prontera_field',
    device: 'desktop', ping: null, characterId: null,
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/onlinePlayerMetadata.test.js`

Expected: FAIL because `serializeOnlinePlayer` is not exported.

- [ ] **Step 3: Implement the pure serializer**

```js
const PRESENCE_DEVICES = new Set(['desktop', 'tablet', 'mobile']);

export function serializeOnlinePlayer(info = {}) {
  const presence = normalizePresence(info);
  const rawPing = Number(info.ping);
  return {
    userId: info.userId || null,
    username: presence.username,
    level: presence.level,
    mapId: presence.mapId,
    device: PRESENCE_DEVICES.has(info.device) ? info.device : 'desktop',
    ping: Number.isFinite(rawPing) && rawPing >= 0 ? Math.round(rawPing) : null,
    characterId: info.characterId || null,
  };
}
```

- [ ] **Step 4: Replace all duplicated roster object construction**

In `broadcastPlayerList`, call `serializeOnlinePlayer(info)` for both
`players_update` and `players_global`. In the periodic latency broadcast, use
the same helper. Keep map filtering and event names unchanged.

- [ ] **Step 5: Verify focused and full tests**

Run: `node --test test/onlinePlayerMetadata.test.js && npm.cmd test`

Expected: serializer tests and the existing suite PASS with zero failures.

- [ ] **Step 6: Commit**

```bash
git add server/securityPolicy.js server/server.js test/onlinePlayerMetadata.test.js
git commit -m "fix: normalize online player roster metadata"
```

### Task 2: Render safe responsive city, level, and ping metadata

**Files:**
- Create: `src/ui/OnlinePlayerMeta.js`
- Modify: `src/ui/GameUI.js:2907-3092`
- Modify: `src/styles/index.css:1485-1540,5833-5900`
- Modify: `test/onlinePlayerMetadata.test.js`

**Interfaces:**
- Consumes: serialized roster records and optional local RTT.
- Produces: `formatOnlinePlayerMeta(player,{isLocal,localPing})` and `escapeOnlineText(value)`.

- [ ] **Step 1: Extend the test with failing client formatting cases**

```js
import {
  escapeOnlineText, formatOnlinePlayerMeta,
} from '../src/ui/OnlinePlayerMeta.js';

test('online metadata formats Thai city, level, and ping boundaries', () => {
  assert.deepEqual(formatOnlinePlayerMeta(
    { mapId: 'payon', level: 42, ping: 79 },
    { isLocal: false, localPing: 5 },
  ), {
    cityLabel: 'ป่าเปยอง', levelLabel: 'LV 42',
    pingLabel: '79ms', pingClass: 'ping-good', isOffline: false,
  });
  assert.equal(formatOnlinePlayerMeta({ mapId: 'payon', level: 2, ping: 80 }).pingClass, 'ping-mid');
  assert.equal(formatOnlinePlayerMeta({ mapId: 'payon', level: 2, ping: 160 }).pingClass, 'ping-bad');
});

test('offline and missing metadata use safe fallbacks', () => {
  assert.deepEqual(formatOnlinePlayerMeta(
    { isOffline: true, mapId: null, level: '?' },
    { isLocal: false, localPing: 20 },
  ), {
    cityLabel: 'ไม่ทราบเมือง', levelLabel: 'LV 1',
    pingLabel: 'Offline', pingClass: 'ping-offline', isOffline: true,
  });
  assert.equal(formatOnlinePlayerMeta({ mapId: 'unknown_map', level: 5, ping: null }).pingLabel, '--ms');
  assert.equal(escapeOnlineText('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('only the local row may use local RTT fallback', () => {
  assert.equal(formatOnlinePlayerMeta({ level: 1, ping: null }, { isLocal: true, localPing: 55 }).pingLabel, '55ms');
  assert.equal(formatOnlinePlayerMeta({ level: 1, ping: null }, { isLocal: false, localPing: 55 }).pingLabel, '--ms');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/onlinePlayerMetadata.test.js`

Expected: FAIL because `src/ui/OnlinePlayerMeta.js` does not exist.

- [ ] **Step 3: Implement the formatter and escaping**

```js
export const ONLINE_MAP_NAMES_TH = Object.freeze({
  prontera: 'เมืองพรอนเทรา',
  prontera_field: 'ทุ่งพรอนเทรา',
  payon: 'ป่าเปยอง',
  glast_heim: 'ปราสาทกลาสท์ไฮม์',
  mjolnir: 'เทือกเขามิโอลเนียร์',
  abyss_lake: 'ทะเลสาบห้วงลึก',
  svarrga: 'สรวงสวรรค์',
});

export function escapeOnlineText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function formatOnlinePlayerMeta(player = {}, options = {}) {
  const isOffline = player.isOffline === true;
  const parsedLevel = Number.parseInt(player.level, 10);
  const level = Number.isFinite(parsedLevel) ? Math.max(1, Math.min(300, parsedLevel)) : 1;
  const candidate = player.ping == null && options.isLocal ? options.localPing : player.ping;
  const parsedPing = Number(candidate);
  const ping = Number.isFinite(parsedPing) && parsedPing >= 0 ? Math.round(parsedPing) : null;
  return {
    cityLabel: ONLINE_MAP_NAMES_TH[player.mapId] || 'ไม่ทราบเมือง',
    levelLabel: `LV ${level}`,
    pingLabel: isOffline ? 'Offline' : ping == null ? '--ms' : `${ping}ms`,
    pingClass: isOffline ? 'ping-offline' : ping == null ? 'ping-unknown' : ping < 80 ? 'ping-good' : ping < 160 ? 'ping-mid' : 'ping-bad',
    isOffline,
  };
}
```

- [ ] **Step 4: Replace inline row presentation in `GameUI`**

Import both helpers. For each player, calculate `isLocal` and metadata once.
Escape username, user ID, device label, city, level, and ping text. Render:

```html
<div class="player-row player-row--online" data-username="..." data-user-id="..." data-offline="false">
  <span class="online-dot" aria-hidden="true"></span>
  <span class="player-device-icon" aria-label="desktop">💻</span>
  <span class="player-row-content">
    <span class="player-row-main">
      <span class="player-name">Hero</span>
    </span>
    <span class="player-row-meta">
      <span class="player-city-tag">📍 ป่าเปยอง</span>
      <span class="player-level-tag">LV 42</span>
      <span class="player-ping ping-good">📶 79ms</span>
    </span>
  </span>
</div>
```

Use the existing friend star inside `.player-row-main`. Apply
`player-row--offline` instead of inline opacity/filter styles. Keep existing
`data-*` attributes and delegated click handler.

- [ ] **Step 5: Add responsive reusable CSS**

```css
.player-row {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  overflow: hidden;
}
.player-row-content { flex: 1; min-width: 0; display: grid; gap: 4px; }
.player-row-main { display: flex; min-width: 0; align-items: center; gap: 4px; }
.player-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.player-row-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.player-city-tag, .player-level-tag, .player-ping {
  margin: 0;
  white-space: nowrap;
  font-size: 9px;
}
.player-row--offline { opacity: .62; filter: grayscale(1); }
.player-ping.ping-offline, .player-ping.ping-unknown { color: #9aa3b5; }
@media (max-width: 390px) {
  .player-row { align-items: flex-start; }
  .player-row-meta { gap: 4px 6px; }
}
```

- [ ] **Step 6: Verify focused tests, full suite, and build**

Run: `node --test test/onlinePlayerMetadata.test.js && npm.cmd test && npm.cmd run build`

Expected: all tests PASS and Vite exits 0.

- [ ] **Step 7: Manually verify mobile behavior**

Run: `npm.cmd run dev -- --host 127.0.0.1`

At 320px and 390px, verify row metadata wraps without horizontal scrolling,
names truncate instead of overlapping badges, Global/Friends tabs still
filter, and clicking a row opens the same profile action.

- [ ] **Step 8: Commit**

```bash
git add src/ui/OnlinePlayerMeta.js src/ui/GameUI.js src/styles/index.css test/onlinePlayerMetadata.test.js
git commit -m "feat: show city level and ping for online players"
```

### Task 3: Final verification

**Files:**
- No new runtime files.

**Interfaces:**
- Verifies the server serializer and client formatter together.

- [ ] **Step 1: Check the intended diff only**

Run: `git diff --check HEAD~2..HEAD && git status --short`

Expected: no whitespace errors; the pre-existing `src/main.js` and
`.claude/settings.local.json` remain outside both feature commits.

- [ ] **Step 2: Run final automated verification**

Run: `npm.cmd test && npm.cmd run build`

Expected: zero failed tests and production build exit 0.

- [ ] **Step 3: Confirm public roster fields**

Inspect both `players_update` and every `players_global` emission and confirm
they are produced only through `serializeOnlinePlayer`.

- [ ] **Step 4: Record handoff**

Report exact test count, build result, commit SHAs, and note that deployment
requires the server and web client to use the same release.
