import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const outDir = mkdtempSync(path.join(tmpdir(), 'tripplanner-pre-google-'))
let passed = 0
function ok(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log('PASS', name) })
}
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0',
    '--outDir', outDir, '--rootDir', '.', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node',
    '--resolveJsonModule', '--esModuleInterop', '--lib', 'ES2022,DOM', '--skipLibCheck',
    'src/map/placeProjection.ts', 'src/placeDraft.ts', 'src/map/provider/composition.ts',
    'src/connectionRuntime.ts', 'src/persistence/contract.ts',
  ], { stdio: 'pipe' })
  const require = createRequire(import.meta.url)
  const load = file => require(path.join(outDir, file))
  const { collectStrongPlaceIds, collectActiveWaypointPlaceIds, collectVisiblePlaceIds } = load('src/map/placeProjection.js')
  const { placeChoiceFromCandidate, patchNewPlaceChoiceAsUser, materializeNewPlaceChoice } = load('src/placeDraft.js')
  const { parseTripMapRoute, createTripMapProvider } = load('src/map/provider/composition.js')
  const { savedConnectionRouteRequest } = load('src/connectionRuntime.js')

  await ok('orphan TripPlace stays durable but is absent from visible map projection', () => {
    const strong = collectStrongPlaceIds([], [], [], [])
    const visible = collectVisiblePlaceIds([], [], [], [], {}, new Set())
    assert.equal(strong.size, 0)
    assert.equal(visible.has('orphan'), false)
  })

  await ok('active schedule roles keep one Place visible', () => {
    const bucket=[{id:'b',placeId:'P',meta:'x'}]
    const visible=collectVisiblePlaceIds(bucket,[],[],[],{},new Set())
    assert.equal(visible.has('P'),true)
  })

  await ok('inactive Connection waypoints do not keep Pins visible', () => {
    const plans={inactive:{id:'inactive',fromNodeKey:'a',toNodeKey:'b',source:'MANUAL',segments:[{id:'s1',mode:'WALK',minutes:5,waypointPlaceId:'W'},{id:'s2',mode:'WALK',minutes:5}]}}
    assert.equal(collectActiveWaypointPlaceIds(plans,new Set()).has('W'),false)
    assert.equal(collectVisiblePlaceIds([],[],[],[],plans,new Set()).has('W'),false)
    assert.equal(collectActiveWaypointPlaceIds(plans,new Set(['inactive'])).has('W'),true)
  })

  await ok('provider candidate provenance survives materialization without requiring providerRef', () => {
    const candidate={provider:'NAVER',name:'국립중앙박물관',address:'서울',position:{lat:37.5,lng:126.9}}
    const choice=placeChoiceFromCandidate(candidate)
    const place=materializeNewPlaceChoice(choice,'P')
    assert.equal(place.providerRef,undefined)
    assert.deepEqual(place.provenance.name,{source:'PROVIDER',provider:'NAVER'})
    assert.deepEqual(place.provenance.address,{source:'PROVIDER',provider:'NAVER'})
    assert.deepEqual(place.provenance.position,{source:'PROVIDER',provider:'NAVER'})
  })

  await ok('manual edit flips only edited provider field to USER', () => {
    const choice=placeChoiceFromCandidate({provider:'GOOGLE',name:'Old',address:'Addr',position:{lat:1,lng:2},sourceRef:{provider:'GOOGLE',id:'pid'}})
    const edited=patchNewPlaceChoiceAsUser(choice,{name:'My name'})
    const place=materializeNewPlaceChoice(edited,'P')
    assert.deepEqual(place.provenance.name,{source:'USER'})
    assert.deepEqual(place.provenance.address,{source:'PROVIDER',provider:'GOOGLE'})
    assert.deepEqual(place.provenance.position,{source:'PROVIDER',provider:'GOOGLE'})
    assert.equal(place.providerRef.id,'pid')
  })

  await ok('final trip URL namespaces bind provider identity', () => {
    assert.deepEqual(parseTripMapRoute('/nav/seoul-1'),{tripId:'seoul-1',mapProvider:'NAVER'})
    assert.deepEqual(parseTripMapRoute('/goo/tokyo%202'),{tripId:'tokyo 2',mapProvider:'GOOGLE'})
    assert.equal(parseTripMapRoute('/lobby'),null)
    assert.equal(parseTripMapRoute('/nav/'),null)
  })

  await ok('GOOGLE composition exposes implemented adapter without altering NAVER', () => {
    const provider=createTripMapProvider('GOOGLE',{naverClientId:''})
    assert.equal(provider.id,'GOOGLE')
    assert.equal(provider.capabilities.placeSearch,true)
    assert.equal(provider.capabilities.addressSearch,true)
    assert.equal(provider.capabilities.routes.car,true)
    assert.equal(provider.capabilities.routes.walk,true)
    assert.equal(provider.capabilities.routes.transit,true)
    assert.equal(createTripMapProvider('NAVER',{naverClientId:'id'}).id,'NAVER')
  })

  await ok('saved route intent is provider-neutral and Core imposes no NAVER waypoint count', () => {
    const places=[{id:'A',name:'A',position:{lat:1,lng:1}},{id:'B',name:'B',position:{lat:2,lng:2}},...Array.from({length:6},(_,i)=>({id:`W${i}`,name:`W${i}`,position:{lat:1.1+i*.01,lng:1.1+i*.01}}))]
    const pair={from:{type:'VISIT',id:'a',key:'a',start:0,end:10,exitPlaceId:'A',title:'A'},to:{type:'VISIT',id:'b',key:'b',start:20,end:30,entryPlaceId:'B',title:'B'}}
    const plan={id:'x',fromNodeKey:'a',toNodeKey:'b',source:'ROUTE_API',segments:[],routeIntent:{provider:'GOOGLE',mode:'WALK',waypointPlaceIds:Array.from({length:6},(_,i)=>`W${i}`)}}
    const request=savedConnectionRouteRequest(pair,places,plan)
    assert.equal(request.mode,'WALK')
    assert.equal(request.waypoints.length,6)
  })

  console.log(`\n${passed} pre-Google Core tests passed.`)
} finally {
  rmSync(outDir,{recursive:true,force:true})
}
