import type { PlacementConstraints, TripPlaceFieldProvenance, VisitPropertyIcon, ExpectedCost, ScheduleAttachment } from '../domain/place'
import type { MajorTransportData, Segment } from '../model'
import type { ProviderPlaceRef } from '../map/provider/contract'

/** Application/editor draft only. Not persisted as domain state by itself. */
export type PlaceChoice =
  | { mode: 'NONE' }
  | { mode: 'EXISTING'; placeId: string }
  | { mode: 'NEW'; name: string; address?: string; lat?: number; lng?: number; sourceRef?: ProviderPlaceRef; provenance?: TripPlaceFieldProvenance; searchLabel?: string }

export type PlacePlanDraft = {
  purpose: 'VISIT' | 'NEARBY' | 'BASE'
  place: PlaceChoice
  title?: string
  detail?: string
  notes?: string
  duration?: number
  visitIcon?: VisitPropertyIcon
  expectedCost?: ExpectedCost
  checklist?: string[]
  attachments?: ScheduleAttachment[]
  constraints?: PlacementConstraints
}

export type TransportDraft = Omit<MajorTransportData, 'id' | 'occupiedFrom' | 'occupiedUntil' | 'departure' | 'arrival' | 'onboard'> & {
  departurePlace: PlaceChoice
  arrivalPlace: PlaceChoice
  departureAt: number
  arrivalAt: number
  title: string
}


/** Connection editor draft. New/search candidates stay ephemeral until Save. */
export type ConnectionSegmentDraft = Omit<Segment, 'waypointPlaceId'> & {
  waypoint: PlaceChoice
}
