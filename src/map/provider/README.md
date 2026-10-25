# TripPlanner Map Provider Boundary

## Core rules

- Provider는 TripPlanner Domain 객체를 생성하지 않는다.
- TripPlace identity는 TripPlanner가 소유한다.
- Provider 검색 결과는 `PlaceCandidate`이며 `provider` identity를 반드시 포함한다. stable Place ID가 없어도 provider provenance는 사라지지 않는다.
- `RouteCandidate`는 기본적으로 transient이다.
- Provider는 hover/selection/popup의 **의미**를 결정하지 않는다.
- `/nav/<trip>`과 `/goo/<trip>`은 서로 Provider 데이터를 교차 사용하지 않는다.
- NAVER가 첫 reference implementation이다.
- Contract가 구현 요구를 표현하지 못하면 adapter 내부 우회보다 Contract 변경을 먼저 논의한다.

## Rendering boundary

`TripMap`은 Application-owned adapter/view이다.

TripMap responsibilities:
- `TripPlace` / Bucket / Visit 상태를 읽는다.
- Place별 badge, hovered/selected 상태를 계산한다.
- popup 내용과 편집 진입을 소유한다.
- 검색 중 선택된 `PlaceCandidate`를 transient preview marker로 표현할 수 있다.
- `MapMarkerPrimitive` / `MapPathPrimitive`를 Renderer에 전달한다.

Provider Renderer responsibilities:
- SDK를 로드한다.
- provider map instance / marker / polyline lifecycle을 소유한다.
- primitive를 provider object로 변환한다.
- marker/path의 opaque id만 interaction callback으로 되돌린다.
- provider-specific zoom scale, SDK resize 처리 등은 Renderer 내부에 가둔다.

Provider Renderer must NOT:
- BucketItem / Visit / Base / MajorTransport를 조회한다.
- popup을 생성한다.
- marker badge의 의미를 해석한다.
- Application selection state를 자체적으로 소유한다.

## Current NAVER reference implementation

`src/map/provider/naver/NaverMapRenderer.ts`
- NAVER Dynamic Map SDK 로딩과 marker/focus lifecycle을 소유한다.
- Place Pin / hover / select / focus 동작을 보존한다.
- StrictMode/HMR remount 시 provider-owned DOM과 event listener를 정리한다.
- pending SDK mount가 stale renderer를 되살리지 않도록 mount generation을 관리한다.

`src/map/provider/naver/NaverPlaceSearchProvider.ts`
- `PlaceSearchProvider.searchPlaces()`를 구현한다.
- 브라우저에서 NAVER Client Secret을 받거나 사용하지 않는다.
- application backend `/api/map/naver/places`를 호출한다.
- NAVER Local Search의 title/address/mapx/mapy를 `PlaceCandidate`로 정규화한다.
- Local Search가 안정적인 provider place id를 제공하지 않으므로 `sourceRef`는 만들지 않는다.
- `searchAddress()`는 NAVER Maps JS `geocoder` submodule의 `Service.geocode()`를 사용하고 결과를 `PlaceCandidate`로 정규화한다.
- Geocoder는 기존 browser-safe Maps Client ID와 등록 Web Service URL을 사용하며 Client Secret을 frontend에 요구하지 않는다.

`src/map/provider/naver/createNaverProvider.ts`
- renderer + natural-language place search를 bundle한다.
- 현재 capability는 `placeSearch=true`, `addressSearch=true`, `routes.CAR=true`, `routes.WALK=false`, `routes.TRANSIT=false`이다.

## Place Search credential boundary

NAVER Local Search는 Client Secret이 필요한 서버 API이므로 브라우저에서 직접 호출하지 않는다.

Development:
- Vite dev server가 `/api/map/naver/places`를 server-side proxy로 제공한다.
- `.env.local`에는 current NAVER API HUB credential pair인 `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`을 둔다.
- 이 값들은 `VITE_` prefix가 없으므로 client code에서 읽지 않는다.

Production:
- 정적 Vite bundle만으로는 Place Search를 제공할 수 없다.
- production backend/reverse proxy가 동일한 `/api/map/naver/places?query=...` boundary를 구현해야 한다.
- Client Secret은 그 server-side boundary에만 둔다.

