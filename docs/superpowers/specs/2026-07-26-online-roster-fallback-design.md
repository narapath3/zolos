# Online Roster Fallback Design

## Problem

The Online Players panel becomes empty while Socket.io is connected when the
deployed map server does not emit the newer `players_global` event. The client
currently suppresses the existing `players_update` callback whenever the socket
is connected, so the panel receives neither roster.

## Design

Treat `players_update` as the compatible baseline roster and always forward it
to `GameUI.updateOnlinePlayers`. Keep `players_global` as the preferred
cross-map roster. On servers that support both events, `players_global` is
emitted after `players_update` and replaces the map-scoped baseline. On older
servers, the map-scoped roster remains visible instead of showing every player
as offline.

No socket protocol or server behavior changes are required for this fallback.

## Verification

- Add a regression test proving the presence callback updates the UI even while
  Socket.io is connected.
- Preserve the existing global-roster listener.
- Run the full test suite and production build.
