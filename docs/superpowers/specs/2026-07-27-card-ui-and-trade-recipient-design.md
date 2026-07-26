# Card UI and Trade Recipient Design

## Goal

Make the card collection readable inside narrow modals on every supported
device and make card transfers resolve the player selected by name without
mistaking an account ID for a character UID.

## Card UI

The card collection responds to its own rendered width, not the browser
viewport. `cards.css` establishes `.card-album` as an inline-size container.
Header, filters, detail facts, and grid density use container queries. Narrow
albums remain single-column with two filter columns; wider albums may use the
desktop arrangements.

Primary card titles use the readable display face and must never break inside
an English word. Supporting copy uses the body face and may wrap normally.

## Trade Recipient Resolution

Autocomplete results retain both trusted identities:

- `characterId`: database and mailbox routing identity.
- `userId`: account/socket routing identity.

Database search enriches an online roster match instead of dropping the
database row as a duplicate. Selecting a suggestion stores the complete
resolved target. Sending by a selected name uses that target directly.
Free-hand name search uses the matched database row directly. Only a raw UID
input calls `resolveCharacterByUid`.

No code may derive a character UID from the first eight characters of
`userId`.

## Error Handling

An unresolved name reports a name-specific error. An unresolved raw UID
reports a UID-specific error. Self-transfer protection compares the complete
character ID when available and otherwise compares the displayed UID.

## Verification

- Regression tests prove narrow card containers do not activate desktop
  layouts and titles cannot split inside words.
- Unit tests prove online matches are enriched with `characterId`, selected
  targets bypass UID re-resolution, and raw UIDs still use the UID resolver.
- Full test suite and production build pass.
- Browser QA covers narrow phone, tablet, and desktop modal widths without
  horizontal overflow or broken title words.
