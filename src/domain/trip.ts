import type { PlaceProviderId, TripPlace } from './place'
import type { Region } from './region'
import type { VisitData, MajorTransportData } from '../model'

export type Trip = {
  id: string
  name: string
  /** Canonical provider binding for this Trip. URL namespace is only a routing hint. */
  mapProvider: PlaceProviderId

  places: TripPlace[]
  regions: Region[]
  visits: VisitData[]
  transports: MajorTransportData[]
}
