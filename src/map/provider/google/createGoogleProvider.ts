import type { MapProvider } from '../contract'
import { GoogleMapRenderer } from './GoogleMapRenderer'
import { GooglePlaceSearchProvider } from './GooglePlaceSearchProvider'
import { GoogleRouteProvider } from './GoogleRouteProvider'

export function createGoogleProvider(apiKey: string, mapId?: string): MapProvider {
  return {
    id: 'GOOGLE',
    capabilities: { placeSearch: true, addressSearch: true,
      routes: { walk: true, car: true, transit: true } },
    renderer: new GoogleMapRenderer(apiKey, mapId),
    places: new GooglePlaceSearchProvider(apiKey),
    routes: new GoogleRouteProvider(apiKey),
  }
}
