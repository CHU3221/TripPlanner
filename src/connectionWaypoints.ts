import type { PlaceId, TripPlace } from './domain/place'
import type { ConnectionPlan, Segment } from './model'
import type { ConnectionSegmentDraft, PlaceChoice } from './components/editorTypes'

/**
 * Waypoint semantics:
 * - A waypoint is the physical Place reached after an intermediate Segment.
 * - The final Segment always terminates at the Connection destination node and therefore
 *   must not retain waypointPlaceId.
 * - Missing waypointPlaceId is fully backward compatible with legacy Connections.
 */
export function normalizeConnectionSegments(segments: readonly Segment[]): Segment[] {
  return segments.map((segment, index) => {
    if (index === segments.length - 1 && segment.waypointPlaceId !== undefined) {
      const { waypointPlaceId: _ignored, ...rest } = segment
      return rest
    }
    return { ...segment }
  })
}

export function segmentWaypointPlaceIds(segments: readonly Segment[]) {
  return segments
    .slice(0, Math.max(0, segments.length - 1))
    .map(segment => segment.waypointPlaceId)
    .filter((placeId): placeId is PlaceId => !!placeId)
}

export function connectionWaypointPlaceIds(plan: ConnectionPlan | undefined): PlaceId[] {
  if (!plan) return []
  return plan.source === 'ROUTE_API'
    ? (plan.routeIntent?.waypointPlaceIds ?? [])
    : segmentWaypointPlaceIds(plan.segments)
}

export function connectionDraftFromSegments(
  segments: readonly Segment[],
  places: readonly TripPlace[],
): ConnectionSegmentDraft[] {
  const validIds = new Set(places.map(place => place.id))
  return normalizeConnectionSegments(segments).map(segment => {
    const waypoint: PlaceChoice = segment.waypointPlaceId && validIds.has(segment.waypointPlaceId)
      ? { mode: 'EXISTING', placeId: segment.waypointPlaceId }
      : { mode: 'NONE' }
    const { waypointPlaceId: _ignored, ...rest } = segment
    return { ...rest, waypoint }
  })
}

/**
 * Keep editor invariants after add/delete/reorder operations. The waypoint draft travels
 * with its Segment, but if that Segment becomes the final Segment its waypoint is cleared
 * because the Connection destination is the final endpoint.
 */
export function normalizeConnectionDraft(segments: readonly ConnectionSegmentDraft[]): ConnectionSegmentDraft[] {
  return segments.map((segment, index) => index === segments.length - 1
    ? { ...segment, waypoint: { mode: 'NONE' } }
    : { ...segment, waypoint: clonePlaceChoice(segment.waypoint) })
}

function clonePlaceChoice(choice: PlaceChoice): PlaceChoice {
  if (choice.mode === 'NONE') return { mode: 'NONE' }
  if (choice.mode === 'EXISTING') return { mode: 'EXISTING', placeId: choice.placeId }
  return { ...choice }
}

/**
 * Future Place deletion must call this before removing the TripPlace. Current v4.6 has no
 * generic TripPlace delete command, but keeping this helper next to the domain invariant
 * prevents a later delete feature from leaving broken waypoint references.
 */
export function removeWaypointPlaceReference(plan: ConnectionPlan, placeId: PlaceId): ConnectionPlan {
  let changed = false
  const segments = plan.segments.map(segment => {
    if (segment.waypointPlaceId !== placeId) return segment
    changed = true
    const { waypointPlaceId: _ignored, ...rest } = segment
    return rest
  })
  const intent = plan.routeIntent
  const remaining = intent?.waypointPlaceIds?.filter(id => id !== placeId)
  const autoChanged = intent?.waypointPlaceIds?.length !== remaining?.length
  if (!changed && !autoChanged) return plan
  return {
    ...plan,
    segments: normalizeConnectionSegments(segments),
    routeIntent: autoChanged && intent
      ? { ...intent, waypointPlaceIds: remaining?.length ? remaining : undefined }
      : intent,
  }
}
