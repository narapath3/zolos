# Online Player Metadata Design

## Objective

Make every Online Players row clearly show the player’s current city, level,
and measured network latency while preserving the existing Global/Friends
tabs and mobile layout.

## Approved Presentation

Each online row contains:

- player status, device icon, and player name on the primary line;
- Thai city name, `LV <number>`, and `<number>ms` on the metadata line;
- a green ping badge below 80ms, amber from 80–159ms, and red from 160ms;
- `--ms` while the first latency measurement is unavailable.

An offline friend displays `เมืองล่าสุด · LV <number> · Offline` and never
shows a stale ping value. Missing map data displays `ไม่ทราบเมือง`.

The metadata wraps safely on narrow screens. Player rows remain at least 44px
high, have no horizontal overflow, and retain their existing profile action.
Presentation styles live in the shared stylesheet rather than inline HTML.

## Data Flow

1. The authenticated client joins Socket.IO with its trusted character level
   and current `mapId`.
2. Map changes call `update_presence`; the server normalizes and stores the
   new `mapId`.
3. The server measures each connection using `srv_ping`/`srv_pong`, smooths
   the round-trip value, and stores it on that player’s presence record.
4. `players_all` broadcasts `userId`, `username`, `level`, `mapId`, `device`,
   and `ping` for every online player.
5. `GameUI` converts `mapId` through the existing Thai map-name dictionary
   and renders the same normalized metadata model in Global and Friends.

The client may use its locally measured ping only as a temporary fallback for
its own row. It must not fabricate or estimate another player’s ping.

## Components

### Server roster

The server remains authoritative for the cross-map roster. Every periodic and
event-driven `players_all` payload uses one shared serializer so fields cannot
drift between broadcasts.

### Client normalization

A small pure helper converts a roster record into:

```js
{
  cityLabel: 'พรอนเทรา',
  levelLabel: 'LV 42',
  pingLabel: '58ms',
  pingClass: 'ping-good',
  isOffline: false
}
```

Offline records always produce `pingLabel: 'Offline'`. Invalid levels are
clamped to the same trusted range already used by presence validation.

### Row rendering

`GameUI` renders text through escaped values and reusable CSS classes:

- `.player-row-main`
- `.player-row-meta`
- `.player-city-tag`
- `.player-level-tag`
- `.player-ping`

No city, level, username, or latency value is inserted as unescaped HTML.

## Failure Handling

- Socket disconnected: the existing offline state remains; online rows are
  removed by the server roster.
- Ping unavailable: show `--ms`, not `0ms`.
- Unknown `mapId`: show `ไม่ทราบเมือง`.
- Missing or invalid level: show `LV 1`.
- Offline friend: hide live ping color and show `Offline`.

## Testing and Acceptance

- A serializer test proves every online roster payload includes level, map,
  device, and ping.
- UI normalization tests cover good/medium/bad/unknown ping boundaries.
- UI tests cover known and unknown maps, missing level, and offline friends.
- A rendering safety test proves user-controlled names/map IDs are escaped.
- Responsive checks cover 320px and 390px widths without horizontal overflow.
- Existing Global/Friends filtering and profile-click behavior remain intact.
- The complete automated suite and production build pass before deployment.
