import type { MapProvider } from '../contract'
import { NaverMapRenderer } from './NaverMapRenderer'
import { NaverPlaceSearchProvider } from './NaverPlaceSearchProvider'
import { NaverRouteProvider } from './NaverRouteProvider'

export type NaverProviderOptions = {
  /**
   * Browser-safe application backend endpoint. It must keep NAVER Client Secret
   * server-side and return the NAVER Local Search JSON body.
   */
  placeSearchEndpoint?: string
}

/**
 * First/reference MapProvider implementation used by the current TripPlanner build.
 *
 * Natural-language Place Search is implemented through an application backend
 * boundary. Address Search uses the browser-safe NAVER Maps geocoder submodule. CAR route is implemented through the dedicated server-side Directions boundary; unsupported route modes remain capability=false.
 */
export function createNaverProvider(clientId: string, options: NaverProviderOptions = {}): MapProvider {
  return {
    id: 'NAVER',
    capabilities: {
      placeSearch: true,
      addressSearch: true,
      routes: {
        walk: false,
        car: true,
        transit: false,
      },
    },
    renderer: new NaverMapRenderer(clientId),
    places: new NaverPlaceSearchProvider(clientId, options.placeSearchEndpoint),
    routes: new NaverRouteProvider(),
  }
}
