# Player Profile Bug from Online Players

## Flow Trace
1. User clicks a row in `#players-body` (Online Players panel)
2. Click handler at line 1999: `const row = e.target.closest('.player-row')`
3. Gets `targetUsername` from `data-username` attribute
4. Gets `isOffline` from `data-offline` attribute
5. If NOT offline: `this.onlinePlayers.find(p => p.username === targetUsername)` → `_showPlayerPopup(player)`

## Potential Issues

### Issue 1: `_showPlayerPopup` sets `selectedProfilePlayer` then calls `_fetchAndShowPlayerProfile`
- `_fetchAndShowPlayerProfile` is `async` but `_showPlayerPopup` does NOT await it
- This means `selectedProfilePlayer` is set synchronously, but the DB fetch happens after
- The modal should still appear because `show()` is called with `null` DB data + liveAppearance

### Issue 2: `fetchPublicCharacter` returns null for guest users
- If userId starts with 'guest_' or 'local_', it returns null immediately (line 89)
- In that case, show() is called with null dbData but liveAppearance should work
- The modal should still render with liveAppearance data

### Issue 3: The old `_renderPlayerProfileDetails` is dead code
- Defined at line 2153 but never called anywhere
- It was the OLD way of showing profile details in the legacy popup

### Issue 4: Console.log is silenced in production
- `console.log = noop` in main.js line 12 (non-localhost)
- This means our debug logs in _fetchAndShowPlayerProfile are invisible
- But this doesn't affect functionality

### MOST LIKELY ROOT CAUSE
The issue might be that `this.onlinePlayers.find(p => p.username === targetUsername)` returns `undefined` because:
- The `onlinePlayers` array might not contain the player object with the matching username
- Or the `player.userId` might be missing/empty

If `player` is found but `player.userId` is undefined, then:
- `fetchPublicCharacter(player.userId)` returns null (because !userId is true at line 89)
- `liveAppearance` is null (because `remotePlayersMap.get(undefined)` returns undefined)
- Modal shows with all fallback/empty data → appears "broken"

### FIX NEEDED
Add better error handling and ensure the modal shows useful data even when DB query fails.
Also ensure that the player object from onlinePlayers always has a valid userId.
