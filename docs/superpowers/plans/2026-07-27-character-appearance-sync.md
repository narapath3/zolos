# Character Appearance Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every remote character reproduce the colors and equipment rendered on the owner's client.

**Architecture:** `CharacterManager.getAppearance()` remains the network boundary. It will read canonical color values from the meshes used by the local renderer, with stored-state fallbacks for incomplete harnesses or unbuilt models. `setBodyColor()` will update explicit torso and arm references so unrelated scene children and previous material colors cannot affect the result.

**Tech Stack:** JavaScript ES modules, Three.js 0.185, Node.js test runner, Vite 8.

## Global Constraints

- The owner's rendered character is the expected result.
- Partial payloads keep omitted remote fields; explicit `null` unequips the matching item.
- Keep the current position payload and database formats.
- No migration or server protocol version.
- Do not redesign models, palettes, lighting, equipment art, or storage.

---

### Task 1: Canonical Rendered Color Snapshot

**Files:**
- Modify: `src/engine/CharacterManager.js`
- Create: `test/characterAppearanceSync.test.js`

**Interfaces:**
- Consumes: `CharacterManager.getAppearance()` and the existing mesh references `body`, `leftArm`, `rightArm`, `hair`, `leftLeg`, and `rightLeg`.
- Produces: `CharacterManager._getRenderedColor(mesh, fallback): number` and a canonical appearance snapshot.

- [ ] **Step 1: Write the failing snapshot test**

Create a prototype-based character harness with stored colors that differ from its rendered material colors:

```js
test('getAppearance broadcasts the colors rendered on the owner model', () => {
  const source = createAppearanceHarness({
    stored: { body: 0x336633, hair: 0x111111, pants: 0x6b4a2a },
    rendered: { body: 0x050505, hair: 0x332266, pants: 0x101060 },
  });

  const snapshot = source.getAppearance();

  assert.equal(snapshot.bodyColor, 0x050505);
  assert.equal(snapshot.hairColor, 0x332266);
  assert.equal(snapshot.pantsColor, 0x101060);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test test/characterAppearanceSync.test.js`

Expected: FAIL because `getAppearance()` returns the stored colors.

- [ ] **Step 3: Implement rendered color reads**

Add this helper and use it for `bodyColor`, `hairColor`, and `pantsColor`:

```js
_getRenderedColor(mesh, fallback) {
    const value = mesh?.material?.color?.getHex?.();
    return Number.isFinite(value) ? value : fallback;
}
```

Read the torso, hair, and left-leg material colors. Keep stored values as fallbacks.

- [ ] **Step 4: Confirm GREEN**

Run: `node --test test/characterAppearanceSync.test.js`

Expected: PASS.

### Task 2: Deterministic Body Recoloring and Snapshot Round Trip

**Files:**
- Modify: `src/engine/CharacterManager.js`
- Modify: `test/characterAppearanceSync.test.js`

**Interfaces:**
- Consumes: the canonical snapshot from Task 1.
- Produces: direct recoloring of `body`, `leftArm`, and `rightArm`; deterministic `applyAppearance(snapshot)`.

- [ ] **Step 1: Add failing tests**

Add one test that sets unrelated direct mesh children to the old body color and verifies they stay unchanged. Add a second test that applies the owner's snapshot to a remote harness and compares all appearance fields:

```js
test('setBodyColor recolors only torso and arms', () => {
  const character = createBodyColorHarness();
  character.setBodyColor(0x050505);
  assert.equal(character.body.material.color.getHex(), 0x050505);
  assert.equal(character.leftArm.material.color.getHex(), 0x050505);
  assert.equal(character.rightArm.material.color.getHex(), 0x050505);
  assert.equal(character.unrelated.material.color.getHex(), 0x4060c0);
});

test('applying an owner snapshot reproduces its appearance state', () => {
  const snapshot = source.getAppearance();
  remote.applyAppearance(snapshot);
  assert.deepEqual(remote.getAppearance(), snapshot);
});
```

- [ ] **Step 2: Run the tests and confirm RED**

Run: `node --test test/characterAppearanceSync.test.js`

Expected: FAIL because `setBodyColor()` scans direct scene children by color and recolors the unrelated mesh.

- [ ] **Step 3: Implement direct body-part recoloring**

Store the torso mesh as `this.body` when the model is built. Replace the color-matching traversal with:

```js
for (const mesh of [this.body, this.leftArm, this.rightArm]) {
    mesh?.material?.color?.setHex(colorVal);
}
```

Keep the stored `bodyColor` update and invalid-value fallback.

- [ ] **Step 4: Run focused and existing persistence tests**

Run: `node --test test/characterAppearanceSync.test.js test/cards/cardPersistence.test.js`

Expected: all tests PASS.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/engine/CharacterManager.js test/characterAppearanceSync.test.js
git commit -m "fix: sync rendered character appearance"
```

### Task 3: Full Verification

**Files:**
- Verify: `src/engine/CharacterManager.js`
- Verify: `test/characterAppearanceSync.test.js`

**Interfaces:**
- Consumes: completed character appearance implementation.
- Produces: test and build evidence.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: exit code 0 with no failed tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite finish with exit code 0 and no new warning caused by the change.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check HEAD^ -- src/engine/CharacterManager.js test/characterAppearanceSync.test.js`

Expected: no whitespace errors.
