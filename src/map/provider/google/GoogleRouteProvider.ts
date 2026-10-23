import type { RouteCandidate, RouteMode, RouteProvider, RouteRequest } from '../contract'
import { MapProviderError } from '../contract'
import { googleError, loadGoogleMaps } from './GoogleMapsSdk'
import { normalizeGoogleTransitSteps } from './normalizeGoogleTransit'
import { recordTelemetry } from '../../../telemetry'

export class GoogleRouteProvider implements RouteProvider {
  constructor(private readonly apiKey: string) {}
  async findRoutes(request: RouteRequest): Promise<RouteCandidate[]> {
    const points = [request.origin, ...(request.waypoints ?? []), request.destination]
    if (!points.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180))
      throw new MapProviderError('INVALID_REQUEST', '경로 좌표가 올바르지 않습니다.')
    if (points.some((p, i) => i > 0 && p.lat === points[i - 1].lat && p.lng === points[i - 1].lng))
      throw new MapProviderError('INVALID_REQUEST', '연속된 경로 좌표가 같습니다.')
    if (request.mode === 'TRANSIT' && (request.waypoints?.length ?? 0) > 0)
      throw new MapProviderError('NOT_SUPPORTED', 'Google 대중교통 경유지 경로는 지원하지 않습니다.')
    if ((request.waypoints?.length ?? 0) > 25) throw new MapProviderError('INVALID_REQUEST', 'Google 경유지 수 제한을 초과했습니다.')
    const modes: Record<RouteMode, string> = { WALK: 'WALKING', CAR: 'DRIVING', TRANSIT: 'TRANSIT' }
    try {
      const maps = await loadGoogleMaps(this.apiKey)
      const { Route } = await maps.importLibrary('routes')
      recordTelemetry('GOOGLE_COMPUTE_ROUTES_ESSENTIALS','GOOGLE')
      const { routes } = await Route.computeRoutes({ origin: request.origin, destination: request.destination,
        travelMode: modes[request.mode], ...(request.waypoints?.length ? { intermediates: request.waypoints.map(location => ({ location })) } : {}),
        fields: request.mode === 'TRANSIT'
          ? ['path', 'durationMillis', 'distanceMeters', 'description', 'legs']
          : ['path', 'durationMillis', 'distanceMeters', 'description'] })
      const candidates = (routes ?? []).flatMap((route: any, index: number): RouteCandidate[] => {
        if (!Number.isFinite(route.durationMillis)) return []
        const geometry = Array.isArray(route.path) ? route.path.flatMap((p: any) => {
          const lat = typeof p.lat === 'function' ? p.lat() : p.lat
          const lng = typeof p.lng === 'function' ? p.lng() : p.lng
          return Number.isFinite(lat) && Number.isFinite(lng) ? [{ lat, lng }] : []
        }) : []
        return [{ id: `google-${request.mode.toLowerCase()}-${index}`, mode: request.mode,
          durationMinutes: Math.max(1, Math.round(route.durationMillis / 60000)),
          distanceMeters: Number.isFinite(route.distanceMeters) ? route.distanceMeters : undefined,
          summary: route.description || '추천 경로', geometry: geometry.length >= 2 ? geometry : undefined,
          ...(request.mode === 'TRANSIT' ? (() => {
            const transitSteps = normalizeGoogleTransitSteps(route.legs)
            return transitSteps.length ? { transitSteps } : {}
          })() : {}) }]
      })
      // A nonempty API response without usable duration is an invalid result,
      // not evidence that transit service is unavailable in this location.
      if ((routes?.length ?? 0) > 0 && candidates.length === 0)
        throw new MapProviderError('PROVIDER_UNAVAILABLE', 'Google이 경로를 반환했으나 소요시간을 읽을 수 없습니다.')
      return candidates
    } catch (error) { throw googleError(error, 'Google 경로 검색에 실패했습니다.') }
  }
}
