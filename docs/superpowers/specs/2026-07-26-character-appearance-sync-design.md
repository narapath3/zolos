# Character Appearance Sync

## Problem

The local character and its remote copy can show different colors and equipment. The owner's rendered character is the expected result. Remote clients must reproduce that result from the network appearance payload.

The current payload already carries base colors and most equipment state. The fix must first identify which runtime field or update order lets the rendered local model diverge from `getAppearance()`. Changing color constants would hide the mismatch and leave other equipment stale.

## Design

`CharacterManager` remains the owner of appearance state. `getAppearance()` will return one canonical snapshot containing every field that affects the visible model. The snapshot must reflect the state used by the local renderer, including base colors, hair, pants, gender, cosmetic headgear, glasses, weapon, shield, multi-slot gear, pet, job decoration, title, refine data, and cards.

`applyAppearance()` will consume that snapshot deterministically. Applying the same snapshot twice must leave the same visible state and must not accumulate meshes. State changes that rebuild visuals will run after their dependent fields have been copied so the rebuild uses the complete incoming snapshot.

Position broadcasts will continue to carry the snapshot. No second color-only protocol will be added.

## Investigation Boundary

Before changing production code, add a regression test that constructs a source character state, obtains its snapshot, applies it to a second character, and compares the appearance state that drives rendering. The fixture will include the colors and overlapping equipment paths visible in the reported case.

The failing assertion will identify the missing field or incorrect update order. The implementation will change only that path and any helper needed to make snapshot application deterministic.

## Compatibility

Incoming payloads may omit fields because older clients and saved records can contain partial appearance data. Omitted fields keep the current remote value. Explicit `null` values unequip the matching item.

Database columns such as `body_color`, `hair_color`, `pants_color`, and `armor` keep their existing format. This change does not require a migration or a server protocol version.

## Verification

The new regression test must fail before the fix and pass after it. Existing character persistence, card, network, and server tests must remain green. A production build must complete without warnings introduced by this change.

Manual verification uses two clients in the same map:

1. Change the owner's shirt, hair, and pants colors.
2. Equip or remove headgear and body or pants gear.
3. Confirm the second client matches the owner's rendered model after the next position update.
4. Reconnect the second client and confirm the first received snapshot produces the same model.

## Out of Scope

This change does not redesign character models, color palettes, lighting, equipment art, or database storage.
