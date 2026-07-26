# Online Roster Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore visible online players when production provides only the map-scoped `players_update` event.

**Architecture:** The presence callback remains the baseline UI data path in every connection mode. The existing `players_global` listener remains the preferred enhancement and overwrites that baseline when the server supports it.

**Tech Stack:** JavaScript ES modules, Socket.io client, Node.js test runner

## Global Constraints

- Do not change the socket protocol or server behavior.
- Keep `players_global` as the preferred cross-map roster.
- Preserve offline/mock presence behavior.

---

### Task 1: Restore the compatible roster callback

**Files:**
- Modify: `src/main.js:786-792`
- Create: `test/onlineRosterFallback.test.js`

**Interfaces:**
- Consumes: `joinPresence(..., onPlayersUpdate)` from `src/network/GameSync.js`
- Produces: every presence callback forwards its roster to `GameUI.updateOnlinePlayers(players)`

- [ ] **Step 1: Write the failing regression test**

Create a source-contract test that reads `src/main.js`, locates the
`joinPresence` callback, and asserts that `gameUI.updateOnlinePlayers(players)`
is not guarded by `!isSocketConnected()`. Also assert that
`src/network/GameSync.js` still registers `socket.on('players_global', ...)`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/onlineRosterFallback.test.js`

Expected: FAIL because `main.js` contains
`if (gameUI && !isSocketConnected())`.

- [ ] **Step 3: Implement the minimal fix**

Replace the socket-dependent UI guard with:

```js
if (gameUI) {
    gameUI.updateOnlinePlayers(players);
}
```

Leave the map-isolation logic and `players_global` listener unchanged.

- [ ] **Step 4: Verify GREEN**

Run: `node --test test/onlineRosterFallback.test.js`

Expected: both compatibility assertions PASS.

- [ ] **Step 5: Run complete verification**

Run: `npm.cmd test`

Expected: all tests PASS with zero failures.

Run: `npm.cmd run build`

Expected: TypeScript and Vite production build exit successfully.

- [ ] **Step 6: Commit and push**

```text
git add test/onlineRosterFallback.test.js src/main.js docs/superpowers/plans/2026-07-26-online-roster-fallback.md
git commit -m "fix: restore online roster fallback"
git push origin main
```
