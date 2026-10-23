import type { BucketItem, PlaceId, TripBase } from '../domain/place'
import type { ConnectionPlan, MajorTransportData, VisitData } from '../model'
import { connectionWaypointPlaceIds } from '../connectionWaypoints'

/**
 * Places are durable identities and are not garbage-collected merely because the last
 * planning object that referenced them was removed. Map visibility is a projection of
 * current planning state, not a proxy for whether a TripPlace row still exists.
 */
export function collectStrongPlaceIds(
  bucketItems: readonly BucketItem[],
  bases: readonly TripBase[],
  visits: readonly VisitData[],
  transports: readonly MajorTransportData[],
): Set<PlaceId> {
  const ids = new Set<PlaceId>()
  for (const item of bucketItems) if (item.placeId) ids.add(item.placeId)
  for (const base of bases) ids.add(base.placeId)
  for (const visit of visits) if (visit.placeId) ids.add(visit.placeId)
  for (const transport of transports) {
    ids.add(transport.departure.placeId)
    ids.add(transport.arrival.placeId)
  }
  return ids
}

/**
 * Only waypoints belonging to currently active Timeline adjacency pairs participate in
 * map visibility. Inactive ConnectionPlan objects may remain stored for Undo/identity,
 * but they must not keep otherwise-unused Pins visible.
 */
export function collectActiveWaypointPlaceIds(
  plans: Readonly<Record<string, ConnectionPlan>>,
  activeConnectionPairIds: ReadonlySet<string>,
): Set<PlaceId> {
  const ids = new Set<PlaceId>()
  for (const pairId of activeConnectionPairIds) {
    for (const placeId of connectionWaypointPlaceIds(plans[pairId])) ids.add(placeId)
  }
  return ids
}

export function collectVisiblePlaceIds(
  bucketItems: readonly BucketItem[],
  bases: readonly TripBase[],
  visits: readonly VisitData[],
  transports: readonly MajorTransportData[],
  plans: Readonly<Record<string, ConnectionPlan>>,
  activeConnectionPairIds: ReadonlySet<string>,
): Set<PlaceId> {
  const ids = collectStrongPlaceIds(bucketItems, bases, visits, transports)
  for (const placeId of collectActiveWaypointPlaceIds(plans, activeConnectionPairIds)) ids.add(placeId)
  return ids
}
