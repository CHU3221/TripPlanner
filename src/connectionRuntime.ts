import type { GeoPoint, TripPlace } from './domain/place'
import type { ConnectionPlan, MajorTransportData, Node, VisitData } from './model'
import { pairKey } from './model'
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

export function routeRuntimeMatches(result: RouteRuntimeResult | undefined, request: RouteRequest, option?: string) {
  return !!result && result.requestKey === routeRequestKey(request) && (!option || result.route.id === option)
}

/** Reconstruct lookup requests from canonical user-owned plans only.
 * No API is triggered. Old snapshots without option fall back to the first cached candidate.
 */
export function savedRouteCacheRequests(
  plans:Record<string,ConnectionPlan>,visits:readonly VisitData[],transports:readonly MajorTransportData[],places:readonly TripPlace[],provider:'GOOGLE'|'NAVER',
){
  const nodes:Node[]=[
    ...visits.map(v=>({type:'VISIT' as const,id:v.id,key:`VISIT:${v.id}`,start:v.start,end:v.end,entryPlaceId:v.placeId,exitPlaceId:v.placeId,title:v.title??''})),
    ...transports.map(t=>({type:'TRANSPORT' as const,id:t.id,key:`TRANSPORT:${t.id}`,start:t.occupiedFrom,end:t.occupiedUntil,entryPlaceId:t.departure.placeId,exitPlaceId:t.arrival.placeId,title:t.userTitle??''})),
  ].sort((a,b)=>a.start-b.start||a.end-b.end||a.key.localeCompare(b.key))
  const results:{pairId:string;request:RouteRequest;option?:string}[]=[]
  if(nodes.length<2)return results
  let from=nodes[0],maxEnd=from.end
  for(let i=1;i<nodes.length;i++){
    const to=nodes[i]
    if(to.start<maxEnd){if(to.end>maxEnd){from=to;maxEnd=to.end}continue}
    const pairId=pairKey(from,to),plan=plans[pairId]
    if(plan?.source==='ROUTE_API'&&plan.routeIntent?.provider===provider){
      const request=savedConnectionRouteRequest({from,to},places,plan)
      if(request)results.push({pairId,request,option:plan.routeIntent.option})
    }
    from=to;maxEnd=to.end
  }
  return results
}
