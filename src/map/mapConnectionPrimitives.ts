import type { TripPlace } from '../domain/place'
import type { ConnectionPlan, MajorTransportData, Node, VisitData } from '../model'
import { pairKey } from '../model'
import { connectionWaypointPlaceIds } from '../connectionWaypoints'
import type { MapPathPrimitive } from './provider/contract'
import { appearanceForPath } from './appearanceConfig'
import { visualColor, type TripDayColors } from '../visual/appearance'

function compareNodes(a: Node, b: Node) {
  return a.start - b.start || a.end - b.end || a.key.localeCompare(b.key)
}

/**
 * Read-only projection of the frozen Timeline adjacency semantics for map display.
 *
 * Keep this in the Application/map adapter layer: the renderer must never learn
 * about Visit, MajorTransport, ConnectionPlan, or Waypoint semantics.
 */
export function connectionNodes(visits: readonly VisitData[], transports: readonly MajorTransportData[]): Node[] {
  return [
    ...visits.map(v => ({
      type: 'VISIT' as const,
      id: v.id,
      key: `VISIT:${v.id}`,
      start: v.start,
      end: v.end,
      entryPlaceId: v.placeId,
      exitPlaceId: v.placeId,
      title: v.title ?? '일정',
    })),
    ...transports.map(v => ({
      type: 'TRANSPORT' as const,
      id: v.id,
      key: `TRANSPORT:${v.id}`,
      start: v.occupiedFrom,
      end: v.occupiedUntil,
      entryPlaceId: v.departure.placeId,
      exitPlaceId: v.arrival.placeId,
      title: v.onboard.title,
    })),
  ].sort(compareNodes)
}

/** Frozen overlap-aware Timeline adjacency semantics. */
export function connectionPairs(nodes: readonly Node[]) {
  if (nodes.length < 2) return []
  const pairs: { from: Node; to: Node }[] = []
  let componentExit = nodes[0]
  let componentMaxEnd = nodes[0].end

  for (let i = 1; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (node.start >= componentMaxEnd) {
      pairs.push({ from: componentExit, to: node })
      componentExit = node
      componentMaxEnd = node.end
      continue
    }
    if (node.end > componentMaxEnd) {
      componentExit = node
      componentMaxEnd = node.end
    }
  }
  return pairs
}

export type MapPathTarget =
  | { kind: 'CONNECTION'; pairId: string; from: Node; to: Node }
  | { kind: 'MAJOR_TRANSPORT'; transportId: string }

export type ProjectedMapPath = {
  primitive: MapPathPrimitive
  target: MapPathTarget
}

function positionIndex(places: readonly TripPlace[]) {
  return new Map(
    places
      .filter(place => place.position && Number.isFinite(place.position.lat) && Number.isFinite(place.position.lng))
      .map(place => [place.id, place.position!] as const),
  )
}

function samePoint(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  return a.lat === b.lat && a.lng === b.lng
}

function connectionPoints(
  plan: ConnectionPlan | undefined,
  origin: {lat:number;lng:number},
  destination: {lat:number;lng:number},
  positions: ReadonlyMap<string,{lat:number;lng:number}>,
) {
  const points = [origin]
  for (const placeId of connectionWaypointPlaceIds(plan)) {
    const point = positions.get(placeId)
    if (!point) continue
    if (!samePoint(points[points.length - 1], point)) points.push(point)
  }
  if (!samePoint(points[points.length - 1], destination)) points.push(destination)
  return points
}

/**
 * Application-owned map projection.
 *
 * CONNECTION paths represent frozen Timeline adjacency and may open Connection editor.
 * Their manual geometry is origin -> persistent TripPlace waypoints -> destination.
 * MAJOR_TRANSPORT paths represent the fixed departure -> arrival movement itself and
 * may only open MajorTransport editor. Renderer receives only primitive ids/styles.
 */
export function buildMapPathProjection(
  places: readonly TripPlace[],
  visits: readonly VisitData[],
  transports: readonly MajorTransportData[],
  plans: Readonly<Record<string,ConnectionPlan>> = {},
  days: Readonly<TripDayColors> = {},
): ProjectedMapPath[] {
  const positions = positionIndex(places)
  const projected: ProjectedMapPath[] = []

  for (const { from, to } of connectionPairs(connectionNodes(visits, transports))) {
    const fromPlaceId = from.exitPlaceId
    const toPlaceId = to.entryPlaceId
    if (!fromPlaceId || !toPlaceId) continue
    const origin = positions.get(fromPlaceId)
    const destination = positions.get(toPlaceId)
    if (!origin || !destination) continue
    const pairId = pairKey(from, to)
    const points = connectionPoints(plans[pairId], origin, destination, positions)
    if (points.length < 2) continue

    const id = `connection-path:${pairId}`
    projected.push({
      primitive: appearanceForPath({
        id,
        points,
        stroke: 'DASHED',
        direction: 'FORWARD',
        emphasis: 'NORMAL',
        state: 'NORMAL',
        color: visualColor(plans[pairId]?.visualColor, from.end, days),
      }, 'connection'),
      target: { kind: 'CONNECTION', pairId, from, to },
    })
  }

  for (const transport of transports) {
    const origin = positions.get(transport.departure.placeId)
    const destination = positions.get(transport.arrival.placeId)
    if (!origin || !destination) continue
    if (samePoint(origin, destination)) continue

    projected.push({
      primitive: appearanceForPath({
        id: `transport-path:${transport.id}`,
        points: [origin, destination],
        stroke: 'SOLID',
        direction: 'FORWARD',
        emphasis: 'STRONG',
        state: 'NORMAL',
        color: visualColor(transport.visualColor, transport.occupiedFrom, days),
      }, 'majorTransport'),
      target: { kind: 'MAJOR_TRANSPORT', transportId: transport.id },
    })
  }

  return projected
}

export function findConnectionPairById(
  visits: readonly VisitData[],
  transports: readonly MajorTransportData[],
  pairId: string,
): { from: Node; to: Node } | null {
  return connectionPairs(connectionNodes(visits, transports))
    .find(({ from, to }) => pairKey(from, to) === pairId) ?? null
}
