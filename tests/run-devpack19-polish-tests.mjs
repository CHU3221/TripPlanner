import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ServerConfigStore } from '../server/configStore.mjs'
import { ProviderCacheService } from '../server/providerCacheService.mjs'
import { InMemoryProviderCacheRepository, InMemoryTripSnapshotRepository } from '../server/repositories.mjs'
import { createEmptyTripSnapshot } from '../server/snapshotValidation.mjs'
import { createTripPlannerServer } from '../server/app.mjs'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}

await ok('explicit place search has no 300 ms autocomplete debounce',async()=>{
  const source=await readFile('src/components/PlacePicker.tsx','utf8')
  assert.match(source,/Provider network requests only start after Search\/Enter/)
  assert.match(source,/<form className="place-search-row" onSubmit=/)
  assert.match(source,/button type="submit"/)
  assert.doesNotMatch(source,/onBlurCapture/)
  assert.doesNotMatch(source,/setTimeout\([^\n]*300|300\s*ms|debounce/i)
})

await ok('Trip open never automatically refreshes provider pin positions',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const hydration=await readFile('src/persistence/providerHydration.ts','utf8')
  assert.match(app,/mode:'CACHE_ONLY'/)
  assert.doesNotMatch(app,/mode:'METADATA_ONLY'/)
  assert.match(hydration,/const requestPosition=mode==='FULL'&&needsPosition/)
  assert.match(hydration,/refreshProviderPlacePositions/)
  assert.match(hydration,/allowGeocodingFallback:false/)
  assert.match(app,/onRefreshPins/)
  assert.match(app,/UX_PIN_REFRESH/)
})

await ok('revision polling uses server revision plus CACHE_ONLY hydration',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const repo=await readFile('src/persistence/httpTripRepository.ts','utf8')
  assert.match(repo,/\/revision/)
  assert.match(app,/setInterval\(\(\)=>void check\(\),10_?000\)/)
  assert.match(app,/mode:'CACHE_ONLY'/)
  assert.match(app,/remoteRevisionAvailable/)
})

await ok('revision endpoint returns only the current revision',async()=>{
  const trips=new InMemoryTripSnapshotRepository()
  const created=await trips.create(createEmptyTripSnapshot({tripId:'REV',name:'Revision',mapProvider:'GOOGLE'}))
  const server=createTripPlannerServer({tripRepository:trips})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  try{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/trips/REV/revision`)
    assert.equal(r.status,200)
    const body=await r.json();assert.deepEqual(body,{revision:created.revision})
  }finally{await new Promise(resolve=>server.close(resolve))}
})

await ok('dormant retention can be extended without changing original fetchedAt',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'tripplanner-dp19-cache-'))
  try{
    mkdirSync(path.join(root,'config'),{recursive:true})
    const store=new ServerConfigStore(root,{})
    const repo=new InMemoryProviderCacheRepository()
    let now=2_000_000_000_000
    const service=new ProviderCacheService({repository:repo,configStore:store,now:()=>now})
    let cfg=store.cachePolicyStatus().operatorConfig
    cfg.policies['GOOGLE.PLACES.POSITION']={ttlHours:360,retentionHours:480}
    store.setProviderCachePolicy(cfg)
    const put=await service.put('T',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:p',value:{lat:37.5,lng:127}})
    assert.equal(put.stored,true);const originalFetchedAt=put.fetchedAtEpochMs

    now+=400*3600000
    let hit=await service.get('T',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:p'})
    assert.equal(hit.hit,false);assert.equal(hit.evaluation.dormant,true);assert.equal((await service.purge()).length,0)

    cfg=store.cachePolicyStatus().operatorConfig
    cfg.policies['GOOGLE.PLACES.POSITION']={ttlHours:720,retentionHours:720}
    store.setProviderCachePolicy(cfg)
    hit=await service.get('T',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:p'})
    assert.equal(hit.hit,true);assert.equal(hit.fetchedAtEpochMs,originalFetchedAt)
  }finally{rmSync(root,{recursive:true,force:true})}
})

await ok('purged dormant data cannot be resurrected by later retention expansion',async()=>{
  const root=mkdtempSync(path.join(tmpdir(),'tripplanner-dp19-purge-'))
  try{
    mkdirSync(path.join(root,'config'),{recursive:true})
    const store=new ServerConfigStore(root,{})
    const repo=new InMemoryProviderCacheRepository()
    let now=2_100_000_000_000
    const service=new ProviderCacheService({repository:repo,configStore:store,now:()=>now})
    let cfg=store.cachePolicyStatus().operatorConfig
    cfg.policies['GOOGLE.PLACES.POSITION']={ttlHours:200,retentionHours:300};store.setProviderCachePolicy(cfg)
    await service.put('T',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:p',value:{lat:1,lng:2}})
    now+=301*3600000;assert.equal((await service.purge()).length,1)
    cfg=store.cachePolicyStatus().operatorConfig
    cfg.policies['GOOGLE.PLACES.POSITION']={ttlHours:720,retentionHours:720};store.setProviderCachePolicy(cfg)
    assert.equal((await service.get('T',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:p'})).hit,false)
  }finally{rmSync(root,{recursive:true,force:true})}
})

await ok('presentation mode has dedicated visual hierarchy and keeps the map',async()=>{
  const app=await readFile('src/App.tsx','utf8'),css=await readFile('src/styles/poc.css','utf8')
  assert.match(app,/text\.capture\.subtitle/)
  assert.match(css,/\.capture-workspace/)
  assert.match(css,/\.capture-mode \.timeline-viewport/)
  assert.match(css,/\.capture-mode \.map-panel/)
  assert.doesNotMatch(css,/\.capture-mode[^\n]*\.map-panel\{display:none/)
})

await ok('shell/provider copy is catalog-backed and old technical rev wording is absent',async()=>{
  const app=await readFile('src/App.tsx','utf8'),auth=await readFile('src/components/AuthPages.tsx','utf8'),catalog=await readFile('src/i18n/locales/ko-KR.ts','utf8')
  assert.match(app,/text\.provider\.label/);assert.match(app,/text\.tripHome\.revision/)
  assert.match(auth,/text\.provider\.label/);assert.match(catalog,/저장 버전/)
  assert.doesNotMatch(app,/GOOGLE\s*·\s*rev|NAVER\s*·\s*rev|revision \{trip\.revision\}/)
})

console.log(`\n${passed} devpack19 polish tests passed.`)
