import { MapProviderError } from '../contract'

export type NaverMaps = any

declare global {
  interface Window {
    naver?: { maps: NaverMaps }
    navermap_authFailure?: () => void
    __tripPlannerNaverMapsReady?: () => void
  }
}

const SDK_ID = 'tripplanner-naver-maps-sdk'
const SDK_CALLBACK = '__tripPlannerNaverMapsReady'
let sdkPromise: Promise<NaverMaps> | null = null

/**
 * Shared NAVER Maps JS SDK boundary for NAVER provider implementations.
 *
 * The geocoder submodule is loaded together with the core SDK so renderer and
 * address search share one script / one browser-safe Maps Client ID.
 */
export function loadNaverMaps(clientId: string): Promise<NaverMaps> {
  if (window.naver?.maps?.Service?.geocode) return Promise.resolve(window.naver.maps)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null
    let settled = false

    const cleanupCallbacks = () => {
      if (window.__tripPlannerNaverMapsReady === onReady) delete window.__tripPlannerNaverMapsReady
    }

    const succeed = () => {
      if (settled) return
      if (!window.naver?.maps?.Service?.geocode) {
        fail('PROVIDER_UNAVAILABLE', 'NAVER Maps SDK가 로드되었지만 주소 검색 모듈을 찾지 못했습니다.')
        return
      }
      settled = true
      cleanupCallbacks()
      resolve(window.naver.maps)
    }

    const fail = (code: 'AUTH_ERROR' | 'PROVIDER_UNAVAILABLE', message: string, cause?: unknown) => {
      if (settled) return
      settled = true
      cleanupCallbacks()
      document.getElementById(SDK_ID)?.remove()
      sdkPromise = null
      reject(new MapProviderError(code, message, cause))
    }

    const onReady = () => succeed()
    const onError = (event: Event) => fail('PROVIDER_UNAVAILABLE', 'NAVER Maps SDK를 불러오지 못했습니다.', event)

    window.navermap_authFailure = () => fail(
      'AUTH_ERROR',
      'NAVER Dynamic Map 인증에 실패했습니다. Client ID와 Web Service URL을 확인하세요.',
    )

    // A page that already loaded the old core-only script (for example through
    // HMR) must reload once before address search can use Service.geocode.
    if (window.naver?.maps && !window.naver.maps.Service?.geocode) {
      fail('PROVIDER_UNAVAILABLE', 'NAVER 주소 검색 모듈이 로드되지 않았습니다. 페이지를 새로고침해주세요.')
      return
    }

    if (existing) {
      // If another loader inserted the script and it is still loading, listen
      // before waiting. A completed script should already have populated naver.
      existing.addEventListener('load', succeed, { once: true })
      existing.addEventListener('error', onError, { once: true })
      queueMicrotask(() => {
        if (window.naver?.maps?.Service?.geocode) succeed()
      })
      return
    }

    const script = document.createElement('script')
    script.id = SDK_ID
    script.async = true

    // NAVER's callback fires after the requested submodules are ready. Register
    // it before appending the script so a fast/cached load cannot race us.
    window.__tripPlannerNaverMapsReady = onReady
    script.addEventListener('error', onError, { once: true })
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder&callback=${SDK_CALLBACK}`
    document.head.appendChild(script)
  })

  return sdkPromise
}
