import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'

function naverPlaceSearchDevBackend(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const hubClientId = env.NAVER_API_HUB_CLIENT_ID?.trim()
  const hubClientSecret = env.NAVER_API_HUB_CLIENT_SECRET?.trim()

  return {
    name: 'tripplanner-naver-place-search-dev-backend',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/api/map/naver/places') {
          next()
          return
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end(JSON.stringify({ message: 'Method not allowed.' }))
          return
        }

        const query = url.searchParams.get('query')?.trim() ?? ''
        if (!query) {
          res.statusCode = 400
          res.end(JSON.stringify({ message: '장소 검색어를 입력해주세요.' }))
          return
        }

        const useHub = !!hubClientId && !!hubClientSecret
        if (!useHub) {
          res.statusCode = 503
          res.end(JSON.stringify({
            message: '장소 검색 서버 설정을 확인해주세요.',
          }))
          return
        }

        const upstreamUrl = new URL('https://naverapihub.apigw.ntruss.com/search/v1/local')
        upstreamUrl.searchParams.set('query', query)
        upstreamUrl.searchParams.set('display', '5')
        upstreamUrl.searchParams.set('start', '1')
        upstreamUrl.searchParams.set('sort', 'random')
        upstreamUrl.searchParams.set('format', 'json')

        const headers = {
          'X-NCP-APIGW-API-KEY-ID': hubClientId!,
          'X-NCP-APIGW-API-KEY': hubClientSecret!,
          Accept: 'application/json',
        }

        try {
          const upstream = await fetch(upstreamUrl, { headers })
          const body = await upstream.text()
          res.statusCode = upstream.status
          res.end(body)
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ message: '장소 검색 서버에 연결하지 못했습니다.' }))
        }
      })
    },
  }
}


function naverRouteDevBackend(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const mapsClientId = (env.NAVER_MAP_CLIENT_ID || env.VITE_NAVER_MAP_CLIENT_ID)?.trim()
  const mapsClientSecret = env.NAVER_MAP_CLIENT_SECRET?.trim()

  return {
    name: 'tripplanner-naver-route-dev-backend',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname !== '/api/map/naver/routes') { next(); return }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ message: 'Method not allowed.' })); return }
        if (url.searchParams.get('mode') !== 'CAR') { res.statusCode = 400; res.end(JSON.stringify({ message: '지원하지 않는 경로 모드입니다.' })); return }
        const start = url.searchParams.get('start')?.trim() ?? ''
        const goal = url.searchParams.get('goal')?.trim() ?? ''
        const waypointText = url.searchParams.get('waypoints')?.trim() ?? ''
        const validCoord = (value: string) => {
          const parts = value.split(',')
          if (parts.length !== 2 || parts.some(part => !part.trim())) return false
          const [lng, lat] = parts.map(Number)
          return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90
        }
        const waypoints = waypointText ? waypointText.split('|') : []
        if (!validCoord(start) || !validCoord(goal) || waypoints.length > 5 || !waypoints.every(validCoord)) {
          res.statusCode = 400
          res.end(JSON.stringify({ message: '출발지/도착지 좌표 또는 경유지(최대 5개)가 올바르지 않습니다.' }))
          return
        }
        if (!mapsClientId || !mapsClientSecret) { res.statusCode = 503; res.end(JSON.stringify({ message: '경로 검색 서버 설정을 확인해주세요.' })); return }

        const upstreamUrl = new URL('https://maps.apigw.ntruss.com/map-direction/v1/driving')
        upstreamUrl.searchParams.set('start', start)
        upstreamUrl.searchParams.set('goal', goal)
        if (waypoints.length) upstreamUrl.searchParams.set('waypoints', waypoints.join('|'))
        upstreamUrl.searchParams.set('option', 'traoptimal')
        try {
          const upstream = await fetch(upstreamUrl, { headers: {
            'x-ncp-apigw-api-key-id': mapsClientId,
            'x-ncp-apigw-api-key': mapsClientSecret,
            Accept: 'application/json',
          } })
          const body = await upstream.text()
          res.statusCode = upstream.status
          res.end(body)
        } catch {
          res.statusCode = 502
          res.end(JSON.stringify({ message: '경로 검색 서버에 연결하지 못했습니다.' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), naverPlaceSearchDevBackend(mode), naverRouteDevBackend(mode)],
  server: {
    proxy: {
      '/api/trips': 'http://127.0.0.1:8787',
      '/api/health': 'http://127.0.0.1:8787',
      '/api/auth': 'http://127.0.0.1:8787',
      '/api/runtime-config': 'http://127.0.0.1:8787',
      '/api/admin': 'http://127.0.0.1:8787',
    },
  },
}))
