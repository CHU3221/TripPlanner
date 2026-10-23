import type { RouteRequest } from '../contract'

/** Keep looping routes possible: only adjacent duplicate physical points are invalid. */
export function adjacentRoutePointError(request: RouteRequest): string | null {
  const path = [request.origin, ...(request.waypoints ?? []), request.destination]
  for (let index = 1; index < path.length; index += 1) {
    const before = path[index - 1]
    const current = path[index]
    if (Math.abs(before.lat - current.lat) <= 1e-7 && Math.abs(before.lng - current.lng) <= 1e-7) {
      if (index === 1) return '출발지와 첫 경유지(또는 도착지)가 같습니다. 중복 지점을 변경하거나 제거해주세요.'
      if (index === path.length - 1) return '마지막 경유지가 도착지와 같습니다. 중복 경유지를 제거해주세요.'
      return `연속된 경유지 ${index - 1}번과 ${index}번이 같은 위치입니다. 하나를 변경하거나 제거해주세요.`
    }
  }
  return null
}
