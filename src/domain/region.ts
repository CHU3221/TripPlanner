import type { PlaceId } from './place'

export type RegionId = string

export type Region = {
  id: RegionId
  name: string

  placeIds: PlaceId[]
}