import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const output = mkdtempSync(path.join(tmpdir(), 'trip-route-cache-reorder-'))
try {
  // These tests exercise the actual TypeScript implementation without a browser,
  // a network request or a Google Maps API key.
  const localTsc = 'node_modules/typescript/bin/tsc'
  const arguments_ = [
    '--outDir',output,'--rootDir','.','--target','ES2022',
    '--module','commonjs','--moduleResolution','node','--skipLibCheck',
    'src/connectionRuntime.ts',
  ]
  if (existsSync(localTsc)) execFileSync(process.execPath,[localTsc,'--ignoreConfig','--ignoreDeprecations','6.0',...arguments_],{stdio:'pipe'})
  else execFileSync('tsc',arguments_,{stdio:'pipe'})
  const require = createRequire(import.meta.url)
  const { savedRouteCacheRequests, savedConnectionRouteRequest, routeRequestKey, routeRuntimeMatches } = require(path.join(output,'src/connectionRuntime.js'))
  const positions = {
    'place-1':{lat:35.10,lng:129.10},
    'place-2':{lat:35.20,lng:129.20},
    'place-3':{lat:35.30,lng:129.30},
    'waypoint':{lat:35.15,lng:129.15},
  }
  const places = Object.entries(positions).map(([id,position])=>({id,name:id,position}))
  const order = (ids)=>ids.map((id,index)=>({id,placeId:`place-${id}`,start:index*60,end:index*60+30}))
  const pair12 = 'VISIT:1__VISIT:2'
  const plans = {
    [pair12]:{id:pair12,fromNodeKey:'VISIT:1',toNodeKey:'VISIT:2',source:'ROUTE_API',segments:[],routeIntent:{provider:'GOOGLE',mode:'TRANSIT',option:'mock-transit-1',waypointPlaceIds:['waypoint']}},
  }
  const restored=(visits,ps=plans,pl=places,provider='GOOGLE')=>savedRouteCacheRequests(ps,visits,[],pl,provider)
  const original=restored(order(['1','2','3']))
  assert.equal(original.length,1)
  assert.equal(original[0].pairId,pair12)
  assert.equal(original[0].request.mode,'TRANSIT')
  assert.equal(original[0].option,'mock-transit-1')
  assert.deepEqual(original[0].request.waypoints,[positions.waypoint])
  console.log('PASS 1→2→3: a saved 1→2 transit route is selected for cache hydration')

  // Regression: the previous algorithm walked only *current* adjacent pairs,
  // discarding a saved 1→2 route while the order was 1→3→2.
  const rearranged=restored(order(['1','3','2']))
  assert.deepEqual(rearranged,original)
  console.log('PASS 1→3→2: the temporarily non-adjacent 1→2 route is still hydrated')

  // While the route is inactive the Timeline/Map render only currently adjacent
  // pairs, so this result is dormant until 1→2 becomes adjacent again.
  const cached={requestKey:routeRequestKey(rearranged[0].request),request:rearranged[0].request,route:{id:'mock-transit-1',mode:'TRANSIT',durationMinutes:38}}
  assert.equal(routeRuntimeMatches(cached,original[0].request,original[0].option),true)
  assert.equal(restored(order(['1','2','3']))[0].pairId,pair12)
  console.log('PASS 1→3→2 → reload → 1→2→3: the cached candidate still matches without a provider request')

  assert.deepEqual(restored(order(['1','3','2']),plans,places,'NAVER'),[])
  assert.deepEqual(restored(order(['1','3','2']),{[pair12]:{...plans[pair12],source:'MANUAL'} }),[])
  assert.deepEqual(restored(order(['1','3','2']),{[pair12]:{...plans[pair12],fromNodeKey:'VISIT:3'}}),[])
  assert.deepEqual(restored(order(['1','3','2']),plans,places.filter(p=>p.id!=='waypoint')),[])
  assert.deepEqual(restored(order(['1','3','2']),plans,places.filter(p=>p.id!=='place-2')),[])
  console.log('PASS wrong provider, manual connections, mismatched IDs and missing locations are excluded')

  const changedPositions=places.map(place=>place.id==='place-2'?{...place,position:{lat:35.25,lng:129.25}}:place)
  const changed=restored(order(['1','3','2']),plans,changedPositions)
  assert.equal(changed.length,1)
  assert.notEqual(routeRequestKey(changed[0].request),cached.requestKey)
  assert.equal(routeRuntimeMatches(cached,changed[0].request,'mock-transit-1'),false)
  assert.equal(routeRuntimeMatches(cached,original[0].request,'a-different-option'),false)
  console.log('PASS changed coordinates or selected alternative cannot reuse a stale route')

  const app=readFileSync('src/App.tsx','utf8')
  assert.match(app,/if\(routeCacheTtlHours===0\)return \{\}/)
  assert.match(app,/const requests=savedRouteCacheRequests\(/)
  assert.match(app,/readRouteCandidatesCache\(/)
  assert.match(app,/option\?cached\.value\.find\(candidate=>candidate\.id===option\)/)
  console.log('PASS TTL=0 still skips restoration; inactive plans are hydrated through cache-only GET')
} finally { rmSync(output,{recursive:true,force:true}) }
