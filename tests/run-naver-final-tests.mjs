import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

// Compile only the dependency-free contracts, application projections, and NAVER route adapter.
// Full React build needs the consuming project's React/Vite dependency installation.
const outDir = mkdtempSync(path.join(tmpdir(), 'tripplanner-naver-final-'))
let passed = 0
function ok(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('PASS', name) })
}
try {
  const args = ['--outDir', outDir, '--rootDir', '.', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node',
    '--resolveJsonModule', '--esModuleInterop', '--lib', 'ES2022,DOM', '--skipLibCheck',
    'src/map/appearanceConfig.ts', 'src/map/mapConnectionPrimitives.ts', 'src/map/provider/naver/NaverRouteProvider.ts',
    'src/providerData/cacheRepository.ts', 'src/persistence/contract.ts']
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0',...args], { stdio: 'pipe' })
  const require = createRequire(import.meta.url)
  const load = file => require(path.join(outDir, file))
  const { parseMapAppearanceConfig, MAP_APPEARANCE, appearanceForPath, appearanceForMarker } = load('src/map/appearanceConfig.js')
  const { buildMapPathProjection } = load('src/map/mapConnectionPrimitives.js')
  const { adjacentRoutePointError } = load('src/map/provider/naver/routeValidation.js')
  const { NaverRouteProvider } = load('src/map/provider/naver/NaverRouteProvider.js')
  const { saveProviderResponseIfAllowed, findUsableProviderCacheForTrip } = load('src/providerData/cacheRepository.js')
  const { resolveProviderCachePolicyConfig } = load('src/providerData/cachePolicy.js')
  const cfg = JSON.parse(readFileSync('config/provider-cache-policy.override.example.json', 'utf8'))
  const policy = resolveProviderCachePolicyConfig(cfg)
  const naverKey = { provider: 'NAVER', policyKey: 'NAVER.DIRECTIONS5.RESULT', subjectKey: 'a->b' }
  const googleKey = { provider: 'GOOGLE', policyKey: 'GOOGLE.PLACES.POSITION', subjectKey: 'place:X' }
  const start = { lat: 37.556, lng: 126.923 }, goal = { lat: 37.529, lng: 126.964 }
  const waypoint = { lat: 37.545, lng: 127.055 }
  await ok('appearance default matches old path styles', () => {
    assert.equal(MAP_APPEARANCE.paths.connection.stroke, 'DASHED')
    assert.equal(MAP_APPEARANCE.paths.majorTransport.stroke, 'SOLID')
    assert.equal(MAP_APPEARANCE.paths.autoRoute.color, '#1769E0')
    assert.equal(appearanceForPath({ id: 'c', points: [start, goal] }, 'connection').stroke, 'DASHED')
    assert.equal(appearanceForMarker({ id:'x', position:start }, 'regular').color, undefined)
  })
  await ok('appearance config validates color and dash, keeps semantic fields', () => {
    const config = parseMapAppearanceConfig({ schemaVersion:1, paths: { connection:{stroke:'SOLID',color:'#00AACC'}, majorTransport:{stroke:'DASHED',color:null}, autoRoute:{stroke:'SOLID',color:null} }, markers:{regular:{color:'#EE1234'},waypoint:{color:null},searchPreview:{color:null}} })
    const result = appearanceForPath({id:'a',points:[start,goal],direction:'FORWARD',emphasis:'STRONG'}, 'connection', config)
    assert.equal(result.stroke,'SOLID'); assert.equal(result.color,'#00AACC'); assert.equal(result.direction,'FORWARD')
    assert.throws(() => parseMapAppearanceConfig({ ...config, paths:{...config.paths,connection:{stroke:'DOT',color:null}} }))
    assert.throws(() => parseMapAppearanceConfig({ ...config, markers:{...config.markers,regular:{color:'red'}} }))
  })
  await ok('waypoint duplicate detection only rejects adjacent points', () => {
    assert.match(adjacentRoutePointError({origin:start,destination:goal,waypoints:[start,waypoint]}),/출발지/)
    assert.match(adjacentRoutePointError({origin:start,destination:goal,waypoints:[waypoint,waypoint]}),/연속된/)
    assert.match(adjacentRoutePointError({origin:start,destination:goal,waypoints:[goal]}),/마지막/)
    assert.equal(adjacentRoutePointError({origin:start,destination:goal,waypoints:[waypoint,start]}),null)
    assert.equal(adjacentRoutePointError({origin:start,destination:goal,waypoints:[]}),null)
  })
  await ok('NAVER duplicate request prevented before any network I/O', async () => {
    let called = false
    globalThis.window = { location: { origin:'http://localhost:5173' } }
    globalThis.fetch = async () => {called=true;return {ok:true,json: async () => ({code:0,route:{traoptimal:[]}})}}
    await assert.rejects(() => new NaverRouteProvider().findRoutes({origin:start,destination:goal,waypoints:[start],mode:'CAR'}), e=>e.code==='INVALID_REQUEST')
    assert.equal(called,false)
  })
  await ok('NAVER 400 is invalid request with actionable message', async () => {
    globalThis.fetch = async () => ({ok:false,status:400})
    await assert.rejects(() => new NaverRouteProvider().findRoutes({origin:start,destination:goal,mode:'CAR'}), e=>e.code==='INVALID_REQUEST'&&e.message.includes('경유지'))
  })
  await ok('NAVER normal route sends ordered waypoint coordinates', async () => {
    let query = null
    globalThis.fetch = async url => { query = new URL(url).searchParams; return {ok:true,json: async()=>({ code:0,route:{traoptimal:[{summary:{distance:3000,duration:900000},path:[[start.lng,start.lat],[goal.lng,goal.lat]]}]}})} }
    const routes=await new NaverRouteProvider().findRoutes({origin:start,destination:goal,waypoints:[waypoint],mode:'CAR'})
    assert.equal(query.get('waypoints'),`${waypoint.lng},${waypoint.lat}`)
    assert.equal(routes[0].durationMinutes,15)
  })
  await ok('NAVER cache reads and writes forbidden without touching repository', async () => {
    let read=0,write=0
    const repo={findForTrip:async()=>{read++;return null},findGlobal:async()=>{read++;return null},saveForTrip:async()=>{write++}}
    assert.equal(await saveProviderResponseIfAllowed(repo,'t',naverKey,'id',{foo:1},policy,1720000000000),false)
    assert.equal(await findUsableProviderCacheForTrip(repo,'t',naverKey,policy,1720000000000),undefined)
    assert.deepEqual({read,write},{read:0,write:0})
  })
  await ok('storage future allowed TTL uses authoritative timestamp, policy cannot be bypassed', async () => {
    const op=JSON.parse(JSON.stringify(cfg)); op.policies['GOOGLE.PLACES.POSITION'].ttlHours=720
    const allow=resolveProviderCachePolicyConfig(op)
    const records=[]
    const repo={saveForTrip:async(t,r)=>records.push({t,r})}
    assert.equal(await saveProviderResponseIfAllowed(repo,'t',googleKey,'id',{lat:37,lng:127},allow,1720000000000),true)
    assert.equal(records.length,1);assert.equal(records[0].r.fetchedAtEpochMs,1720000000000)
    assert.equal(await saveProviderResponseIfAllowed(repo,'t',{...googleKey,provider:'NAVER'},'id',{},allow,1720000000000),false)
    assert.equal(await saveProviderResponseIfAllowed(repo,'t',{...googleKey,policyKey:'GOOGLE.PLACES.NAME'},'id',{},allow,1720000000000),false)
  })
  await ok('existing Connection projected line appearance remains dashed, transport solid', () => {
    const places=[{id:'A',name:'A',position:start},{id:'B',name:'B',position:goal}]
    const visits=[{id:'v1',start:0,end:60,placeId:'A'},{id:'v2',start:90,end:180,placeId:'B'}]
    const projection=buildMapPathProjection(places,visits,[],{})
    assert.equal(projection.length,1)
    assert.equal(projection[0].primitive.stroke,'DASHED')
  })
  console.log(`\n${passed} tests passed.`)
} finally { rmSync(outDir, {recursive:true,force:true}) }
