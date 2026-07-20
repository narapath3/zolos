# ZOLOS Item Persistence Bug — Investigation Findings

## Bug 1: saveInventoryItem silently swallows errors (GameSync.js)
**Lines 786-817**: After the `maybeSingle()` check, if `fetchError` occurs, the function returns early without logging that the item was NOT saved. If the INSERT or UPDATE fails, there is no error handling — the function completes silently without confirming success or failure.

## Bug 2: updateInventoryItemStats silently swallows errors (GameSync.js)
**Lines 820-836**: No try/catch, no error logging. If the Supabase update fails, the client never knows and the equipped state is lost on reload.

## Bug 3: _performShopAction buy button click handler is fire-and-forget (GameUI.js)
**Line 3577**: `buyBtn.addEventListener('click', () => { this._performShopAction(); });` — The click handler does NOT await the async `_performShopAction()`. While `_performShopAction` itself has `await`, the click handler doesn't wait for it. This means if the user clicks buy, the function starts but the browser could navigate away before it completes. More importantly, this is a minor issue compared to Bug 4.

## Bug 4: _flushInventoryToDB only saves items with stats (GameUI.js) — ROOT CAUSE
**Line 815**: `const itemsToSave = this.inventory.filter(item => item.stats && Object.keys(item.stats).length > 0);`

This is the **PRIMARY ROOT CAUSE**. When a player buys a Mage Staff, it gets quantity 1 but initially has NO stats object (or an empty stats object). The `_flushInventoryToDB` filters out ALL items that don't have stats with keys. So if a player buys an item and doesn't equip it immediately, `_flushInventoryToDB` never saves it. The item exists in the local `this.inventory` array but never gets persisted to the database.

Even when the player equips it, `updateInventoryItemStats` is called which only updates the `stats` column — but if `saveInventoryItem` was never called (because `_flushInventoryToDB` skipped it), the row doesn't exist yet. Wait — actually `_performShopAction` DOES call `saveInventoryItem` on purchase (line 3709). Let me re-examine...

Actually `_performShopAction` does call `saveInventoryItem` at line 3709 with `await`. So the purchase flow IS saving to DB. The issue must be elsewhere.

## Re-evaluation: The real issues are:

### Issue A: updateInventoryItemStats has no error handling (GameSync.js lines 820-836)
The function performs a raw Supabase update with no `.error` check and no try/catch. If the update fails (RLS, network, etc.), the equipped state is silently lost.

### Issue B: saveInventoryItem has no logging of success (GameSync.js lines 762-818)
While it uses `maybeSingle()` correctly, there's no logging to verify in the browser console that the function is being called with the right characterId and itemName.

### Issue C: _flushInventoryToDB filters out items without stats (GameUI.js line 815)
Items that haven't been equipped yet (no stats object, or empty stats `{}`) are skipped during flush. If a player buys an item and the auto-save fires before they equip it, the item's quantity (incremented locally but never confirmed saved if the purchase save failed) could be lost. But actually `_performShopAction` calls `saveInventoryItem` directly on purchase with await...

### Issue D: The buy button click handler doesn't await (GameUI.js line 3577)
This is a minor issue but means the purchase could be interrupted.

### Issue E: saveInventoryItem update path doesn't check for errors (GameSync.js lines 803-811)
The `.update()` and `.delete()` calls don't check for errors. If they fail, the quantity change is silently lost.

### Issue F: saveInventoryItem insert path doesn't check for errors (GameSync.js line 814-816)
The `.insert()` call doesn't check for errors.

## Conclusion — Primary fixes needed:
1. **GameSync.js**: Add comprehensive error logging and try/catch to `saveInventoryItem` and `updateInventoryItemStats`
2. **GameSync.js**: Add `console.log` to `saveInventoryItem` for debugging
3. **GameUI.js**: Fix the fire-and-forget buy button click handler to await
4. **GameUI.js**: Fix `_flushInventoryToDB` to save ALL items (including those without stats)
5. **GameSync.js**: Add RLS policy comment
