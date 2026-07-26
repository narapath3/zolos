# Cross-Platform RO Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a cohesive RO-inspired type system across the game and prevent text or fixed UI from overflowing on iPhone, iPad, Android, and desktop.

**Architecture:** A semantic typography and viewport foundation in the shared stylesheet governs all static and dynamic UI. Focused component overrides remove the remaining fixed-size and no-wrap conflicts, while source-contract tests protect the global cross-platform rules.

**Tech Stack:** CSS custom properties, responsive CSS, WebKit safe-area APIs, JavaScript source-contract tests, Node.js test runner, Vite.

## Global Constraints

- Chakra Petch is the display face; Kanit is the body/UI face.
- Press Start 2P is limited to short Latin/numeric effects.
- Editable controls are at least 16px on touch devices.
- Flex/grid text children use `min-width: 0`.
- Prose wraps with `overflow-wrap: anywhere`; compact labels use ellipsis.
- Fixed UI accounts for all four safe-area insets.
- Verify 320×568, 375×812, 390×844, 430×932, iPad portrait/landscape, Android, and desktop.
- Do not change game logic, networking, persistence, or data contracts.

---

## File Structure

- Create `test/crossPlatformTypography.test.js`: static typography, safe-area,
  and overflow contracts.
- Modify `src/styles/index.css`: global semantic type scale, viewport safety,
  reusable overflow behavior, and HUD/panel responsive rules.
- Modify `src/styles/login-new.css`: authentication typography and mobile
  overflow alignment.
- Modify `src/styles/cards.css`: card labels and metadata shrink/wrap behavior.
- Modify `src/styles/admin.css`: align admin typography with the global system.
- Modify focused dynamic styles in `src/ui/GameUI.js`,
  `src/ui/PlayerProfileModal.js`, `src/ui/GlobalAnnouncements.js`, and
  `src/ui/AnnouncementSystem.js`.

### Task 1: Establish the semantic typography and viewport contract

**Files:**
- Create: `test/crossPlatformTypography.test.js`
- Modify: `src/styles/index.css:1-75`

**Interfaces:**
- Produces CSS tokens `--font-display`, `--font-body`, `--font-effect`,
  `--text-xs`, `--text-sm`, `--text-md`, `--leading-ui`, and
  `--screen-inline-safe`.
- Existing aliases consume those tokens through `--font-main`,
  `--font-pixel`, `--font-ui`, and `--font-retro`.

- [ ] **Step 1: Write the failing source-contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

test('semantic RO typography tokens preserve readable Thai body copy', () => {
  assert.match(css, /--font-display:\s*'Chakra Petch'/);
  assert.match(css, /--font-body:\s*'Kanit'/);
  assert.match(css, /--font-effect:\s*'Press Start 2P'/);
  assert.match(css, /--font-ui:\s*var\(--font-body\)/);
});

