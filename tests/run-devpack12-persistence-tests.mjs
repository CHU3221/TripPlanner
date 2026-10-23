import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createEmptyTripSnapshot, validateTripSnapshot } from '../server/snapshotValidation.mjs'
import { InMemoryTripSnapshotRepository, InMemoryProviderCacheRepository, RevisionConflictError, SqliteRepositories } from '../server/repositories.mjs'
import { createTripPlannerServer } from '../server/app.mjs'

let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}
const makeSnapshot=(id='trip-1')=>createEmptyTripSnapshot({tripId:id,name:'Tokyo test',mapProvider:'GOOGLE'})

async function repositoryContract(repo){
  const snapshot=makeSnapshot()
  const created=await repo.create(snapshot);assert.equal(created.revision,0)
  assert.equal((await repo.list()).length,1)
  const loaded=await repo.load(snapshot.tripId);assert.equal(loaded.snapshot.name,'Tokyo test')
  const edited={...snapshot,name:'Tokyo saved'}
  assert.equal(await repo.save(snapshot.tripId,edited,0),1)
  assert.equal((await repo.load(snapshot.tripId)).snapshot.name,'Tokyo saved')
  await assert.rejects(()=>repo.save(snapshot.tripId,edited,0),RevisionConflictError)
}

const temp=mkdtempSync(path.join(tmpdir(),'tripplanner-devpack12-'))
let sqlite
try{
  await ok('in-memory TripSnapshot repository obeys create/load/revision contract',()=>repositoryContract(new InMemoryTripSnapshotRepository()))
  await ok('SQLite TripSnapshot repository obeys same contract and survives reopen',async()=>{
    const dbPath=path.join(temp,'trip.sqlite')
    sqlite=new SqliteRepositories(dbPath);await repositoryContract(sqlite.trips);sqlite.close();sqlite=new SqliteRepositories(dbPath)
    const loaded=await sqlite.trips.load('trip-1');assert.equal(loaded.revision,1);assert.equal(loaded.snapshot.name,'Tokyo saved')
  })
  await ok('snapshot validator rejects runtime/provider response fields',()=>{
    const snapshot=makeSnapshot('safe')
    assert.throws(()=>validateTripSnapshot({...snapshot,routeRuntime:{x:{geometry:[1]}}}))
    snapshot.places=[{id:'p',providerRef:{provider:'GOOGLE',id:'pid'},userData:{}}]
    assert.doesNotThrow(()=>validateTripSnapshot(snapshot))
    snapshot.places[0].userData.providerPayload={secret:true}
    assert.throws(()=>validateTripSnapshot(snapshot))
  })
  await ok('SQLite provider cache is physically shared but Trip refs stay separate',async()=>{
    const dbPath=path.join(temp,'cache.sqlite'),repos=new SqliteRepositories(dbPath)
    await repos.trips.create(makeSnapshot('A'));await repos.trips.create(makeSnapshot('B'))
    const record={cacheId:'c1',provider:'GOOGLE',policyKey:'GOOGLE.PLACES.POSITION',subjectKey:'pid',fetchedAtEpochMs:1000,value:{lat:1,lng:2}}
    await repos.providerCache.saveForTrip('A',record)
    assert.equal((await repos.providerCache.findForTrip('A',{provider:'GOOGLE',policyKey:record.policyKey,subjectKey:'pid'})).cacheId,'c1')
    assert.equal(await repos.providerCache.findForTrip('B',{provider:'GOOGLE',policyKey:record.policyKey,subjectKey:'pid'}),undefined)
    assert.equal((await repos.providerCache.findGlobal({provider:'GOOGLE',policyKey:record.policyKey,subjectKey:'pid'})).cacheId,'c1')
    await repos.providerCache.linkTripToCache('B','c1');assert.equal((await repos.providerCache.findForTrip('B',{provider:'GOOGLE',policyKey:record.policyKey,subjectKey:'pid'})).cacheId,'c1')
    repos.close()
  })
  await ok('in-memory provider cache implements the same trip/global separation',async()=>{
    const repo=new InMemoryProviderCacheRepository(),record={cacheId:'c',provider:'GOOGLE',policyKey:'K',subjectKey:'S',fetchedAtEpochMs:1,value:{x:1}}
    await repo.saveForTrip('A',record);assert.equal((await repo.findForTrip('A',{provider:'GOOGLE',policyKey:'K',subjectKey:'S'})).cacheId,'c');assert.equal(await repo.findForTrip('B',{provider:'GOOGLE',policyKey:'K',subjectKey:'S'}),undefined)
  })
  await ok('HTTP backend creates, lists, loads and revision-saves a Google Trip',async()=>{
    const repo=new InMemoryTripSnapshotRepository(),server=createTripPlannerServer({tripRepository:repo});server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port,base=`http://127.0.0.1:${port}/api/trips`
    try{
      let r=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Japan 2026',mapProvider:'GOOGLE'})});assert.equal(r.status,201);const created=await r.json();assert.equal(created.snapshot.mapProvider,'GOOGLE');assert.equal(created.revision,0)
      r=await fetch(base);assert.equal((await r.json()).trips.length,1)
      r=await fetch(`${base}/${created.snapshot.tripId}`);assert.equal((await r.json()).snapshot.name,'Japan 2026')
      const edited={...created.snapshot,name:'Japan saved'}
      r=await fetch(`${base}/${created.snapshot.tripId}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:0,snapshot:edited})});assert.equal(r.status,200);assert.equal((await r.json()).revision,1)
      r=await fetch(`${base}/${created.snapshot.tripId}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:0,snapshot:edited})});assert.equal(r.status,409)
    }finally{await new Promise(resolve=>server.close(resolve))}
  })
  await ok('snapshot codec stores only USER place fields while retaining Google Place ID',()=>{
    const outDir=path.join(temp,'ts-out')
    execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0','--outDir',outDir,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--resolveJsonModule','--esModuleInterop','--lib','ES2022,DOM','--skipLibCheck','src/persistence/snapshotCodec.ts'],{stdio:'pipe'})
    const require=createRequire(import.meta.url),codec=require(path.join(outDir,'src/persistence/snapshotCodec.js'))
    const base={tripId:'g',name:'G',mapProvider:'GOOGLE',regions:[],visits:[],bucketItems:[],bases:[],transports:[],labels:[],plans:{},dayColors:{'2026-10-20':'#112233'}}
    const providerPlace={id:'p',name:'Tokyo Tower',address:'Tokyo',position:{lat:1,lng:2},providerRef:{provider:'GOOGLE',id:'pid'},provenance:{name:{source:'PROVIDER',provider:'GOOGLE'},address:{source:'PROVIDER',provider:'GOOGLE'},position:{source:'PROVIDER',provider:'GOOGLE'}}}
    const snapshot=codec.createTripSnapshot({...base,places:[providerPlace]})
    assert.deepEqual(snapshot.places[0].userData,{})
    assert.equal(snapshot.places[0].providerRef.id,'pid');assert.equal(snapshot.dayColors['2026-10-20'],'#112233')
    const restored=codec.restoreTripSnapshot(snapshot);assert.equal(restored.places[0].name,'저장된 장소');assert.equal(restored.places[0].position,undefined)
    const userPlace={...providerPlace,name:'내 장소',provenance:{...providerPlace.provenance,name:{source:'USER'}}}
    assert.equal(codec.createTripSnapshot({...base,places:[userPlace]}).places[0].userData.name,'내 장소')
    const merged=codec.mergeProviderPlaceRuntime(codec.restoreTripSnapshot(codec.createTripSnapshot({...base,places:[userPlace]})).places[0],{...providerPlace,id:'p'})
    assert.equal(merged.name,'내 장소');assert.deepEqual(merged.position,{lat:1,lng:2})
    const transport={id:'t',occupiedFrom:100,occupiedUntil:200,mode:'TRAIN',departure:{placeId:'p',place:'저장된 장소',departureAt:100},arrival:{placeId:'q',place:'저장된 장소',arrivalAt:200},onboard:{title:'이동',route:'저장된 장소 → 저장된 장소',icon:'train'}}
    const refreshed=codec.refreshMajorTransportPlaceProjection(transport,[{id:'p',name:'Tokyo Station'},{id:'q',name:'Kyoto Station'}])
    assert.equal(refreshed.departure.place,'Tokyo Station');assert.equal(refreshed.arrival.place,'Kyoto Station');assert.equal(refreshed.onboard.route,'Tokyo Station → Kyoto Station')
  })
  console.log(`\n${passed} devpack12 persistence tests passed.`)
}finally{try{sqlite?.close()}catch{}rmSync(temp,{recursive:true,force:true})}
