# Realtime Roster Server Deployment Design

## Problem

The production client is online and can list map peers, but the roster payload
from the deployed Railway map server does not include `mapId` or peer `ping`.
The repository server already contains these fields and emits
`players_global`, which indicates deployment skew between the frontend and map
server.

## Design

The map server will expose a non-sensitive deployment version in its existing
health response. The value will come from `RAILWAY_GIT_COMMIT_SHA` when Railway
provides it and fall back to the package version locally. This makes the active
server revision observable without exposing credentials or environment data.

The current authoritative roster behavior remains:

- `mapId` comes from the server-owned presence record.
- Server measures each connected client's RTT using `srv_ping`/`srv_pong`.
- `players_global` broadcasts the serialized roster after ping replies have
  time to arrive.
- Every client receives every online player's city, level, and measured ping.
- The compatible `players_update` fallback remains available for older or
  temporarily degraded servers.

The Railway workflow will continue deploying only `server/` to the configured
map-server service. A server-side change in this delivery will trigger that
workflow on `main`.

## Failure Handling

- A player with no completed RTT measurement is serialized with `ping: null`;
  the client displays `--ms` until a later broadcast.
- Invalid map, level, device, or ping values are normalized by
  `serializeOnlinePlayer`.
- The health endpoint returns a bounded public version string and never returns
  tokens, URLs, or other environment values.

## Verification

- Unit tests validate health payload version normalization.
- Existing roster tests continue validating trusted metadata.
- Full test suite and production frontend build pass.
- After push, the Railway health endpoint must report the new revision and two
  clients must receive `players_global` with `mapId` and peer `ping`.