test('global viewport and text rules account for safe areas and shrinkable text', () => {
  assert.match(css, /--screen-inline-safe:/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /env\(safe-area-inset-left/);
  assert.match(css, /env\(safe-area-inset-right/);
});

test('touch inputs stay large enough to prevent Safari zoom', () => {
  assert.match(css, /@media\s*\(pointer:\s*coarse\)[\s\S]*font-size:\s*16px/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/crossPlatformTypography.test.js`

Expected: FAIL because the semantic tokens and global contracts are absent.

- [ ] **Step 3: Add the minimal semantic foundation**

Add the semantic tokens and map the legacy aliases:

```css
:root {
  --font-display: 'Chakra Petch', 'Kanit', system-ui, sans-serif;
  --font-body: 'Kanit', 'Chakra Petch', system-ui, sans-serif;
  --font-effect: 'Press Start 2P', ui-monospace, monospace;
  --font-main: var(--font-display);
  --font-pixel: var(--font-display);
  --font-ui: var(--font-body);
  --font-retro: var(--font-effect);
  --text-xs: clamp(0.625rem, 0.58rem + 0.2vw, 0.75rem);
  --text-sm: clamp(0.75rem, 0.7rem + 0.2vw, 0.875rem);
  --text-md: clamp(0.875rem, 0.82rem + 0.25vw, 1rem);
  --leading-ui: 1.45;
  --screen-inline-safe:
    max(8px, env(safe-area-inset-left, 0px))
    max(8px, env(safe-area-inset-right, 0px));
}

html { width: 100%; min-height: 100%; overflow: hidden; -webkit-text-size-adjust: 100%; }
body { line-height: var(--leading-ui); }
button, input, select, textarea { font: inherit; max-width: 100%; }
.panel, .modal, [role="dialog"] { max-inline-size: calc(100dvw - 16px); }
.panel-body, .modal-body, .ui-copy { overflow-wrap: anywhere; }
.panel-header, .player-row, .lb-row, .mail-row { min-width: 0; }

@media (pointer: coarse) {
  input, select, textarea { font-size: 16px; }
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test test/crossPlatformTypography.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/crossPlatformTypography.test.js src/styles/index.css
git commit -m "feat: establish cross-platform RO typography"
```

### Task 2: Make static screens and components overflow-safe

**Files:**
- Modify: `test/crossPlatformTypography.test.js`
- Modify: `src/styles/index.css`
- Modify: `src/styles/login-new.css`
- Modify: `src/styles/cards.css`
- Modify: `src/styles/admin.css`

**Interfaces:**
- Consumes the tokens and overflow contract from Task 1.
- Produces consistent `.ui-title`, `.ui-copy`, `.ui-ellipsis`, and
  `.ui-critical-value` behaviors for every static screen.

- [ ] **Step 1: Extend the test with stylesheet coverage**

```js
const loginCss = readFileSync(new URL('../src/styles/login-new.css', import.meta.url), 'utf8');
const cardsCss = readFileSync(new URL('../src/styles/cards.css', import.meta.url), 'utf8');
const adminCss = readFileSync(new URL('../src/styles/admin.css', import.meta.url), 'utf8');

test('all major stylesheets consume semantic fonts and safe wrapping', () => {
  assert.match(loginCss, /var\(--font-(?:display|body|main|ui)\)/);
  assert.match(cardsCss, /min-width:\s*0/);
  assert.match(cardsCss, /text-overflow:\s*ellipsis/);
  assert.match(adminCss, /var\(--font-(?:display|body|main|ui)\)/);
  assert.match(adminCss, /overflow-wrap:\s*anywhere/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/crossPlatformTypography.test.js`

Expected: FAIL on the admin semantic font and incomplete card shrink contract.

- [ ] **Step 3: Apply component-specific typography**

Use the display font for headings/tabs/buttons, the body font for paragraphs,
forms, chat, and descriptions. Add `min-width: 0` to text-bearing flex/grid
children. Replace unsafe fixed heights with `min-height`, add ellipsis only to
compact labels, and allow prose/buttons to wrap:

```css
.ui-title, h1, h2, h3, .panel-title, .panel-tab, .hud-btn {
  font-family: var(--font-display);
}
.ui-copy, p, input, textarea, select, .item-description, .chat-message {
  font-family: var(--font-body);
}
.ui-ellipsis {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-copy, .item-description, .mail-body, .announcement-body {
  white-space: normal;
  overflow-wrap: anywhere;
}
button, .hud-btn, .panel-tab {
  min-height: 44px;
  height: auto;
}
```

- [ ] **Step 4: Add breakpoint and safe-area overrides**

At 320px, 375px, 430px, tablet, and desktop ranges, use `clamp()` for type and
spacing. Fixed overlays use `max(base, env(safe-area-inset-*)))`; panel widths
use `min(design-width, calc(100dvw - left-safe - right-safe - 16px))`.

- [ ] **Step 5: Run focused and complete tests**

Run: `node --test test/crossPlatformTypography.test.js && npm.cmd test`

Expected: all tests PASS with zero failures.

- [ ] **Step 6: Commit**

```bash
git add test/crossPlatformTypography.test.js src/styles/index.css src/styles/login-new.css src/styles/cards.css src/styles/admin.css
git commit -m "fix: prevent cross-platform UI text overflow"
```

### Task 3: Align dynamically injected UI and verify real layouts

**Files:**
- Modify: `test/crossPlatformTypography.test.js`
- Modify: `src/ui/GameUI.js`
- Modify: `src/ui/PlayerProfileModal.js`
- Modify: `src/ui/GlobalAnnouncements.js`
- Modify: `src/ui/AnnouncementSystem.js`

**Interfaces:**
- Consumes semantic CSS variables and shared wrapping utilities.
- Produces dynamic modals/announcements with no hard-coded incompatible font
  stacks or non-wrapping Thai prose.

- [ ] **Step 1: Add failing dynamic-source tests**

```js
const dynamicSources = [
  '../src/ui/GameUI.js',
  '../src/ui/PlayerProfileModal.js',
  '../src/ui/GlobalAnnouncements.js',
  '../src/ui/AnnouncementSystem.js',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('dynamic UI uses semantic fonts and safe generated-text wrapping', () => {
  assert.match(dynamicSources, /var\(--font-display|var\(--font-body/);
  assert.match(dynamicSources, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(dynamicSources, /font-family:\s*'Press Start 2P'[^;]*;[\s\S]{0,120}white-space:\s*nowrap/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test test/crossPlatformTypography.test.js`

Expected: FAIL because injected styles still contain isolated font stacks and
do not share the wrapping contract.

- [ ] **Step 3: Replace conflicting dynamic typography**

Map headings to `var(--font-display)`, prose/forms to `var(--font-body)`, keep
retro only on short effects, and add `min-width:0`, `overflow-wrap:anywhere`,
or ellipsis according to each component's text role. Preserve all JavaScript
behavior and generated content escaping.

- [ ] **Step 4: Run automated verification**

Run:
`node --test test/crossPlatformTypography.test.js && npm.cmd test && npm.cmd run build`

Expected: all tests PASS and Vite exits 0.

- [ ] **Step 5: Run responsive browser verification**

Run: `npm.cmd run dev -- --host 127.0.0.1`

Verify representative login, HUD, Online Players, inventory, cards, profile,
shop, chat, announcement, and admin states at 320×568, 375×812, 390×844,
430×932, 768×1024, 1024×768, and 1440×900. At each size assert:

```js
({
  documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  bodyOverflow: document.body.scrollWidth > document.body.clientWidth,
})
```

Both values must be `false`; screenshots must show readable Thai hierarchy,
no clipped button labels, and preserved tap targets.

- [ ] **Step 6: Commit**

```bash
git add test/crossPlatformTypography.test.js src/ui/GameUI.js src/ui/PlayerProfileModal.js src/ui/GlobalAnnouncements.js src/ui/AnnouncementSystem.js
git commit -m "fix: align dynamic UI typography across devices"
```

### Task 4: Final regression and production-ready handoff

**Files:**
- No new runtime files.

**Interfaces:**
- Verifies the complete typography and overflow contract.

- [ ] **Step 1: Check intended changes**

Run: `git status --short && git diff --check HEAD~3..HEAD`

Expected: only typography plan/runtime/test files plus the user's pre-existing
`.claude/settings.local.json`; no whitespace errors.

- [ ] **Step 2: Run final verification**

Run:
`node --test test/crossPlatformTypography.test.js && npm.cmd test && npm.cmd run build`

Expected: zero failed tests and build exit 0.

- [ ] **Step 3: Record handoff**

Report exact test counts, build output, checked viewports, commits, and any
remaining visual limitation that requires real-device Safari validation.
