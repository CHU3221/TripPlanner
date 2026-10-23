import type { GeoPoint, TripPlace } from './domain/place'
import type { ConnectionPlan, Node } from './model'
import type { RouteCandidate, RouteRequest } from './map/provider/contract'

/** Runtime-only provider response, never serialized into Trip data or history. */
export type RouteRuntimeResult = {
  requestKey: string
  request: RouteRequest
  route: RouteCandidate
}

export function routeRequestKey(request: RouteRequest) {
  const { origin, destination, mode } = request
  const pointKey = (point: GeoPoint) => `${point.lat.toFixed(7)},${point.lng.toFixed(7)}`
  return [mode, pointKey(origin), ...(request.waypoints ?? []).map(pointKey), pointKey(destination)].join(':')
}

/** Resolves saved auto-route waypoints against current user-owned TripPlace positions.
 * Broken/missing positions fail closed; never silently navigate past a waypoint.
 */
export function savedConnectionRouteRequest(
  pair: { from: Node; to: Node },
  places: readonly TripPlace[],
  plan?: ConnectionPlan,
): RouteRequest | null {
  const positionById = new Map(places.map(place => [place.id, place.position] as const))
  const origin = pair.from.exitPlaceId ? positionById.get(pair.from.exitPlaceId) : undefined
  const destination = pair.to.entryPlaceId ? positionById.get(pair.to.entryPlaceId) : undefined
  if (!origin || !destination) return null
  const placeIds = plan?.source === 'ROUTE_API' ? (plan.routeIntent?.waypointPlaceIds ?? []) : []
  const waypoints: GeoPoint[] = []
  for (const id of placeIds) {
    const position = positionById.get(id)
    if (!position) return null
    waypoints.push(position)
  }
  return { origin, destination, mode: plan?.routeIntent?.mode ?? 'CAR', ...(waypoints.length ? { waypoints } : {}) }
}

export function routeRuntimeMatches(result: RouteRuntimeResult | undefined, request: RouteRequest) {
  return !!result && result.requestKey === routeRequestKey(request)
}
