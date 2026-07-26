# Card UI and Trade Recipient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix narrow Card Album typography/layout and make name-selected card transfers resolve the correct character.

**Architecture:** Move card component breakpoints from viewport media queries to inline-size container queries. Extract pure recipient helpers from `GameUI` so online/DB result merging and target selection are deterministic and testable, while existing network functions remain responsible for database access.

**Tech Stack:** JavaScript ES modules, CSS container queries, Node test runner, Vite.

## Global Constraints

- Support iPhone, iPad, Android, and PC.
- Never derive a character UID from an account `userId`.
- Preserve raw UID entry and online/offline delivery behavior.
- Use test-first changes.

---

### Task 1: Card container responsiveness

**Files:**
- Modify: `src/styles/cards.css`
- Modify: `test/crossPlatformTypography.test.js`

**Interfaces:**
- Consumes: `.card-album` markup from `src/ui/CardAlbum.js`.
- Produces: container-scoped breakpoints for card layouts.

- [ ] **Step 1: Write the failing CSS regression test**

Assert that `.card-album` declares `container-type: inline-size`, card headings
declare `overflow-wrap: normal` and `word-break: keep-all`, and the 560px card
layout uses `@container` rather than viewport-only `@media`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/crossPlatformTypography.test.js`
Expected: FAIL because the container rules do not exist.

- [ ] **Step 3: Implement the minimal card CSS**

Add the container context, protect title words, and convert the card component
width breakpoints at 370px, 560px, and 720px to container queries.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/crossPlatformTypography.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix: make card album container responsive`

### Task 2: Stable trade recipient identity

**Files:**
- Create: `src/ui/CardTradeRecipient.js`
- Create: `test/cardTradeRecipient.test.js`
- Modify: `src/ui/GameUI.js`

**Interfaces:**
- Produces: `mergeTradeRecipients(onlinePlayers, dbPlayers, selfCharacterId)`.
- Produces: `resolveTradeRecipientInput({ rawInput, selectedTarget, searchByName, resolveByUid })`.
- Consumes result `{ characterId, userId, username, level, online }`.

- [ ] **Step 1: Write failing recipient unit tests**

Cover database enrichment of an online name match, selected-target resolution
without calling the UID resolver, exact free-hand name matching, and raw UID
resolution.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/cardTradeRecipient.test.js`
Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement pure recipient helpers**

Merge matches case-insensitively by username, retain `characterId` and
`userId`, and return a typed failure reason (`missing`, `name_not_found`, or
`uid_not_found`) when unresolved.

- [ ] **Step 4: Run helper tests**

Run: `node --test test/cardTradeRecipient.test.js`
Expected: PASS.

- [ ] **Step 5: Integrate helpers into GameUI**

Store `_cardTradeResolvedTarget` after suggestion selection. Use the helper in
`_sendCardTrade`; call `resolveCharacterByUid` only for raw UID input.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test test/cardTradeRecipient.test.js test/crossPlatformTypography.test.js`
Expected: PASS.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

Commit message: `fix: resolve card trade recipients by character`

### Task 3: Visual and production verification

**Files:**
- No production files unless verification exposes a reproducible defect.

**Interfaces:**
- Consumes: production build from Tasks 1–2.
- Produces: verified responsive behavior and deployable main branch.

- [ ] **Step 1: Build production assets**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 2: Browser QA**

Inspect Card Album at phone, tablet, and desktop viewport sizes. Confirm
`Card Album` stays intact, filters remain readable, and neither document nor
modal has horizontal overflow.

- [ ] **Step 3: Review and integrate**

Review the diff, merge the feature branch into `main`, rerun tests/build, and
push `origin/main`.
