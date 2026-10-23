import type { RouteCandidate, RouteProvider, RouteRequest } from '../contract'
import { MapProviderError } from '../contract'
import { adjacentRoutePointError } from './routeValidation'

type NaverRouteBody = {
  code?: number
  message?: string
  route?: Record<string, Array<{
    summary?: { distance?: number; duration?: number }
    path?: Array<[number, number]>
  }>>
}

function providerError(status: number, original?: unknown) {
  if (status === 401 || status === 403) return new MapProviderError('AUTH_ERROR', '경로 검색 인증에 실패했습니다.', original)
  if (status === 429) return new MapProviderError('RATE_LIMITED', '경로 검색 사용량 제한에 도달했습니다.', original)
  if (status >= 500) return new MapProviderError('PROVIDER_UNAVAILABLE', '경로 검색 서비스를 사용할 수 없습니다.', original)
  if (status === 400) return new MapProviderError('INVALID_REQUEST', 'NAVER가 경로 요청을 거부했습니다. 출발지·도착지·경유지의 위치와 순서를 확인해주세요. (400)', original)
  return new MapProviderError('UNKNOWN', `경로 검색에 실패했습니다. (${status})`, original)
}

export class NaverRouteProvider implements RouteProvider {
  constructor(private readonly endpoint = '/api/map/naver/routes') {}

  async findRoutes(request: RouteRequest): Promise<RouteCandidate[]> {
    if (request.mode !== 'CAR') {
      throw new MapProviderError('NOT_SUPPORTED', `NAVER Provider는 ${request.mode} 경로를 지원하지 않습니다.`)
    }
    const waypoints = request.waypoints ?? []
    if (waypoints.length > 5) {
      throw new MapProviderError('INVALID_REQUEST', 'NAVER Directions 5는 경유지를 최대 5개까지 지원합니다.')
    }
    const validPoint = (p: {lat:number;lng:number}) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
      && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180
    if (![request.origin, ...waypoints, request.destination].every(validPoint)) {
      throw new MapProviderError('INVALID_REQUEST', '경로 검색 좌표가 올바르지 않습니다.')
    }
    const duplicateError = adjacentRoutePointError(request)
    if (duplicateError) throw new MapProviderError('INVALID_REQUEST', duplicateError)
    const url = new URL(this.endpoint, window.location.origin)
    url.searchParams.set('start', `${request.origin.lng},${request.origin.lat}`)
    url.searchParams.set('goal', `${request.destination.lng},${request.destination.lat}`)
    if (waypoints.length) {
      url.searchParams.set('waypoints', waypoints.map(p => `${p.lng},${p.lat}`).join('|'))
    }
    url.searchParams.set('mode', request.mode)

    let response: Response
    try { response = await fetch(url) }
    catch (error) { throw new MapProviderError('NETWORK_ERROR', '경로 검색 서버에 연결하지 못했습니다.', error) }
    if (!response.ok) throw providerError(response.status)

    const body = await response.json() as NaverRouteBody
    if (body.code !== 0) return []
    const routes = body.route?.traoptimal ?? []
    return routes.flatMap((route, index) => {
      const durationMs = route.summary?.duration
      const path = route.path
      if (!Number.isFinite(durationMs) || !Array.isArray(path) || path.length < 2) return []
      const geometry = path.flatMap(([lng, lat]) => Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : [])
      if (geometry.length < 2) return []
      return [{
        id: `naver-car-traoptimal-${index}`,
        mode: 'CAR' as const,
        durationMinutes: Math.max(1, Math.round(durationMs! / 60000)),
        distanceMeters: Number.isFinite(route.summary?.distance) ? route.summary!.distance : undefined,
        summary: '실시간 최적 경로',
        geometry,
      }]
    })
  }
}
