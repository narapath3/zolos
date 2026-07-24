# Mobile Admin Responsive Design

## Objective

Make the existing Admin Dashboard fit and feel intentional on phone-sized screens without changing game state, network behavior, database operations, or the desktop workflow.

## Confirmed Direction

Use a responsive full-screen Admin Dashboard on mobile. Preserve the desktop table layout, while rendering player and item records as stacked cards on narrow screens.

## Layout

- At viewport widths up to 720px, the Admin Dashboard fills the visual viewport.
- The mobile panel accounts for display cutouts and bottom safe areas.
- The header and tab navigation remain visible while the content scrolls.
- Tabs scroll horizontally when needed and expose a minimum 44px touch target.
- Content padding reduces on mobile so controls do not feel cramped.
- Desktop keeps the centered 900px panel and table-based lists.

## Players

- Desktop continues to use the existing six-column table.
- Mobile renders one card per player.
- Each card shows the player name first, then level, gold, kills, and play time in a compact two-column statistics grid.
- Edit, Give, Reset, and Delete actions use a two-by-two button grid with clear color hierarchy and touch-friendly sizing.
- Existing action handlers and confirmation behavior remain unchanged.

## Items

- Search and rarity filters stack vertically on mobile.
- Desktop continues to use the existing item table.
- Mobile renders one item card with icon, name, rarity, type, price, and description.
- Long descriptions wrap safely instead of forcing horizontal overflow.

## Announcements and Edit Dialog

- The integrated announcement panel removes oversized padding on mobile.
- Its type and duration controls stack vertically on narrow screens.
- Announcement actions remain large enough to tap.
- The player edit dialog fits within the visual viewport, scrolls internally, and accounts for the on-screen keyboard.
- Dialog actions stack when horizontal space is limited.

## Accessibility and Interaction

- Interactive controls have a minimum height of 44px on mobile.
- The close button receives an accessible label.
- Admin tabs expose selected state through `aria-selected`.
- Hover styling remains a desktop enhancement and is not required for understanding on touch devices.
- Horizontal page scrolling must not occur at 320px viewport width.

## Technical Boundaries

- Put responsive presentation rules in a dedicated stylesheet.
- Keep data loading, Supabase calls, action handlers, and game logic unchanged.
- Add stable semantic class names to generated Admin markup instead of duplicating responsive decisions in JavaScript.
- Use a single mobile breakpoint of 720px unless validation proves an additional breakpoint is necessary.

## Validation

- Automated structural tests verify responsive class hooks and stylesheet rules.
- Existing project tests and production build must pass.
- Visual checks cover 320x568, 390x844, and desktop 1280x800.
- Verify Players, Items, Announcements, and Edit Player views.

