# E1 — Transit assistance contract (interface only)

## Purpose

Transit assistance is **Application/Core-owned**, not a feature of `MapProvider`.
A NAVER map can display a journey obtained from a different transit provider,
subject to the provider's display/use terms. Do not assume cross-provider map
rendering is permitted until the specific provider terms have been reviewed.

The contract separates:

- `TransitJourneySearchProvider`: point-to-point multimodal journey candidates (future ODsay or equivalent).
- `TransitStopInfoProvider`: station/stop search, optional arrivals and timetables (future TAGO or equivalent).
- `TransitAssistProvider`: an optional bundle of the above capabilities.

## Boundaries / invariants

1. All responses are **transient provider candidates**, not canonical Trip data.
2. `TransitStopRef` is an opaque provider-specific reference; it is **not** `TripPlace.id` and must not be saved as a Map Provider Place ID.
3. The user must confirm an itinerary before any user-owned `Segment` or `TripPlace` is created or changed.
4. Current `Segment` modes are `WALK | SUBWAY | BUS | CAR`. `TRAIN` in a transit candidate does not automatically become `MajorTransport` or a persisted `Segment`.
5. The application owns candidate-to-domain mapping, materialization, Undo/Redo, and user consent. This E1 contract deliberately does **not** define such mapping yet.
6. External geometry, stop/line details, estimated times, and service responses must not be copied into history snapshots or persistent `ConnectionPlan` without a separate field-specific legal-policy review.
7. No cache implementation, request meter, SQLite quota guard, network proxy, or API credentials are added by E1.
8. `MapProvider`, `RouteProvider` (CAR Directions 5), `ConnectionPlan`, Timeline, and MajorTransport are unchanged.
9. All times supplied to `TransitJourneyRequest.time` use ISO 8601 with an explicit offset; providers handle local service-day conventions in their own adapters.

## Future E2/E3 (not implemented)

- Verify real TAGO/ODsay endpoint capabilities, data use/display restrictions, caching and attribution, pricing, and API credentials.
- Implement a server-side proxy for any API requiring secrets; a Vite dev proxy alone is not a production backend.
- Implement provider-specific adapters and normalizers, including partial/missing coordinates and error handling.
- Define user-confirmed transit plan mapping and Undo/Redo as a separate Application-level operation.
- Decide whether detailed train/intercity travel belongs in MajorTransport rather than ordinary Connection.

## Validation

`tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler src/transit/contract.ts`

This validates the isolated E1 types only, **not** the entire React app.
