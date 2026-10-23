# Trip persistence boundary — devpack18

`TripSnapshotV2` is the current durable Trip format. The editor still owns live React state, while explicit Save serializes only persistence-safe data and uses optimistic revision matching.

## Snapshot compatibility

- New saves emit `schemaVersion: 2`.
- `mapSettings.connectionWidthPx` is an integer `1..24`; the implicit/default value is `3`.
- Legacy `TripSnapshotV1` remains readable. Its `SMALL / MEDIUM / LARGE / XLARGE` path-size values migrate at load time to `3 / 5 / 7 / 9` px.
- Loading a legacy snapshot never rewrites the server record by itself; the migrated v2 shape is persisted on the next successful explicit Save.

## Durable data

- Trip metadata: `tripId`, `name`, canonical `mapProvider`
- user-owned schedule / connection / color state
- per-Trip presentation settings such as numeric path width and Timeline view
- Google Place ID (provider identity)
- TripPlace fields only when provenance is USER (or legacy non-provider data)

## Never written into TripSnapshot

- route geometry / provider route candidates / route summary / distance / duration
- browser History stacks
- Google/NAVER provider response payloads
- provider-derived TripPlace name/address/position unless a separate provider-cache policy explicitly allows them
- Trip authorization ACL (server-owned metadata)
- Capture Mode state
- telemetry / Measurement Run data

Google provider-derived place fields are re-resolved at runtime from the stored Place ID. Google position may be satisfied by the authenticated, Trip-scoped server provider cache when its operator TTL is enabled and fresh. A failed provider refresh does not prevent the Trip snapshot itself from opening.

## Revision semantics

`save(tripId, snapshot, expectedRevision)` is compare-and-swap. A stale revision returns conflict and never silently overwrites another save. Authentication and Trip ACL are enforced by the server before load/save.

## Backend and migrations

The backend uses Node's built-in `node:sqlite` and stores the database under `.tripplanner/tripplanner.sqlite` by default. `schema_migrations` is authoritative and migrations are applied sequentially. devpack18's database schema version is `4`; v4 adds operational telemetry and Measurement Runs. Provider-cache rows remain separate from TripSnapshot data and are governed by developer ceilings plus Management operator TTL settings.
