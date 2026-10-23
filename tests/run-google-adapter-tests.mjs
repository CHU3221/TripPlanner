import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const out = mkdtempSync(path.join(tmpdir(), 'trip-google-tests-'))
let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0','--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--lib','ES2022,DOM','--skipLibCheck',
    'src/map/provider/google/GooglePlaceSearchProvider.ts','src/map/provider/google/GoogleRouteProvider.ts','src/map/provider/composition.ts'], {stdio:'pipe'})
  const req = createRequire(import.meta.url)
  const load = name => req(path.join(out,name))
  const {createGoogleProvider} = load('src/map/provider/google/createGoogleProvider.js')
  const calls = []
  let tokenCounter=0
  class AutocompleteSessionToken { constructor(){this.id=++tokenCounter} }
  const autoPrediction={
    placeId:'auto1',
    mainText:{toString:()=> 'Tokyo Station'},
    secondaryText:{toString:()=> 'Marunouchi, Tokyo'},
    toPlace(){
      const place={id:'auto1',formattedAddress:undefined,location:undefined}
      place.fetchFields=async opts=>{calls.push(['details',opts]);place.formattedAddress='Tokyo Station, Tokyo';place.location={lat:()=>35.6812,lng:()=>139.7671}}
      return place
    },
  }
  globalThis.window = {google:{maps:{importLibrary:async name => {
    if (name === 'places') return {
      AutocompleteSessionToken,
      AutocompleteSuggestion:{
        fetchAutocompleteSuggestions:async opts=>{
          calls.push(['autocomplete',opts])
          return {suggestions:[{placePrediction:autoPrediction}]}
        },
      },
      Place:{
        searchByText:async opts => {
          calls.push(['place',opts])
          return {places:[{id:'pid1',displayName:'Tokyo Station',formattedAddress:'Tokyo',location:{lat:()=>35.68,lng:()=>139.76}}]}
        },
      },
    }
    if (name === 'geocoding') return {Geocoder:class {async geocode(o){calls.push(['address',o]);return {results:[{formatted_address:'Tokyo',geometry:{location:{lat:()=>35.68,lng:()=>139.76}},place_id:'pid2'}]}}}}
    if (name === 'routes') return {Route:{computeRoutes:async opts=>{calls.push(['route',opts]);return {routes:[{description:`${opts.travelMode} 추천`,durationMillis:660000,distanceMeters:1000,path:[{lat:35,lng:139},{lat:36,lng:140}]}]}}}}
    throw Error(`Unexpected ${name}`)
  }}}}
  const provider = createGoogleProvider('browser-key')

  await ok('Google place search keeps provider reference and requested fields',async()=>{
    const places = await provider.places.searchPlaces('station')
    assert.equal(places[0].provider,'GOOGLE')
    assert.deepEqual(places[0].sourceRef,{provider:'GOOGLE',id:'pid1'})
    assert.deepEqual(calls[0][1].fields,['id','displayName','formattedAddress','location'])
  })

  await ok('Google autocomplete reuses one session token and measures suggestions/details separately',async()=>{
    const session=await provider.places.createAutocompleteSession()
    const beforeAuto=calls.filter(x=>x[0]==='autocomplete').length
    const beforeDetails=calls.filter(x=>x[0]==='details').length
    const first=await session.suggest('Tok')
    await session.suggest('Tokyo')
    const autoCalls=calls.filter(x=>x[0]==='autocomplete').slice(beforeAuto)
    assert.equal(autoCalls.length,2)
    assert.equal(autoCalls[0][1].sessionToken,autoCalls[1][1].sessionToken)
    assert.equal(calls.filter(x=>x[0]==='details').length,beforeDetails)
    const candidate=await session.select(first[0])
    const detailCalls=calls.filter(x=>x[0]==='details').slice(beforeDetails)
    assert.equal(detailCalls.length,1)
    assert.deepEqual(detailCalls[0][1].fields,['id','formattedAddress','location'])
    assert.equal(candidate.name,'Tokyo Station')
    assert.deepEqual(candidate.sourceRef,{provider:'GOOGLE',id:'auto1'})
    assert.deepEqual(candidate.position,{lat:35.6812,lng:139.7671})
  })

  await ok('abandoned Google autocomplete session never calls Place Details and next session gets a fresh token',async()=>{
    const beforeDetails=calls.filter(x=>x[0]==='details').length
    const sessionA=await provider.places.createAutocompleteSession();await sessionA.suggest('Os');sessionA.cancel()
    const tokenA=calls.filter(x=>x[0]==='autocomplete').at(-1)[1].sessionToken
    const sessionB=await provider.places.createAutocompleteSession();await sessionB.suggest('Osa')
    const tokenB=calls.filter(x=>x[0]==='autocomplete').at(-1)[1].sessionToken
    assert.notEqual(tokenA,tokenB)
    assert.equal(calls.filter(x=>x[0]==='details').length,beforeDetails)
  })

  await ok('Google geocoding normalizes address coordinate',async()=>{
    const address = await provider.places.searchAddress('Tokyo')
    assert.equal(address[0].position.lat,35.68)
  })

  await ok('Google CAR maps to one DRIVING ComputeRoutes call with waypoint',async()=>{
    const before=calls.filter(x=>x[0]==='route').length
    const routes = await provider.routes.findRoutes({origin:{lat:35,lng:139},destination:{lat:36,lng:140},waypoints:[{lat:35.5,lng:139.5}],mode:'CAR'})
    const routeCalls=calls.filter(x=>x[0]==='route')
    assert.equal(routeCalls.length,before+1)
    assert.equal(routeCalls.at(-1)[1].travelMode,'DRIVING')
    assert.deepEqual(routeCalls.at(-1)[1].intermediates,[{location:{lat:35.5,lng:139.5}}])
    assert.equal(routes[0].mode,'CAR');assert.equal(routes[0].durationMinutes,11)
  })

  await ok('Google WALK maps to exactly one WALKING ComputeRoutes call',async()=>{
    const before=calls.filter(x=>x[0]==='route').length
    const routes=await provider.routes.findRoutes({origin:{lat:35,lng:139},destination:{lat:36,lng:140},mode:'WALK'})
    const routeCalls=calls.filter(x=>x[0]==='route')
    assert.equal(routeCalls.length,before+1)
    assert.equal(routeCalls.at(-1)[1].travelMode,'WALKING')
    assert.equal(routes[0].mode,'WALK')
  })

  await ok('Google TRANSIT maps to exactly one TRANSIT ComputeRoutes call',async()=>{
    const before=calls.filter(x=>x[0]==='route').length
    const routes=await provider.routes.findRoutes({origin:{lat:35,lng:139},destination:{lat:36,lng:140},mode:'TRANSIT'})
    const routeCalls=calls.filter(x=>x[0]==='route')
    assert.equal(routeCalls.length,before+1)
    assert.equal(routeCalls.at(-1)[1].travelMode,'TRANSIT')
    assert.equal(routes[0].mode,'TRANSIT')
  })

  await ok('Google TRANSIT waypoint request is rejected before ComputeRoutes',async()=>{
    const before=calls.filter(x=>x[0]==='route').length
    await assert.rejects(()=>provider.routes.findRoutes({origin:{lat:35,lng:139},destination:{lat:36,lng:140},waypoints:[{lat:35.5,lng:139.5}],mode:'TRANSIT'}), e=>e.code==='NOT_SUPPORTED')
    assert.equal(calls.filter(x=>x[0]==='route').length,before)
  })

  await ok('Google blank place query fails closed',async()=>{
    await assert.rejects(()=>provider.places.searchPlaces(' '), e=>e.code==='INVALID_REQUEST')
  })

  console.log(`\n${passed} Google adapter mock tests passed.`)
} finally {rmSync(out,{recursive:true,force:true})}
