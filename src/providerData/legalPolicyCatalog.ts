import type { PlaceProviderId } from '../domain/place'

/**
 * Developer-owned legal/policy ceiling.
 *
 * IMPORTANT:
 * - This catalog is compiled into the application/server code on purpose.
 * - A production operator config may only make these rules MORE restrictive.
 * - Do not load a mutable external JSON file as the authority for these ceilings.
 * - When provider terms change, review the terms and ship a new application version.
 */
export type LegalCacheTtlHours = number
export type CachePolicyStatus = 'VERIFIED' | 'CONSERVATIVE' | 'UNVERIFIED'
export type LegalCrossTripReuse = 'ALLOWED' | 'FORBIDDEN' | 'UNVERIFIED'

export type ProviderCacheLegalPolicyEntry = {
  provider: PlaceProviderId
  /**
   * Maximum TTL the current application version is willing to permit.
   * -1 = no expiry ceiling recorded for this value, 0 = storage forbidden, >0 = maximum hours.
   */
  maxTtlHours: LegalCacheTtlHours
  /** Optional provider recommendation which does not itself expire a permanently storable value. */
  refreshAfterHours?: number
  /**
   * Whether a cache entry may be discovered/reused by another Trip.
   * UNVERIFIED deliberately behaves like FORBIDDEN until a reviewed release changes this catalog.
   */
  crossTripReuse: LegalCrossTripReuse
  status: CachePolicyStatus
  verifiedAt?: string
  policyUrl?: string
  notes?: string
}

export const LEGAL_PROVIDER_CACHE_CATALOG_VERSION = '2026-10-20'

const RAW_LEGAL_PROVIDER_CACHE_CATALOG = {
  'GOOGLE.PLACES.PLACE_ID': {
    provider: 'GOOGLE',
    maxTtlHours: -1,
    refreshAfterHours: 8760,
    crossTripReuse: 'ALLOWED',
    status: 'VERIFIED',
    verifiedAt: '2026-10-20',
    policyUrl: 'https://developers.google.com/maps/documentation/places/web-service/place-id',
    notes:
      'Place IDs are exempt from Places caching restrictions and may be stored for later use. Google recommends refreshing IDs older than 12 months. Cross-Trip reuse is intentionally not enabled by this release.',
  },
  'GOOGLE.PLACES.POSITION': {
    provider: 'GOOGLE',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'VERIFIED',
    verifiedAt: '2026-10-20',
    policyUrl: 'https://cloud.google.com/maps-platform/terms/maps-service-terms',
    notes:
      'Places API latitude/longitude may be cached for up to 30 consecutive calendar days. Cross-Trip reuse is deliberately fail-closed until separately reviewed.',
  },
  'GOOGLE.PLACES.NAME': {
    provider: 'GOOGLE',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'CONSERVATIVE',
    verifiedAt: '2026-10-20',
    policyUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
    notes: 'Fail-closed. No explicit storage exception is recorded for this field in this release.',
  },
  'GOOGLE.PLACES.ADDRESS': {
    provider: 'GOOGLE',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'CONSERVATIVE',
    verifiedAt: '2026-10-20',
    policyUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
    notes:
      'Fail-closed for Places API content. Do not copy a permission from a different Google API such as Geocoding or Address Validation.',
  },
  'GOOGLE.PLACES.DETAILS': {
    provider: 'GOOGLE',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'CONSERVATIVE',
    verifiedAt: '2026-10-20',
    policyUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
    notes: 'Fail-closed umbrella key. Prefer a separately reviewed field-specific key.',
  },
  'GOOGLE.PLACES.PHOTO': {
    provider: 'GOOGLE',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'CONSERVATIVE',
    verifiedAt: '2026-10-20',
    policyUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
  },
  'GOOGLE.PLACES.REVIEW': {
    provider: 'GOOGLE',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'CONSERVATIVE',
    verifiedAt: '2026-10-20',
    policyUrl: 'https://developers.google.com/maps/documentation/places/web-service/policies',
  },
  'NAVER.LOCAL_SEARCH.RESULT': {
    provider: 'NAVER',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'UNVERIFIED',
    notes: 'Fail closed until exact NAVER Local Search storage/caching terms are reviewed in a future release.',
  },
  'NAVER.GEOCODING.RESULT': {
    provider: 'NAVER',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'UNVERIFIED',
    notes: 'Fail closed until exact NAVER Geocoding storage/caching terms are reviewed in a future release.',
  },
  'NAVER.DIRECTIONS5.RESULT': {
    provider: 'NAVER',
    maxTtlHours: -1,
    crossTripReuse: 'ALLOWED',
    status: 'UNVERIFIED',
    notes:
      'Current TripPlanner policy keeps route geometry/metrics transient. Persisting Directions results remains disabled until explicitly reviewed.',
  },
} satisfies Record<string, ProviderCacheLegalPolicyEntry>

// Freeze both entries and the catalog object. TypeScript readonly types alone do not prevent
// accidental runtime mutation in a long-lived server process.
for (const entry of Object.values(RAW_LEGAL_PROVIDER_CACHE_CATALOG)) Object.freeze(entry)
export const LEGAL_PROVIDER_CACHE_CATALOG = Object.freeze(RAW_LEGAL_PROVIDER_CACHE_CATALOG)

export type LegalProviderCachePolicyKey = keyof typeof LEGAL_PROVIDER_CACHE_CATALOG
