import { MapProviderError } from '../contract'

// SDK typing intentionally stays inside the adapter; Core does not import Google types.
export type GoogleMaps = any
declare global { interface Window { google?: { maps?: GoogleMaps }; __tripPlannerGoogleReady?: () => void; gm_authFailure?: () => void } }
let sdkPromise: Promise<GoogleMaps> | null = null
let loadedKey: string | null = null
const SCRIPT_ID = 'tripplanner-google-maps-sdk'

export async function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  const normalized = key.trim()
  if (!normalized) throw new MapProviderError('AUTH_ERROR', 'VITE_GOOGLE_MAPS_API_KEY가 설정되지 않았습니다.')
  if (loadedKey && loadedKey !== normalized) throw new MapProviderError('AUTH_ERROR', 'Google Maps SDK 키 변경은 페이지 새로고침이 필요합니다.')
  if (window.google?.maps?.importLibrary) return window.google.maps
  if (sdkPromise) return sdkPromise
  loadedKey = normalized
  sdkPromise = new Promise<GoogleMaps>((resolve, reject) => {
    let finished = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => { if (timeout) clearTimeout(timeout); if (window.__tripPlannerGoogleReady === ready) delete window.__tripPlannerGoogleReady }
    const fail = (code: 'AUTH_ERROR' | 'PROVIDER_UNAVAILABLE', message: string) => {
      if (finished) return
      finished = true; cleanup(); document.getElementById(SCRIPT_ID)?.remove()
      sdkPromise = null; loadedKey = null
      reject(new MapProviderError(code, message))
    }
    const ready = () => {
      if (finished) return
      if (!window.google?.maps?.importLibrary) return fail('PROVIDER_UNAVAILABLE', 'Google Maps SDK 응답 형식이 올바르지 않습니다.')
      finished = true; cleanup(); resolve(window.google.maps)
    }
    window.__tripPlannerGoogleReady = ready
    window.gm_authFailure = () => fail('AUTH_ERROR', 'Google Maps API 키 또는 HTTP 리퍼러 제한을 확인해주세요.')
    const script = document.createElement('script')
    script.id = SCRIPT_ID; script.async = true
    script.onerror = () => fail('PROVIDER_UNAVAILABLE', 'Google Maps SDK를 불러오지 못했습니다.')
    const url = new URL('https://maps.googleapis.com/maps/api/js')
    url.searchParams.set('key', normalized)
    url.searchParams.set('loading', 'async')
    url.searchParams.set('v', 'weekly')
    url.searchParams.set('callback', '__tripPlannerGoogleReady')
    script.src = url.toString()
    timeout = setTimeout(() => fail('PROVIDER_UNAVAILABLE', 'Google Maps SDK 로드 시간이 초과되었습니다.'), 20000)
    document.head.appendChild(script)
  })
  return sdkPromise
}

export function googleError(error: unknown, fallback: string): MapProviderError {
  if (error instanceof MapProviderError) return error
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|429|quota/i.test(message)) return new MapProviderError('RATE_LIMITED', 'Google 지도 API 사용량 한도에 도달했습니다.', error)
  if (/REQUEST_DENIED|PERMISSION_DENIED|API key|billing|403|auth/i.test(message)) return new MapProviderError('AUTH_ERROR', 'Google 지도 API 인증 또는 사용 설정을 확인해주세요.', error)
  if (/INVALID_REQUEST|INVALID_ARGUMENT|400/i.test(message)) return new MapProviderError('INVALID_REQUEST', 'Google 지도 요청을 확인해주세요.', error)
  if (/network|fetch|timeout/i.test(message)) return new MapProviderError('NETWORK_ERROR', fallback, error)
  return new MapProviderError('PROVIDER_UNAVAILABLE', fallback, error)
}