## Composition root

`src/map/provider/composition.ts`가 Trip map provider 선택을 소유한다.
- `/nav/:tripId` -> NAVER
- `/goo/:tripId` -> GOOGLE
- root/기타 경로는 site shell이 도입되기 전까지 App에서 NAVER 개발 fallback으로 동작한다.

GOOGLE branch는 Google Adapter로 연결되어 있으며 `placeSearch=true`, `addressSearch=true`, `routes.CAR/WALK/TRANSIT=true`를 선언한다. Timeline/Domain은 provider 선택 때문에 분기하지 않으며, 실제 지역에서 경로가 없을 수 있는 것은 capability=false와 별개의 `no route` 결과로 처리한다.

## Google Place Autocomplete session boundary

When a `PlaceSearchProvider` exposes `createAutocompleteSession()`, PlacePicker uses that provider-native session after an explicit Search/Enter action.

- typing/focus alone performs no provider search request;
- Search/Enter creates/reuses one session token for that explicit suggestion request; stale responses are discarded by request generation;
- selecting one suggestion performs exactly one session-closing details fetch;
- cancelling/leaving the picker calls local `cancel()` only and performs no Place Details request;
- after selection/cancellation, another search creates a fresh session token;
- Google selection details request only `id`, `formattedAddress`, and `location`; `displayName` is deliberately not requested because it is a higher Place Details SKU and Autocomplete already supplied the selected label;
- no Geocoding request is issued after a successful Autocomplete selection.

Text Search and address search remain in the generic contract because NAVER and future fallback experiments still use them. Google PlacePicker does not invoke those methods while native Autocomplete is available.

## Current capability status

### NAVER
- Dynamic Map renderer: implemented
- Natural-language Place Search: implemented through backend boundary
- Address Search: implemented (NAVER Maps JS geocoder submodule)
- CAR Route (NAVER Directions 5): implemented
- WALK / TRANSIT: capability=false

### GOOGLE
- Map renderer: implemented
- Places Autocomplete Data session flow: implemented and preferred by PlacePicker
- Place Details selection fetch uses Essentials-only `id`, `formattedAddress`, `location`; suggestion text supplies the visible name
- Legacy Text Search + Geocoding methods remain implemented for compatibility/fallback experimentation
- CAR / WALK / TRANSIT Route: capability=true
- Capability means the adapter can issue that request type; it does not guarantee a route exists for every region/request.

## 4.5-N4-C.2-N5 architecture audit extension

The provider boundary now distinguishes **rendering primitives** from **Application path semantics**.

- `MapPathPrimitive` contains only provider-neutral visual hints: `stroke`, `direction`, `directionColor`, `emphasis`, `state`.
- `CONNECTION` / `MAJOR_TRANSPORT` are Application projection targets, not renderer/domain enums.
- Renderer callbacks still return only opaque primitive ids. `TripMap` resolves those ids to Application-owned path targets.
- `CONNECTION` may use provider route geometry when compatible runtime data exists.
- `MAJOR_TRANSPORT` is a fixed departure -> arrival directional path and never receives Directions route geometry.

Both renderers realize `direction: 'FORWARD'` with repeated provider-owned glyphs. `directionColor` is independent from the path stroke color; current defaults use white arrows plus a thin contrast outline/shadow while preserving established arrow size/spacing.

### Persistent vs runtime route boundary

Persistent canonical Connection data may contain:
- user-authored Connection name/memo
- manual segments
- Route Intent (`MANUAL` / `ROUTE_API` through the current `source` + `routeIntent` model)

Runtime-only provider data lives in `RouteRuntimeResult`:
- geometry
- duration
- distance
- provider-generated summary/name

Runtime results:
- are not history snapshots
- are not copied into Connection user metadata
- are reused only when their request key still matches current endpoint coordinates/mode
- may survive Undo/Redo in SPA memory, but become visible only when persistent Route Intent is `ROUTE_API`
- disappear on reload/new session when route caching is disabled (`ttlHours=0`); enabled cache entries may be restored without provider I/O

Undo/Redo operates on persistent `ConnectionPlan` changes only. Redo never triggers a provider API call automatically.

