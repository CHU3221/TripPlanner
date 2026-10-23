import type { MapProvider, ProviderCapabilities, RouteCandidate, RouteMode, RouteRequest } from './map/provider/contract'
import { MapProviderError } from './map/provider/contract'

export type RouteModeUi = {
  mode: RouteMode
  label: string
  icon: string
}

export const ROUTE_MODE_UI: readonly RouteModeUi[] = [
  { mode: 'CAR', label: '자동차', icon: 'directions_car' },
  { mode: 'WALK', label: '도보', icon: 'directions_walk' },
  { mode: 'TRANSIT', label: '대중교통', icon: 'directions_transit' },
]

const CAPABILITY_KEY: Record<RouteMode, keyof ProviderCapabilities['routes']> = {
  WALK: 'walk',
  CAR: 'car',
  TRANSIT: 'transit',
}

export function routeModeLabel(mode: RouteMode) {
  return ROUTE_MODE_UI.find(item => item.mode === mode)?.label ?? mode
}

export function routeModeIcon(mode: RouteMode) {
  return ROUTE_MODE_UI.find(item => item.mode === mode)?.icon ?? 'route'
}

export function routeModeSupported(capabilities: ProviderCapabilities, mode: RouteMode) {
  return capabilities.routes[CAPABILITY_KEY[mode]]
}

/** Prefer the user's/saved mode when usable; otherwise keep the historical CAR-first behavior. */
export function preferredRouteMode(capabilities: ProviderCapabilities, preferred?: RouteMode): RouteMode {
  if (preferred && routeModeSupported(capabilities, preferred)) return preferred
  return (['CAR', 'WALK', 'TRANSIT'] as const).find(mode => routeModeSupported(capabilities, mode)) ?? preferred ?? 'CAR'
}

/**
 * One explicit query maps to exactly one RouteProvider.findRoutes call.
 * Capability failure is rejected before provider/network I/O.
 */
export async function searchRouteCandidates(provider: MapProvider, request: RouteRequest): Promise<RouteCandidate[]> {
  if (!provider.routes || !routeModeSupported(provider.capabilities, request.mode)) {
    throw new MapProviderError('NOT_SUPPORTED', `현재 지도 Provider는 ${routeModeLabel(request.mode)} 경로 조회를 지원하지 않습니다.`)
  }
  const routes = await provider.routes.findRoutes(request)
  if (routes.some(route => route.mode !== request.mode)) {
    throw new MapProviderError('PROVIDER_UNAVAILABLE', 'Provider가 요청한 이동수단과 다른 경로 결과를 반환했습니다.')
  }
  return routes
}

export function routeSearchErrorMessage(error: unknown) {
  if (!(error instanceof MapProviderError)) {
    return error instanceof Error ? `경로 조회 실패: ${error.message}` : '경로 조회 중 알 수 없는 오류가 발생했습니다.'
  }
  const prefix: Record<MapProviderError['code'], string> = {
    NOT_SUPPORTED: '지원되지 않는 기능',
    AUTH_ERROR: '인증/권한 문제',
    RATE_LIMITED: '호출 한도 초과',
    NETWORK_ERROR: '네트워크 문제',
    PROVIDER_UNAVAILABLE: '지도 서비스 오류',
    INVALID_REQUEST: '경로 요청 오류',
    UNKNOWN: '경로 조회 오류',
  }
  return `${prefix[error.code]}: ${error.message}`
}

export type RouteRequestGateResult<T> =
  | { status: 'COMPLETED'; value: T }
  | { status: 'FAILED'; error: unknown }
  | { status: 'BUSY' }
  | { status: 'CANCELLED' }

/**
 * UI-level duplicate-click/cancellation gate.
 * cancel() does not abort provider I/O, but invalidates its result so a closed/reopened
 * editor can issue a new request without a stale completion overwriting current state.
 */
export class RouteRequestGate {
  private activeToken: symbol | null = null

  get busy() { return this.activeToken !== null }

  cancel() { this.activeToken = null }

  async run<T>(task: () => Promise<T>): Promise<RouteRequestGateResult<T>> {
    if (this.activeToken) return { status: 'BUSY' }
    const token = Symbol('route-request')
    this.activeToken = token
    try {
      const value = await task()
      if (this.activeToken !== token) return { status: 'CANCELLED' }
      return { status: 'COMPLETED', value }
    } catch (error) {
      if (this.activeToken !== token) return { status: 'CANCELLED' }
      return { status: 'FAILED', error }
    } finally {
      if (this.activeToken === token) this.activeToken = null
    }
  }
}
