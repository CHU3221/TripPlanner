// src/transit/contract.ts
// E1: Core/Application-owned transit assistance boundary.
// NOT a MapProvider extension, NOT a persistent Connection model.

import type { GeoPoint } from '../domain/place'

/** Opaque identifier meaningful only to its own transit-data provider. */
export type TransitProviderId = string
export type TransitStopRef = {
  provider: TransitProviderId
  id: string
}

/** Provider data, not yet a user-owned TripPlace. */
export type TransitLocationCandidate = {
  name: string
  position?: GeoPoint
  stopRef?: TransitStopRef
}

/** Time strings must be ISO 8601 with an explicit UTC offset (or Z). */
export type TransitTimeConstraint = {
  kind: 'DEPART_AFTER' | 'ARRIVE_BY'
  at: string
}

/** Coordinates are supplied by the Application; the provider never creates a Visit. */
export type TransitJourneyRequest = {
  origin: GeoPoint
  destination: GeoPoint
  time?: TransitTimeConstraint
}

export type TransitLegMode = 'WALK' | 'BUS' | 'SUBWAY' | 'TRAIN' | 'OTHER'
export type TransitLineCandidate = {
  name?: string
  number?: string
  operator?: string
}

/**
 * Transient journey leg. Stop/line IDs and provider route geometry are not
 * TripPlace IDs and must not be copied directly into canonical ConnectionPlan.
 */
export type TransitJourneyLeg = {
  mode: TransitLegMode
  from: TransitLocationCandidate
  to: TransitLocationCandidate
  durationMinutes: number
  line?: TransitLineCandidate
  departureAt?: string
  arrivalAt?: string
  geometry?: readonly GeoPoint[]
}

/**
 * Transient provider candidate. Total duration may include waits/transfers;
 * do not assume it equals the sum of leg durations.
 */
export type TransitJourneyCandidate = {
  id: string // request-local ID, not persistent identity
  durationMinutes: number
  transferCount?: number
  summary?: string
  legs: readonly TransitJourneyLeg[]
}

/** Point-to-point multimodal journey search, e.g. an ODsay adapter. */
export interface TransitJourneySearchProvider {
  findJourneys(request: TransitJourneyRequest): Promise<readonly TransitJourneyCandidate[]>
}

export type TransitStopSearchRequest = {
  query: string
  near?: GeoPoint
}

export type TransitStopCandidate = TransitLocationCandidate & {
  stopRef: TransitStopRef
}

/** Transient estimated arrivals; fields vary by provider and service. */
export type TransitArrivalCandidate = {
  stopRef: TransitStopRef
  line?: TransitLineCandidate
  destinationName?: string
  minutesUntilArrival?: number
  expectedAt?: string
}

/** Transient timetable entries; date/time semantics are provider-dependent. */
export type TransitTimetableCandidate = {
  stopRef: TransitStopRef
  line?: TransitLineCandidate
  destinationName?: string
  departureAt: string
}

/**
 * Station/stop search and optional live-arrival/timetable lookup.
 * A TAGO adapter may implement only the methods its actual APIs support.
 */
export interface TransitStopInfoProvider {
  searchStops(request: TransitStopSearchRequest): Promise<readonly TransitStopCandidate[]>
  getArrivals?(stop: TransitStopRef): Promise<readonly TransitArrivalCandidate[]>
  getTimetable?(
    stop: TransitStopRef,
    serviceDate: string, // YYYY-MM-DD in the relevant locality
  ): Promise<readonly TransitTimetableCandidate[]>
}

/**
 * Optional capability bundle. The MapProvider contract is unchanged.
 * Transit data may come from a different provider than the map renderer.
 */
export interface TransitAssistProvider {
  readonly id: TransitProviderId
  readonly journeys?: TransitJourneySearchProvider
  readonly stops?: TransitStopInfoProvider
}