### MajorTransport Place integration

Create/Edit share `TransportPlacePicker` semantics:
- existing `TripPlace` reuse
- Local Search / Address Search candidate selection
- candidate remains draft-only until Save
- newly materialized endpoint Places and the MajorTransport edit are one history gesture
- cancel creates no Place

`PlaceChoice` / `TransportDraft` are editor/application draft types and therefore live outside any individual modal rather than in persisted Domain types.

## Structured Connection waypoint rendering

Waypoint semantics remain Application-owned. The renderer never receives a `WAYPOINT` domain kind.

- Application projects waypoint-only TripPlaces as ordinary `MapMarkerPrimitive` values with `size: 'SMALL'`.
- If a TripPlace has a stronger Visit/Bucket/Base/MajorTransport role, Application emits the existing normal marker instead of a duplicate waypoint marker.
- Manual Connection geometry is projected as a provider-neutral point list before reaching the renderer.
- Multi-waypoint provider routing uses the provider-neutral `RouteRequest.waypoints`; provider-specific count/order/validation limits stay inside each adapter.


## Pre-Google normalized API requirements

The completed NAVER implementation proves that Core currently needs only:

- renderer lifecycle + focus
- marker and path primitives
- natural-language place search
- address/geocode search
- route candidate lookup
- WALK/CAR/TRANSIT capability declaration
- stable provider reference when available
- normalized provider errors

`RouteIntent` is no longer NAVER-only. Provider-specific request limits (for example NAVER Directions waypoint count) are adapter validation, not Core policy.

`PlaceCandidate.provider` plus TripPlace field provenance protects the future persistence boundary. A provider result with no stable `sourceRef` is still provider-derived content.


## devpack10 route mode integration

Connection automatic-route UI consumes the existing provider-neutral `RouteMode` and `ProviderCapabilities` contract.

- CAR / WALK / TRANSIT selection is visible in the Connection editor.
- Selecting a mode is a pure UI draft change and never performs route I/O.
- Only the explicit `경로 조회` action calls `RouteProvider.findRoutes()`.
- Unsupported modes remain visible but disabled from provider capability declarations.
- Empty candidate arrays mean `no route available`; they are not converted into capability/authentication failures.
- Provider errors remain normalized as NOT_SUPPORTED / AUTH_ERROR / RATE_LIMITED / NETWORK_ERROR / PROVIDER_UNAVAILABLE / INVALID_REQUEST / UNKNOWN.
- Changing mode or auto-route waypoints invalidates the matching draft runtime result. The persistent Connection changes only after a route candidate is applied and Save is committed.
- Runtime geometry/duration/distance/summary/candidates remain session-only and are never stored in Connection History or canonical persistence.
- Provider-specific waypoint rules remain adapter validation. The UI no longer hardcodes NAVER's five-waypoint limit.
- Transit detail legs/transfers/times are not added to Core persistence in devpack10; only fields representable by current `RouteCandidate` are shown.

### Route response cache (optional)

`GOOGLE.ROUTES.RESULT` and `NAVER.DIRECTIONS5.RESULT` have independent, trip-scoped-by-default SQLite cache policies.
The operator config defaults to `ttlHours=0, retentionHours=0`, preserving the original
in-memory-only behavior. With `ttlHours=-1, retentionHours=-1` cache entries are kept
indefinitely; positive TTL uses effective TTL (`ttlHours - safetyMarginHours`) and the
configured retention window. Disabling the route cache sets retention to zero and
purges existing stored route responses when the admin policy is saved.

Explicit route searches read the cache first. On miss they invoke the existing provider
and write normalized `RouteCandidate[]` to the cache. Saving a connection preserves only
the selected candidate's opaque ID in `routeIntent.option` (no provider geometry in the
Trip snapshot). On reopening a Trip, the selected candidate can be hydrated from SQLite
without calling Google or NAVER; no auto-fetch happens on a cache miss.

**Usage restrictions:** Route responses from actual providers may have storage limits.
Caching is disabled by default. Use permanent mode only for independently generated
mock data or when the provider's applicable terms permit such retention. Do not point
both mock and live adapters at the same cache namespace while testing.
