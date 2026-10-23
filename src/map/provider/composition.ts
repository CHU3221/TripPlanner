import type { MapProvider, MapProviderId } from './contract'
import type { TripPlaceProviderRef } from '../../domain/place'
import { MapProviderError } from './contract'
import { resolveGooglePlaceRef } from './google/GooglePlaceResolver'
import { createGoogleProvider } from './google/createGoogleProvider'
import { createNaverProvider } from './naver/createNaverProvider'

export type TripMapRoute = {
  tripId: string
  mapProvider: MapProviderId
}

/** Final public trip namespaces. Site routes (/lobby, /man) are owned by the later site shell. */
export function parseTripMapRoute(pathname: string): TripMapRoute | null {
  const match = pathname.match(/^\/(nav|goo)\/([^/]+)\/?$/)
  if (!match) return null
  let tripId: string
  try { tripId = decodeURIComponent(match[2]).trim() }
  catch { return null }
  if (!tripId) return null
  return { tripId, mapProvider: match[1] === 'nav' ? 'NAVER' : 'GOOGLE' }
}

/** Provider composition only; Core and Timeline never switch on identity. */
export function createTripMapProvider(
  providerId: MapProviderId,
  options: { naverClientId: string; googleApiKey?: string; googleMapId?: string },
): MapProvider {
  if (providerId === 'NAVER') return createNaverProvider(options.naverClientId)
  return createGoogleProvider(options.googleApiKey ?? '', options.googleMapId)
}

/** Runtime re-resolution of a durable provider place reference. Provider identity remains inside composition/adapters. */
export async function resolveTripPlaceRef(
  providerId: MapProviderId,
  ref: TripPlaceProviderRef,
  options: { googleApiKey?: string; requestedFields?: {name:boolean;address:boolean;position:boolean}; allowGeocodingFallback?: boolean },
) {
  if (ref.provider !== providerId) throw new MapProviderError('INVALID_REQUEST', 'Trip Provider와 장소 Provider가 일치하지 않습니다.')
  if (providerId === 'GOOGLE') return resolveGooglePlaceRef(options.googleApiKey ?? '', ref, options.requestedFields, options.allowGeocodingFallback)
  throw new MapProviderError('NOT_SUPPORTED', '현재 Provider는 저장된 장소 ID 재조회 기능을 제공하지 않습니다.')
}
