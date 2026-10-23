import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const out = mkdtempSync(path.join(tmpdir(), 'trip-transit-tests-'))
let passed = 0
const ok = async (name, fn) => { await fn(); passed++; console.log('PASS', name) }
try {
  symlinkSync(path.resolve('node_modules'), path.join(out,'node_modules'), 'dir')
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0', '--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--jsx','react-jsx','--esModuleInterop','--lib','ES2022,DOM','--skipLibCheck',
    'src/map/provider/google/GoogleRouteProvider.ts','src/components/TransitRouteDetails.tsx'], {stdio:'pipe'})
  const req = createRequire(import.meta.url)
  const load = name => req(path.join(out,name))
  const { GoogleRouteProvider } = load('src/map/provider/google/GoogleRouteProvider.js')
  const { normalizeGoogleTransitSteps } = load('src/map/provider/google/normalizeGoogleTransit.js')
  const { TransitRouteDetails } = load('src/components/TransitRouteDetails.js')
  const { createElement } = req('react')
  const { renderToStaticMarkup } = req('react-dom/server')
  const calls = []
  let routeResponse
  globalThis.window = {google:{maps:{importLibrary:async name => {
    assert.equal(name,'routes')
    return {Route:{computeRoutes:async opts => { calls.push(opts); return routeResponse }}}
  }}}}
  const provider = new GoogleRouteProvider('browser-key')
  const query = {origin:{lat:37.55,lng:126.92},destination:{lat:37.53,lng:126.96},mode:'TRANSIT'}
  const mockSteps = [
    {travelMode:'WALKING',instructions:'홍대입구역으로 이동',staticDurationMillis:180000,distanceMeters:210},
    {travelMode:'TRANSIT',staticDurationMillis:600000,distanceMeters:3000,transitDetails:{
      departureStop:{name:'홍대입구역'},arrivalStop:{name:'용산역'},headsign:'용문',stopCount:3,
      departureTime:new Date('2026-10-16T02:20:00.000Z'),arrivalTime:new Date('2026-10-16T02:30:00.000Z'),
      transitLine:{name:'경의중앙선',shortName:'경의중앙',vehicle:{vehicleType:'HEAVY_RAIL',name:'Commuter rail'}}}},
    {travelMode:'WALKING',instructions:'아이파크몰까지 이동',staticDurationMillis:300000,distanceMeters:190},
  ]
  routeResponse = {routes:[{description:'추천',durationMillis:1080000,distanceMeters:3400,path:[{lat:37.55,lng:126.92},{lat:37.53,lng:126.96}],legs:[{steps:mockSteps}]}]}

  await ok('TRANSIT requests legs via ONE ComputeRoutes request',async()=>{
    const routes=await provider.findRoutes(query)
    assert.equal(calls.length,1)
    assert.equal(calls[0].travelMode,'TRANSIT')
    assert.ok(calls[0].fields.includes('legs'))
    assert.equal(routes.length,1)
    assert.equal(routes[0].durationMinutes,18)
    assert.equal(routes[0].transitSteps.length,3)
    assert.equal(routes[0].transitSteps[1].departureStop,'홍대입구역')
    assert.equal(routes[0].transitSteps[1].arrivalStop,'용산역')
    assert.equal(routes[0].transitSteps[1].headsign,'용문')
    assert.equal(routes[0].transitSteps[1].lineName,'경의중앙선')
    assert.equal(routes[0].transitSteps[1].stopCount,3)
    assert.equal(routes[0].transitSteps[1].departureAt,'2026-10-16T02:20:00.000Z')
  })

  await ok('walk and transit steps are both shown as native mode icons without invented stops',async()=>{
    const steps=normalizeGoogleTransitSteps([{steps:mockSteps}])
    const markup=renderToStaticMarkup(createElement(TransitRouteDetails,{steps}))
    for(const keyword of ['홍대입구역','용산역','경의중앙선','용문 방면','아이파크몰까지 이동','directions_walk','train'])
      assert.ok(markup.includes(keyword),keyword)
    assert.equal(steps[0].departureStop,undefined)
  })

  await ok('TRANSIT missing detailed steps remains a valid summary candidate',async()=>{
    routeResponse={routes:[{durationMillis:1200000,distanceMeters:5000,path:[{lat:37.55,lng:126.92},{lat:37.53,lng:126.96}]}]}
    const candidate=(await provider.findRoutes(query))[0]
    assert.equal(candidate.transitSteps,undefined)
    const markup=renderToStaticMarkup(createElement(TransitRouteDetails,{steps:candidate.transitSteps}))
    assert.match(markup,/제공된 구간별 승하차 안내가 없습니다/)
  })

  await ok('missing stops/times are never fabricated, invalid dates omitted',async()=>{
    const result=normalizeGoogleTransitSteps([{steps:[{travelMode:'TRANSIT',transitDetails:{transitLine:{shortName:'700'},departureTime:'invalid'}}]}])
    assert.equal(result[0].lineShortName,'700')
    assert.equal(result[0].arrivalStop,undefined)
    assert.equal(result[0].departureAt,undefined)
  })

  await ok('empty route response is no-route without automatic retry',async()=>{
    const before=calls.length
    routeResponse={routes:[]}
    assert.deepEqual(await provider.findRoutes(query),[])
    assert.equal(calls.length,before+1)
  })

  await ok('invalid API route duration raises provider error, not a false no-route message',async()=>{
    routeResponse={routes:[{description:'bad data',legs:[]}]}
    await assert.rejects(()=>provider.findRoutes(query),e=>e.code==='PROVIDER_UNAVAILABLE')
  })

  await ok('CAR/WALK masks do not request transit details',async()=>{
    routeResponse={routes:[{durationMillis:600000,distanceMeters:3000}]}
    for (const mode of ['CAR','WALK']) {
      const candidate=(await provider.findRoutes({...query,mode}))[0]
      assert.equal(candidate.transitSteps,undefined)
      assert.ok(!calls.at(-1).fields.includes('legs'))
    }
  })

  await ok('timeline uses saved mode rather than a hard-coded CAR icon',async()=>{
    const source=readFileSync('src/components/Timeline.tsx','utf8')
    assert.match(source,/routeModeIcon\(plan\?\.routeIntent\?\.mode/)
  })

  await ok('runtime-only details absent from all persistent domain and snapshot types',async()=>{
    const targets=['src/model.ts','src/persistence/contract.ts','src/connectionRuntime.ts','src/domain/trip.ts']
    for(const name of targets){
      const source=readFileSync(name,'utf8')
      assert.ok(!source.includes('transitSteps'),`${name} must not contain transitSteps`)
    }
  })
  console.log(`\n${passed} devpack10.1 transit tests passed.`)
} finally {rmSync(out,{recursive:true,force:true})}
