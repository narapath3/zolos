# Cross-Platform RO Typography Design

## Objective

Give the entire game a cohesive Ragnarok-inspired type system while ensuring
that Thai, English, numbers, and player-generated text stay inside every HUD,
panel, modal, button, card, and list row on iPhone, iPad, Android, and desktop.

## Selected Direction

Use a three-role type system:

- `Chakra Petch` for headings, tabs, buttons, compact labels, and important
  values. It provides the angular RO-style identity while supporting Thai.
- `Kanit` for paragraphs, descriptions, forms, chat, and dense metadata. It is
  the readable face and the first fallback when display text becomes dense.
- `Press Start 2P` only for short Latin/numeric effects such as damage numbers.
  It must never be used for Thai sentences or constrained navigation labels.

The rejected alternatives are a pixel font everywhere, which creates clipping
and poor Thai readability, and system fonts everywhere, which removes the
game's visual identity.

## Typography System

Define semantic tokens for display, UI, body, retro effects, minimum readable
sizes, line heights, and fluid scaling. Existing `--font-main`,
`--font-pixel`, `--font-ui`, and `--font-retro` remain compatible but map to
the semantic roles.

Global controls inherit the UI font. Headings and short labels use the display
font. Paragraphs, inputs, chat, descriptions, and generated content use the
body font. Text rendering includes platform-safe font smoothing and prevents
iOS form controls from zooming by keeping editable controls at 16px or larger
on touch devices.

## Overflow Contract

Every flex/grid text child receives `min-width: 0`. Containers use logical
maximum widths based on `100dvw` with a `100vw` fallback and account for left
and right safe-area insets.

Text follows one of three explicit behaviors:

- compact labels: one line with ellipsis;
- prose and generated content: wrap with `overflow-wrap: anywhere`;
- critical values: remain on one line while adjacent labels shrink or wrap.

Thai text is not forced through aggressive `word-break: break-all`. Buttons
may grow vertically instead of clipping labels. No important content is hidden
solely to make a fixed-height component fit.

## Cross-Platform Layout

Apply safe-area padding to the game viewport, top HUD, bottom HUD, panels, and
fixed overlays. Use dynamic viewport units with fallbacks for Safari browser
chrome and standalone PWA mode.

Responsive type and spacing are driven by component width and viewport width:

- 320–374px: compact type scale, two-line button labels allowed where needed;
- 375–430px: standard mobile scale;
- iPad/tablet: comfortable intermediate scale without desktop-sized gaps;
- desktop: existing hierarchy retained with slightly stronger RO headings.

Landscape and notched devices retain usable left/right insets. Android and
desktop receive the same overflow protections without WebKit-only dependence.

## Scope

The change covers the global document, authentication screens, HUDs, panels,
modals, lists, cards, inventory/shop grids, chat, announcements, profiles,
admin UI, and dynamically injected component styles. Inline fixed-font rules
that conflict with the semantic system are replaced only where they cause
inconsistent typography or overflow.

No game logic, networking, persistence, or data contract changes are included.

## Testing and Acceptance

- Static tests assert semantic font tokens, safe viewport rules, flex/grid
  shrink protection, wrapping utilities, and iOS input sizing.
- Existing automated tests and the production build pass.
- Browser checks cover 320×568, 375×812, 390×844, 430×932, iPad portrait and
  landscape, Android-sized mobile, and desktop.
- Representative long Thai text, English text, numbers, and player names do
  not create horizontal page overflow.
- Buttons remain tappable, panels remain scrollable, and important values are
  visible without reducing body text below the defined readable minimum.
