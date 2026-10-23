import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createTripPlannerServer } from '../server/app.mjs'
import { ServerConfigStore } from '../server/configStore.mjs'
import { ProviderCacheService } from '../server/providerCacheService.mjs'
import { LEGAL_PROVIDER_CACHE_CATALOG as SERVER_CATALOG } from '../server/providerCachePolicy.mjs'
import { InMemoryProviderCacheRepository, InMemoryTripSnapshotRepository, SqliteRepositories } from '../server/repositories.mjs'
import { createEmptyTripSnapshot } from '../server/snapshotValidation.mjs'

let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}
const temp=mkdtempSync(path.join(tmpdir(),'tripplanner-devpack16-'))
let server
try{
  mkdirSync(path.join(temp,'config'),{recursive:true})
  const configStore=new ServerConfigStore(temp,{})
  const trips=new InMemoryTripSnapshotRepository(),cacheRepo=new InMemoryProviderCacheRepository()
  await trips.create(createEmptyTripSnapshot({tripId:'A',name:'A',mapProvider:'GOOGLE'}))
  await trips.create(createEmptyTripSnapshot({tripId:'B',name:'B',mapProvider:'GOOGLE'}))
  let clock=1_800_000_000_000
  const cacheService=new ProviderCacheService({repository:cacheRepo,configStore,now:()=>clock})
  server=createTripPlannerServer({tripRepository:trips,providerCacheService:cacheService,configStore})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const base=`http://127.0.0.1:${server.address().port}`
  const json=async(url,init)=>{const r=await fetch(base+url,{...init,headers:{'content-type':'application/json',...(init?.headers??{})}});return {r,body:await r.json()}}

  await ok('cache TTL semantics are -1 permanent, 0 disabled, positive hours with legal ceiling',async()=>{
    assert.equal(SERVER_CATALOG['GOOGLE.PLACES.PLACE_ID'].maxTtlHours,-1)
    assert.equal(SERVER_CATALOG['GOOGLE.PLACES.POSITION'].maxTtlHours,720)
    assert.equal(SERVER_CATALOG['GOOGLE.PLACES.NAME'].maxTtlHours,0)
    const status=configStore.cachePolicyStatus()
    assert.equal(status.runtimeWiring,'ENABLED')
    assert.equal(status.operatorConfig.policies['GOOGLE.PLACES.POSITION'].ttlHours,360)
    assert.equal(status.operatorConfig.policies['GOOGLE.PLACES.POSITION'].retentionHours,720)
    assert.equal(status.policies.find(x=>x.key==='GOOGLE.PLACES.POSITION').maxTtlHours,720)
  })

  await ok('management saves cache policy and exposes maximum/effective TTL',async()=>{
    const current=configStore.cachePolicyStatus().operatorConfig
    current.policies['GOOGLE.PLACES.POSITION']={ttlHours:720,retentionHours:720}
    current.policies['GOOGLE.PLACES.PLACE_ID']={ttlHours:-1,safetyMarginHours:0,retentionHours:-1}
    const {r,body}=await json('/api/admin/cache-policy',{method:'PUT',body:JSON.stringify(current)})
    assert.equal(r.status,200);assert.equal(body.runtimeWiring,'ENABLED')
    const pos=body.policies.find(x=>x.key==='GOOGLE.PLACES.POSITION')
    assert.equal(pos.maxTtlHours,720);assert.equal(pos.ttlHours,720);assert.equal(pos.retentionHours,720);assert.equal(pos.effectiveTtlHours,718)
    const saved=JSON.parse(readFileSync(path.join(temp,'config/provider-cache-policy.override.json'),'utf8'))
    assert.equal(saved.policies['GOOGLE.PLACES.PLACE_ID'].ttlHours,-1)
  })

  await ok('server rejects TTL above maximum and illegal permanent position cache',async()=>{
    const baseCfg=configStore.cachePolicyStatus().operatorConfig
    for(const bad of [721,-1]){
      const cfg=structuredClone(baseCfg);cfg.policies['GOOGLE.PLACES.POSITION']={ttlHours:bad,retentionHours:bad===-1?-1:720}
      const {r}=await json('/api/admin/cache-policy',{method:'PUT',body:JSON.stringify(cfg)})
      assert.equal(r.status,400)
    }
  })

  await ok('runtime config exposes active Google position-cache TTL after authentication gate',async()=>{
    const {r,body}=await json('/api/runtime-config')
    assert.equal(r.status,200);assert.equal(body.providerCache.googlePlacesPositionTtlHours,720)
  })

  await ok('provider cache writes and reads Google position for the same Trip',async()=>{
    let x=await json('/api/trips/A/provider-cache',{method:'PUT',body:JSON.stringify({policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:pid',value:{lat:37.5,lng:127}})})
    assert.equal(x.r.status,200);assert.equal(x.body.stored,true)
    x=await json('/api/trips/A/provider-cache?policyKey=GOOGLE.PLACES.POSITION&subjectKey=place%3Apid')
    assert.equal(x.r.status,200);assert.equal(x.body.hit,true);assert.deepEqual(x.body.value,{lat:37.5,lng:127})
  })

  await ok('Trip-scoped cache does not leak to another Trip while cross-Trip reuse is unverified',async()=>{
    const x=await json('/api/trips/B/provider-cache?policyKey=GOOGLE.PLACES.POSITION&subjectKey=place%3Apid')
    assert.equal(x.r.status,200);assert.equal(x.body.hit,false)
  })

  await ok('active expiry becomes dormant; retained data can reactivate when policy is extended',async()=>{
    // Reconfigure to a deliberately tighter dormant horizon while the record is still young.
    let cfg=configStore.cachePolicyStatus().operatorConfig
    cfg.policies['GOOGLE.PLACES.POSITION']={ttlHours:360,retentionHours:480}
    let saved=await json('/api/admin/cache-policy',{method:'PUT',body:JSON.stringify(cfg)});assert.equal(saved.r.status,200)

    // At 400 h old the position is no longer active (358 h effective TTL) but is still physically retained.
    clock+=400*3600000
    let x=await json('/api/trips/A/provider-cache?policyKey=GOOGLE.PLACES.POSITION&subjectKey=place%3Apid')
    assert.equal(x.body.hit,false)
    const dormant=await cacheService.get('A',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:pid'})
    assert.equal(dormant.evaluation.dormant,true);assert.equal(dormant.evaluation.retained,true)
    let purged=await cacheService.purge();assert.equal(purged.length,0)

    // Increasing both active TTL and dormant retention re-evaluates the SAME fetchedAt; no provider write/fetch is needed.
    cfg=configStore.cachePolicyStatus().operatorConfig
    cfg.policies['GOOGLE.PLACES.POSITION']={ttlHours:720,retentionHours:720}
    saved=await json('/api/admin/cache-policy',{method:'PUT',body:JSON.stringify(cfg)});assert.equal(saved.r.status,200)
    x=await json('/api/trips/A/provider-cache?policyKey=GOOGLE.PLACES.POSITION&subjectKey=place%3Apid')
    assert.equal(x.body.hit,true);assert.equal(x.body.fetchedAtEpochMs,1_800_000_000_000)

    // Once the legal/operator retention horizon is actually crossed and cleanup purges the record, it cannot resurrect.
    clock=1_800_000_000_000+721*3600000
    purged=await cacheService.purge();assert.equal(purged.length,1)
    clock=1_800_000_000_000+500*3600000
    x=await json('/api/trips/A/provider-cache?policyKey=GOOGLE.PLACES.POSITION&subjectKey=place%3Apid')
    assert.equal(x.body.hit,false)
  })

  await ok('max=0 fields remain non-storable even when a client tries direct cache write',async()=>{
    const x=await json('/api/trips/A/provider-cache',{method:'PUT',body:JSON.stringify({policyKey:'GOOGLE.PLACES.NAME',subjectKey:'place:pid',value:'Injected name'})})
    assert.equal(x.r.status,200);assert.equal(x.body.stored,false);assert.equal(x.body.reason,'DISABLED')
  })

  await ok('SQLite cache keeps identical provider subjects isolated by Trip scope',async()=>{
    const repos=new SqliteRepositories(path.join(temp,'scoped-cache.sqlite'))
    try{
      await repos.trips.create(createEmptyTripSnapshot({tripId:'SA',name:'SA',mapProvider:'GOOGLE'}))
      await repos.trips.create(createEmptyTripSnapshot({tripId:'SB',name:'SB',mapProvider:'GOOGLE'}))
      const service=new ProviderCacheService({repository:repos.providerCache,configStore,now:()=>clock})
      await service.put('SA',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:same',value:{lat:1,lng:2}})
      await service.put('SB',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:same',value:{lat:3,lng:4}})
      assert.deepEqual((await service.get('SA',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:same'})).value,{lat:1,lng:2})
      assert.deepEqual((await service.get('SB',{provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'place:same'})).value,{lat:3,lng:4})
      assert.equal((await service.stats()).records,2)
    }finally{repos.close()}
  })

  await ok('management UI source renders current/max/effective TTL controls',async()=>{
    const source=readFileSync(path.resolve('src/components/AuthPages.tsx'),'utf8')
    assert.match(source,/cacheCurrentTtl/);assert.match(source,/cacheMaxTtl/);assert.match(source,/cacheEffectiveTtl/);assert.match(source,/setCachePolicy/)
    const hydration=readFileSync(path.resolve('src/persistence/providerHydration.ts'),'utf8')
    assert.match(hydration,/readGooglePlacePositionCache/);assert.match(hydration,/writeGooglePlacePositionCache/);assert.match(hydration,/requestedFields/)
  })

  console.log(`\n${passed} devpack16 cache runtime tests passed.`)
}finally{
  if(server)await new Promise(resolve=>server.close(resolve))
  rmSync(temp,{recursive:true,force:true})
}
