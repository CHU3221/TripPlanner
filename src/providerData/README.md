# Provider data / cache policy boundary

This module is a foundation for a future production backend. It does not create a DB, request meter, SQLite quota guard, or Vite middleware.

## Compliance model

There are two layers:

1. `legalPolicyCatalog.ts` — developer-owned, hard-coded legal/policy ceiling.
2. server operator override JSON — can only reduce/disable what the catalog permits.

An operator cannot use config to increase a finite legal TTL, turn a forbidden field on, make a finite TTL permanent, or enable cross-Trip reuse unless the compiled catalog already marks that policy `ALLOWED`.

Unknown keys and unreviewed permissions fail closed.

## Storage model

Provider cache is physically shared and keyed by provider/policy/subject. Trip access is represented separately (`tripId -> cacheId`).

`providerCacheLookupScope()` chooses:

- `TRIP` by default.
- `GLOBAL` only when the operator has opted in AND the hard-coded legal policy explicitly allows cross-Trip reuse.

This avoids duplicating provider payloads per Trip while preserving a compliance gate around discovery/reuse.

## Time model

- Persist `fetchedAtEpochMs` from authoritative server time.
- Never renew `fetchedAtEpochMs` merely because a cache entry was read or reused.
- Validate current policy on every read.
- Cleanup polling only removes stale rows; it does not define freshness.

## Guarded write boundary (not connected)

`ProviderCacheWriteRepository` and `saveProviderResponseIfAllowed` define the only intended
write entrypoint for a future backend adapter. Current NAVER and all operator TTLs=0 never
write. The helper expects an authoritative **server** timestamp; do not pass a browser clock.
Storage adapters must enforce atomic identity/upsert/trip-link and re-check policy server-side.
There is no browser-side persistent cache, no DB, and no quota middleware in this build.


## Configuration UX status

The current guarded baseline treats missing operator policy keys as disabled. Whether production
operators can explicitly inherit developer-recommended defaults is **not frozen**; decide that when
the real backend/cache DB is implemented. Legal ceilings remain developer-owned regardless of that UX.
