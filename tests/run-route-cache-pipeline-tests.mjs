import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { ServerConfigStore } from '../server/configStore.mjs'
import { SqliteRepositories } from '../server/repositories.mjs'
import { ProviderCacheService } from '../server/providerCacheService.mjs'
import { createTripPlannerServer } from '../server/app.mjs'
import { createEmptyTripSnapshot } from '../server/snapshotValidation.mjs'

const dir=mkdtempSync(path.join(tmpdir(),'tripplanner-route-cache-'))
let repos,server
const route={id:'google-transit-1',mode:'TRANSIT',durationMinutes:38,distanceMeters:12990,summary:'Subway + walk',geometry:[{lat:35.1,lng:129.1},{lat:35.2,lng:129.2}],transitSteps:[{mode:'WALK',instruction:'Walk',durationMinutes:3},{mode:'SUBWAY',lineName:'Line 1',departureStop:'A',arrivalStop:'B',stopCount:5}]}
const key='route:v1:TRANSIT:35.1000000,129.1000000:35.2000000,129.2000000'
const policyKey='GOOGLE.ROUTES.RESULT'
const body={policyKey,subjectKey:key,value:[route]}
try {
  repos=new SqliteRepositories(path.join(dir,'trips.sqlite'))
  await repos.trips.create(createEmptyTripSnapshot({tripId:'testA',name:'A',mapProvider:'GOOGLE'}))
  await repos.trips.create(createEmptyTripSnapshot({tripId:'testB',name:'B',mapProvider:'GOOGLE'}))
  const configStore=new ServerConfigStore(dir,{})
  let now=1_800_000_000_000
  const cache=new ProviderCacheService({repository:repos.providerCache,configStore,now:()=>now})
  server=createTripPlannerServer({tripRepository:repos.trips,providerCacheService:cache,configStore})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const base=`http://127.0.0.1:${server.address().port}`
  async function req(uri,method='GET',payload){const r=await fetch(base+uri,{method,headers:{'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});return {status:r.status,data:await r.json()}}
  function query(trip='testA'){return `/api/trips/${trip}/provider-cache?${new URLSearchParams({policyKey,subjectKey:key})}`}
  async function configure(ttlHours,retentionHours){const cfg=configStore.cachePolicyStatus().operatorConfig;cfg.policies[policyKey]={ttlHours,retentionHours};const updated=await req('/api/admin/cache-policy','PUT',cfg);assert.equal(updated.status,200,JSON.stringify(updated.data));return updated.data}
  // Default disabled: no server storage, no cache response on reload.
  let x=await req('/api/trips/testA/provider-cache','PUT',body)
  assert.deepEqual({stored:x.data.stored,reason:x.data.reason},{stored:false,reason:'DISABLED'})
  assert.equal((await req(query())).data.hit,false)
  console.log('PASS default disabled, no persistence')

  // Permanent storage with real SQLite, preserves all geometry/transit details.
  await configure(-1,-1)
  x=await req('/api/trips/testA/provider-cache','PUT',body)
  assert.equal(x.data.stored,true)
  assert.equal((await req(query('testB'))).data.hit,false,'trip-scoped cache must not cross boundaries')
  x=await req(query())
  assert.equal(x.data.hit,true)
  assert.deepEqual(x.data.value,[route])
  now+=10000*3600000
  assert.equal((await req(query())).data.hit,true)
  assert.equal((await cache.stats()).records,1)
  const reopened=new SqliteRepositories(path.join(dir,'trips.sqlite'))
  try{
    const stored=await reopened.providerCache.findForTrip('testA',{provider:'GOOGLE',policyKey,subjectKey:`trip:testA:${key}`})
    assert.deepEqual(stored?.value,[route])
  }finally{reopened.close()}
  console.log('PASS permanent SQLite storage across connections, transit and geometry, trip-scoped isolation')

  // Empty/invalid candidate cannot be saved; prevents injecting arbitrary payload.
  x=await req('/api/trips/testA/provider-cache','PUT',{...body,value:[{id:'bad',mode:'CAR',durationMinutes:'not a number'}]})
  assert.equal(x.status,400)
  console.log('PASS rejects malformed route candidate')

  // When operator disables the policy, existing records must be purged immediately.
  const updated=await configure(0,-1) // even stale permanent retention must be reset to zero
  assert.equal(updated.operatorConfig.policies[policyKey].retentionHours,0)
  assert.equal((await cache.stats()).records,0)
  assert.equal((await req(query())).data.hit,false)
  assert.equal((await req('/api/trips/testA/provider-cache','PUT',body)).data.stored,false)
  console.log('PASS TTL=0 physically purges old route data and stops writes')

  // Positive policy expires active results; physical retention follows a distinct horizon.
  await configure(24,48)
  now=1_800_000_000_000
  assert.equal((await req('/api/trips/testA/provider-cache','PUT',body)).data.stored,true)
  assert.equal((await req(query())).data.hit,true)
  now+=23*3600000 // default margin = 2 hours, effective 22 hours.
  assert.equal((await req(query())).data.hit,false)
  assert.equal((await cache.stats()).records,1)
  now+=26*3600000
  assert.equal((await cache.purge()).length,1)
  assert.equal((await cache.stats()).records,0)
  console.log('PASS positive TTL and physical-retention expiration')

  // Stored opaque route option is allowed, with no provider response in Trip Snapshot.
  const loaded=await repos.trips.load('testA')
  loaded.snapshot.plans['VISIT:a>VISIT:b']={id:'VISIT:a>VISIT:b',fromNodeKey:'VISIT:a',toNodeKey:'VISIT:b',source:'ROUTE_API',segments:[],routeIntent:{provider:'GOOGLE',mode:'TRANSIT',option:route.id}}
  await repos.trips.save('testA',loaded.snapshot,loaded.revision)
  assert.equal((await repos.trips.load('testA')).snapshot.plans['VISIT:a>VISIT:b'].routeIntent.option,route.id)
  console.log('PASS user-owned selection identity survives snapshot save')

  // NAVER route policy remains independent and default disabled.
  assert.equal(configStore.providerCachePolicy().policies['NAVER.DIRECTIONS5.RESULT'].ttlHours,0)
  console.log('PASS NAVER policy disabled by default')
} finally {
  if(server)await new Promise(resolve=>server.close(resolve))
  repos?.close()
  rmSync(dir,{recursive:true,force:true})
}
