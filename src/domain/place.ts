export type PlaceId = string
export type GeoPoint = { lat:number; lng:number }
export type PlaceProviderId = 'NAVER' | 'GOOGLE'

/** Durable external identity only. Provider content/cache lives outside TripPlace. */
export type TripPlaceProviderRef = { provider:PlaceProviderId; id:string }

export type TripPlaceFieldKey = 'name' | 'address' | 'position'
export type TripPlaceFieldSource =
  | { source:'USER' }
  | { source:'PROVIDER'; provider:PlaceProviderId }
export type TripPlaceFieldProvenance = Partial<Record<TripPlaceFieldKey, TripPlaceFieldSource>>

export type TripPlace = {
  id:PlaceId
  name:string
  address?:string
  position?:GeoPoint
  category?:string
  memo?:string
  /** User-authored search text kept as a durable fallback label when provider displayName cannot be stored. */
  searchLabel?:string
  /** Stable provider identity such as a Google Place ID. Do not store provider response payloads here. */
  providerRef?:TripPlaceProviderRef
  /** Field-level authorship boundary used before any canonical server persistence. */
  provenance?:TripPlaceFieldProvenance
}

export type DateRangeConstraint = { startDate:string; endDate:string }
export type DailyAvailability = { startMinute:number; endMinute:number }
export type PlacementConstraints = { dateRange?:DateRangeConstraint; dailyAvailability?:DailyAvailability; fixedStart?:number }
export type PlanningKind = 'VISIT'|'NEARBY'
export type VisitPropertyIcon = 'PLACE'|'ATTRACTION'|'FOOD'|'CAFE'|'SHOPPING'|'HOTEL'|'TRANSIT'|'EVENT'|'NATURE'|'OTHER'
export type ExpectedCost = { amount:number; currency:string }
export type ScheduleAttachment = { id:string; fileName:string; mimeType:'image/jpeg'|'image/png'|'image/webp'; sizeBytes:number }

/**
 * Canonical definition shared by an unscheduled BucketItem and a placed Visit.
 * Bucket/Timeline are placement states; these fields describe the schedule itself.
 */
export type ScheduleDefinition = {
  placeId?:PlaceId
  title?:string
  /** Short summary shown on Timeline/cards. */
  detail?:string
  /** Long-form planning note shown in the detailed editor/capture panel. */
  notes?:string
  /** User-owned optional color, preserved between Bucket and Timeline. */
  visualColor?:string
  /** Optional semantic icon. UI maps this stable key to Material Symbols. */
  visitIcon?:VisitPropertyIcon
  /** User-authored rough cost estimate for this one schedule/visit. */
  expectedCost?:ExpectedCost
  /** User-authored preparation items. Kept as simple tags for aggregation/presentation. */
  checklist?:string[]
  /** User-uploaded images stored by the TripPlanner server. */
  attachments?:ScheduleAttachment[]
  planningKind?:PlanningKind
  constraints?:PlacementConstraints
}

// One-shot schedule in the unscheduled/bucket placement state.
// placeId is optional: absence means the task can happen anywhere.
export type BucketItem = ScheduleDefinition & {
  id:string
  meta:string
  duration?:number
  durationExplicit?:boolean
  visitId?:string
}

// Reusable Visit factory/reference point. Placement never consumes the Base.
export type TripBase = { id:string; placeId:PlaceId; title?:string; meta:string; detail?:string; notes?:string; duration?:number; visitIcon?:VisitPropertyIcon; expectedCost?:ExpectedCost; checklist?:string[]; attachments?:ScheduleAttachment[] }
