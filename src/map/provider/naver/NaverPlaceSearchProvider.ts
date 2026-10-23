import type { PlaceCandidate, PlaceSearchProvider } from '../contract'
import { MapProviderError } from '../contract'
import { loadNaverMaps } from './NaverMapsSdk'

type NaverLocalSearchItem = {
  title?: unknown
  address?: unknown
  roadAddress?: unknown
  mapx?: unknown
  mapy?: unknown
}

type NaverLocalSearchResponse = {
  items?: unknown
}

const COORDINATE_SCALE = 10_000_000

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function decodeSearchTitle(value: unknown) {
  return text(value)
    .replace(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .trim()
}

function normalizeCoordinate(value: unknown, axis: 'lat' | 'lng') {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null

  // NAVER Local Search uses WGS84. Accept both decimal-degree strings and
  // the integer x10^7 representation used by NAVER Local Search responses.
  const normalized = Math.abs(parsed) > 1_000 ? parsed / COORDINATE_SCALE : parsed
  const valid = axis === 'lat'
    ? normalized >= -90 && normalized <= 90
    : normalized >= -180 && normalized <= 180
  return valid ? normalized : null
}

function normalizeItem(item: NaverLocalSearchItem): PlaceCandidate | null {
  const name = decodeSearchTitle(item.title)
  const lng = normalizeCoordinate(item.mapx, 'lng')
  const lat = normalizeCoordinate(item.mapy, 'lat')
  if (!name || lat === null || lng === null) return null

  const address = text(item.roadAddress) || text(item.address) || undefined
  return {
    provider: 'NAVER',
    name,
    address,
    position: { lat, lng },
  }
}

function errorForStatus(status: number, message: string) {
  if (status === 400) return new MapProviderError('INVALID_REQUEST', message)
  if (status === 401 || status === 403) return new MapProviderError('AUTH_ERROR', message)
  if (status === 429) return new MapProviderError('RATE_LIMITED', message)
  if (status >= 500) return new MapProviderError('PROVIDER_UNAVAILABLE', message)
  return new MapProviderError('NETWORK_ERROR', message)
}

/**
 * Browser-side NAVER Place Search adapter.
 *
 * Security boundary:
 * - This class NEVER receives a NAVER Client Secret.
 * - It calls a same-origin/application backend endpoint.
 * - The backend owns NAVER Local Search credentials and forwards only the
 *   provider response required for PlaceCandidate normalization.
 *
 * `searchAddress()` intentionally remains unsupported until Phase N3.
 */
export class NaverPlaceSearchProvider implements PlaceSearchProvider {
  private readonly clientId: string
  private readonly endpoint: string

  constructor(clientId: string, endpoint = '/api/map/naver/places') {
    this.clientId = clientId.trim()
    this.endpoint = endpoint
  }

  async searchPlaces(query: string): Promise<PlaceCandidate[]> {
    const trimmed = query.trim()
    if (!trimmed) throw new MapProviderError('INVALID_REQUEST', '장소 검색어를 입력해주세요.')

    const url = new URL(this.endpoint, window.location.origin)
    url.searchParams.set('query', trimmed)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
    } catch (error) {
      throw new MapProviderError('NETWORK_ERROR', '장소 검색 서버에 연결하지 못했습니다.', error)
    }

    if (!response.ok) {
      let message = `장소 검색에 실패했습니다. (${response.status})`
      try {
        const body = await response.json() as { message?: unknown }
        if (typeof body.message === 'string' && body.message.trim()) message = body.message.trim()
      } catch {
        // Keep the normalized fallback message when the backend did not return JSON.
      }
      throw errorForStatus(response.status, message)
    }

    let payload: NaverLocalSearchResponse
    try {
      payload = await response.json() as NaverLocalSearchResponse
    } catch (error) {
      throw new MapProviderError('PROVIDER_UNAVAILABLE', '장소 검색 응답을 해석하지 못했습니다.', error)
    }

    if (!Array.isArray(payload.items)) {
      throw new MapProviderError('PROVIDER_UNAVAILABLE', '장소 검색 응답 형식이 올바르지 않습니다.')
    }

    return payload.items
      .map(item => normalizeItem(item as NaverLocalSearchItem))
      .filter((candidate): candidate is PlaceCandidate => candidate !== null)
  }

  async searchAddress(address: string): Promise<PlaceCandidate[]> {
    const query = address.trim()
    if (!query) throw new MapProviderError('INVALID_REQUEST', '주소를 입력해주세요.')
    if (!this.clientId) throw new MapProviderError('AUTH_ERROR', 'NAVER Maps Client ID가 설정되지 않았습니다.')

    let maps: any
    try {
      maps = await loadNaverMaps(this.clientId)
    } catch (error) {
      if (error instanceof MapProviderError) throw error
      throw new MapProviderError('PROVIDER_UNAVAILABLE', '주소 검색 기능을 준비하지 못했습니다.', error)
    }

    return new Promise<PlaceCandidate[]>((resolve, reject) => {
      const service = maps.Service
      if (!service?.geocode) {
        reject(new MapProviderError('PROVIDER_UNAVAILABLE', '주소 검색 기능을 사용할 수 없습니다.'))
        return
      }

      service.geocode({ query }, (status: unknown, response: any) => {
        if (status !== service.Status?.OK) {
          reject(new MapProviderError('PROVIDER_UNAVAILABLE', '주소 검색에 실패했습니다.'))
          return
        }

        const addresses = response?.v2?.addresses
        if (!Array.isArray(addresses)) {
          reject(new MapProviderError('PROVIDER_UNAVAILABLE', '주소 검색 응답 형식이 올바르지 않습니다.'))
          return
        }

        const candidates = addresses.map((item: any): PlaceCandidate | null => {
          const lng = Number(item?.x)
          const lat = Number(item?.y)
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null

          const roadAddress = text(item?.roadAddress)
          const jibunAddress = text(item?.jibunAddress)
          const normalizedAddress = roadAddress || jibunAddress || query
          return {
            provider: 'NAVER',
            name: normalizedAddress,
            address: normalizedAddress,
            position: { lat, lng },
          }
        }).filter((candidate: PlaceCandidate | null): candidate is PlaceCandidate => candidate !== null)

        resolve(candidates)
      })
    })
  }
}
