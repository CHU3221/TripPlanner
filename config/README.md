# Provider cache policy: legal ceiling + operator override

Provider-content retention is compliance-sensitive. This project intentionally separates **developer-reviewed legal ceilings** from **operator runtime preferences**. This mechanism is a defensive engineering control, not a substitute for reviewing the provider's current terms or obtaining legal advice where appropriate.

## 1. The legal ceiling is code, not server configuration

Authoritative ceilings live in:

`src/providerData/legalPolicyCatalog.ts`

They are compiled into the application/server so a server operator cannot accidentally loosen a reviewed restriction by editing JSON.

**Do not replace this with a mutable production JSON catalog.** Provider terms can change. If legal permissions change, review the current provider terms and release a new TripPlanner version with an updated hard-coded catalog.

`provider-cache-policy.legal-reference.json` is for human inspection/audit only. **It must never be loaded as runtime authority.** Editing it changes nothing in the enforcement code.

## 2. Runtime/operator config is intentionally more restrictive

Use `provider-cache-policy.override.example.json` only as a template. Copy it to a server-private path, for example:

`/etc/tripplanner/provider-cache-policy.override.json`

A future backend may point to it with a non-browser environment variable such as:

`PROVIDER_CACHE_POLICY_OVERRIDE=/etc/tripplanner/provider-cache-policy.override.json`

Do **not** use a `VITE_` prefix; Vite-prefixed environment values are browser-exposed.

The checked-in example has every TTL disabled (`0`) on purpose. An operator must explicitly opt into caching after reviewing the deployed application version and current provider terms.

## 3. TTL semantics

- `-1`: no cache-expiry deadline. Accepted only if the developer legal ceiling is also `-1`.
- `0`: caching/storage disabled.
- `> 0`: requested runtime TTL in hours, and it must not exceed the developer legal ceiling.

Safety margin is subtracted only from positive TTL values.

**A positive TTL never becomes permanent.** Example: `ttlHours=1` with `safetyMarginHours=2` is an invalid config and server startup/config reload must reject it. `-1` is accepted only when the literal configured TTL is `-1` and the hard-coded catalog explicitly permits it.

Examples rejected by design:

- legal max `720`, operator `1000`
- legal max `720`, operator `-1`
- legal max `0`, operator `24`
- operator `1h`, safety margin `2h`
- unknown/typo policy key

## 4. Cross-Trip cache reuse

Physical provider cache storage may be shared, while Trip access is tracked separately using `tripId -> cacheId` references.

Runtime flag:

`allowCrossTripCacheReuse`

This flag is only an operator opt-in. Cross-Trip lookup is enabled **only when both**:

1. `allowCrossTripCacheReuse === true`, and
2. the hard-coded legal catalog marks that exact policy `crossTripReuse: "ALLOWED"`.

`FORBIDDEN` and `UNVERIFIED` always behave as Trip-scoped, regardless of operator settings.

As of catalog version `2026-10-12`, no policy is marked `ALLOWED`; therefore the current release cannot perform cross-Trip reuse even if the operator sets the global flag to `true`. A future reviewed release can explicitly unlock an individual policy.

This is intentionally conservative. Also note that future multi-user/account support may need an additional account/tenant isolation layer; `Trip` scope alone must not be mistaken for End User scope where provider terms require End User isolation.

## 5. Expiry enforcement

Polling is garbage collection only. Every cache read must evaluate current policy with authoritative server time.

The record stores the original `fetchedAtEpochMs`; a cache hit or reuse never resets that timestamp. Therefore another Trip accessing a cached entry cannot restart its legal TTL.

A runtime config change such as `720 -> 0` immediately makes old entries unreadable even before the next cleanup poll.

## 6. Current Google review notes

At the time this catalog version was reviewed:

- Google Places Place IDs may be stored for later use; Google recommends refreshing IDs older than 12 months.
- Google Places latitude/longitude may be temporarily cached for up to 30 consecutive calendar days.
- Other Places fields in this catalog remain fail-closed unless a specific exception is reviewed.
- Cross-Trip reuse is currently `UNVERIFIED` and therefore disabled even for otherwise cacheable values.

Always re-check the provider's current terms before changing the developer legal catalog.

## Map appearance (compile-time)

`map-appearance.config.json` configures provider-neutral line/marker styles for the current
app build. `src/map/appearanceConfig.ts` validates the JSON at import time and translates
styles to existing Map primitives. Edit the JSON and rebuild to apply changes; it is not
a per-trip DB setting or runtime operator override. `null` leaves renderer/theme color
unchanged. Valid colors: `#RRGGBB` or `#RRGGBBAA`; strokes: `SOLID` or `DASHED`. Path entries may also set `directionColor` independently from the line `color`; the current UX default is white direction glyphs with renderer-owned contrast outline/shadow.

## Legacy policy file clarification

The old `provider-cache-policy.config.json` was removed in devpack12 to avoid ambiguity now that a real backend exists. Runtime policy now comes from the immutable developer catalog plus the server-private override format. Management writes only the operator override; it cannot raise a policy above the developer ceiling.


## 8. Runtime wiring (devpack16)

The server now loads the effective provider-cache policy at runtime and exposes the operator-editable TTLs in the authenticated Management page. The Management UI shows the current TTL, developer maximum TTL, and effective TTL after safety margin. Server validation remains authoritative.

Current provider wiring is deliberately field-specific:

- `GOOGLE.PLACES.POSITION`: wired to Trip place hydration. A hit can satisfy a provider-derived position without Google I/O; if name/address are still needed, the Google Place Details field request omits `location`. A miss fetches the required Google fields and writes only the position value when the policy is enabled.
- `GOOGLE.PLACES.PLACE_ID`: Place IDs remain durable Trip identity regardless of provider-cache TTL. The separate cache policy entry reflects legal cacheability, not whether TripSnapshot may retain its required provider reference.
- Google name/address/details/photo/review and all current NAVER policy entries remain runtime-disabled because their developer maximum is `0`.

The cache is Trip-scoped in this release. `allowCrossTripCacheReuse=true` still cannot enable reuse because no current legal catalog entry is `ALLOWED`.
