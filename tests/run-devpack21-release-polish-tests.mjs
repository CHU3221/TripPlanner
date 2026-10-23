import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { InMemoryTripSnapshotRepository } from '../server/repositories.mjs'
import { createEmptyTripSnapshot, validateTripSnapshot } from '../server/snapshotValidation.mjs'
import { createTripPlannerServer } from '../server/app.mjs'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}

await ok('PlacePicker uses one native form submit path and stores the user query fallback',async()=>{
  const source=await readFile('src/components/PlacePicker.tsx','utf8')
  assert.match(source,/<form className="place-search-row" onSubmit=/)
  assert.match(source,/button type="submit"/)
  assert.doesNotMatch(source,/onBlurCapture/)
  assert.match(source,/placeChoiceFromCandidate\(candidate,query\)/)
})

await ok('Trip open and revision polling are cache-only with no automatic provider metadata refresh',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const opens=[...app.matchAll(/hydrateProviderPlaces\([^\n]+mode:'([^']+)'/g)].map(match=>match[1])
  assert.ok(opens.length>=2)
  assert.ok(opens.every(mode=>mode==='CACHE_ONLY'))
  assert.doesNotMatch(app,/mode:'METADATA_ONLY'/)
})

await ok('user search label is persisted and accepted by server snapshot validation',async()=>{
  const codec=await readFile('src/persistence/snapshotCodec.ts','utf8')
  assert.match(codec,/userData\.searchLabel=place\.searchLabel/)
  assert.match(codec,/u\.name\?\?u\.searchLabel/)
  const snapshot=createEmptyTripSnapshot({tripId:'DP21-LABEL',name:'Label',mapProvider:'GOOGLE'})
  snapshot.places.push({id:'P',providerRef:{provider:'GOOGLE',id:'place-id'},userData:{searchLabel:'부산대'}})
  assert.equal(validateTripSnapshot(snapshot).places[0].userData.searchLabel,'부산대')
})

await ok('Google basemap POI click is separated from explicit add action',async()=>{
  const renderer=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  const map=await readFile('src/components/TripMap.tsx','utf8')
  assert.match(renderer,/event\?\.placeId/)
  assert.match(renderer,/handlers\.onPoiClick/)
  assert.match(map,/onAddPoi/)
  assert.match(map,/addPoi\('VISIT'\)/)
  assert.match(map,/addPoi\('NEARBY'\)/)
})

await ok('four placement areas participate in direct drag conversion',async()=>{
  const sidebar=await readFile('src/components/Sidebar.tsx','utf8')
  const timeline=await readFile('src/components/Timeline.tsx','utf8')
  const app=await readFile('src/App.tsx','utf8')
  for(const target of ['BUCKET','PLAN_B','BASE'])assert.match(sidebar,new RegExp(`target="${target}"`))
  assert.match(timeline,/onVisitPlacementDrop/)
  assert.match(app,/function moveVisitToPlacement/)
  assert.match(app,/function movePayloadToPlacement/)
  assert.match(app,/kind:'PLACEMENT_CONVERT'/)
})

await ok('admin can delete a Trip plan through repository and API',async()=>{
  const repo=new InMemoryTripSnapshotRepository()
  await repo.create(createEmptyTripSnapshot({tripId:'DELETE-ME',name:'Delete me',mapProvider:'GOOGLE'}))
  const server=createTripPlannerServer({tripRepository:repo})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  try{
    const base=`http://127.0.0.1:${server.address().port}`
    const response=await fetch(`${base}/api/trips/DELETE-ME`,{method:'DELETE'})
    assert.equal(response.status,200)
    assert.equal(await repo.load('DELETE-ME'),null)
  }finally{await new Promise(resolve=>server.close(resolve))}
  const home=await readFile('src/App.tsx','utf8')
  assert.match(home,/tripRepository\.delete\(trip\.tripId\)/)
  assert.match(home,/auth\.role==='ADMIN'/)
})

await ok('capture mode is an itinerary board with page keys and numbered visit markers',async()=>{
  const capture=await readFile('src/components/CaptureTimeline.tsx','utf8')
  const app=await readFile('src/App.tsx','utf8')
  assert.match(capture,/capture-(?:board|document)/)
  assert.match(capture,/capture-(?:agenda-list|itinerary-list)/)
  assert.match(capture,/ArrowLeft/);assert.match(capture,/ArrowRight/)
  assert.match(capture,/00:00–24:00|ui\.capture\.fullDay/)
  assert.match(app,/presentationNumbers/)
})

await ok('v0.21 UI uses design tokens and a glass sidebar shell',async()=>{
  const base=await readFile('src/styles/base.css','utf8'),panels=await readFile('src/styles/panels.css','utf8')
  assert.match(base,/--surface-glass/);assert.match(base,/--radius-md/);assert.match(base,/--shadow-md/)
  assert.match(panels,/\.bucket\{[\s\S]*backdrop-filter:blur\(18px\)/)
  assert.match(panels,/prefers-reduced-transparency/)
})

console.log(`\n${passed} devpack21 release-polish tests passed.`)
