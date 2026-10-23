import type { BucketItem, GeoPoint, PlaceProviderId, TripBase, TripPlaceProviderRef } from '../domain/place'
import type { Region } from '../domain/region'
import type { TripMapSettings } from '../map/tripMapSettings'
import type { ConnectionPlan, MajorTransportData, TimelineLabel, TimelineViewSettings, VisitData } from '../model'

/**
 * StoredPlace intentionally does NOT accept a TripPlace object directly.
 * Only user-authored (or separately licensed) fields may be copied to userData.
 * Provider-derived title, address, coordinates and transient route data must never be
 * silently promoted to permanently stored trip data.
 * An empty userData is valid: load/re-render can resolve the provider reference later.
 */
export type StoredPlace = {
  id: string
  providerRef?: TripPlaceProviderRef
  userData: {
    name?: string
    address?: string
    position?: GeoPoint
    category?: string
    memo?: string
    searchLabel?: string
  }
}


/**
 * Persistence-safe MajorTransport shape.
 * Provider-derived display strings (`departure.place`, `arrival.place`, generated
 * `onboard.title/route`, icon) are projections and are deliberately not serialized.
 * They must be rebuilt from canonical Place identities and user-owned transport data.
 */
export type StoredMajorTransport = Pick<MajorTransportData,
  'id' | 'occupiedFrom' | 'occupiedUntil' | 'mode' | 'serviceNumber' | 'seat' | 'memo' | 'userTitle' | 'collapsedRange' | 'visualColor'
> & {
  departure: Omit<MajorTransportData['departure'], 'place'>
  arrival: Omit<MajorTransportData['arrival'], 'place'>
}

/** Canonical trip-editing snapshot, NOT a provider response cache or browser History log. */
export type TripSnapshotBase = {
  schemaVersion: 1 | 2 | 3
  tripId: string
  name: string
  /** Server-side canonical provider binding; must agree with /nav or /goo route access. */
  mapProvider: PlaceProviderId
  places: StoredPlace[]
  regions: Region[]
  visits: VisitData[]
  bucketItems: BucketItem[]
  bases: TripBase[]
  transports: StoredMajorTransport[]
  labels: TimelineLabel[]
  plans: Record<string, ConnectionPlan>
  /** Trip-level Timeline viewport. Display range is persisted; removed Time Skip/compression is not. */
  timelineView?: TimelineViewSettings
  /** Optional user-authored day palette overrides. Omit empty object for older snapshots. */
  dayColors?: import('../visual/appearance').TripDayColors
  /** Per-trip map presentation settings. Default values may be omitted for old snapshots. */
  mapSettings?: TripMapSettings | { connectionSize:'SMALL'|'MEDIUM'|'LARGE'|'XLARGE' }
  /** Product-owned semantic appearance settings; optional for backward compatibility. */
  appearanceSettings?: import('../visual/appearance').TripAppearanceSettings
}

export type TripSnapshotV1 = Omit<TripSnapshotBase,'schemaVersion'|'mapSettings'> & { schemaVersion:1; mapSettings?:{connectionSize:'SMALL'|'MEDIUM'|'LARGE'|'XLARGE'} }
export type TripSnapshotV2 = Omit<TripSnapshotBase,'schemaVersion'|'mapSettings'> & { schemaVersion:2; mapSettings?:TripMapSettings }
export type TripSnapshotV3 = Omit<TripSnapshotBase,'schemaVersion'|'mapSettings'> & { schemaVersion:3; mapSettings?:TripMapSettings }
export type TripSnapshot = TripSnapshotV1 | TripSnapshotV2 | TripSnapshotV3

/** Repository adapter must enforce revision matching; server routes enforce authentication and Trip ACL before repository access. */
export type VersionedTripSnapshot = { revision: number; snapshot: TripSnapshot }
export interface TripSnapshotRepository {
  load(tripId: string): Promise<VersionedTripSnapshot | null>
  /** Must reject stale expectedRevision; do not silently overwrite concurrent edits. */
  save(tripId: string, snapshot: TripSnapshot, expectedRevision: number): Promise<number>
}

/**
 * The App uses this boundary through an authenticated HTTP repository and SQLite backend.
 * Serialization remains fail-closed for provider-derived TripPlace fields; durable provider
 * identity is stored separately and runtime details are re-resolved or policy-cached when needed.
 */
export type TripStorageBoundaryStatus = 'SERVER_WIRED'
