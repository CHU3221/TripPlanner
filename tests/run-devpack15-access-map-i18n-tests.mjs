import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { SqliteRepositories } from '../server/repositories.mjs'
import { ServerConfigStore } from '../server/configStore.mjs'
import { AuthService } from '../server/auth.mjs'
import { createTripPlannerServer } from '../server/app.mjs'

let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}
const temp=mkdtempSync(path.join(tmpdir(),'tripplanner-devpack15-'))
let repos,server
const cookieOf=response=>(response.headers.get('set-cookie')??'').split(';')[0]
async function jsonFetch(base,pathname,init={}){const r=await fetch(base+pathname,init);const body=await r.json().catch(()=>({}));return {r,body}}
async function login(base,username,password){const x=await jsonFetch(base,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});return {...x,cookie:cookieOf(x.r)}}
try{
  const root=path.join(temp,'root');mkdirSync(path.join(root,'config'),{recursive:true})
  const configStore=new ServerConfigStore(root,{VITE_GOOGLE_MAPS_API_KEY:'key',VITE_GOOGLE_MAP_ID:'map-id',VITE_NAVER_MAP_CLIENT_ID:'naver'})
  repos=new SqliteRepositories(path.join(temp,'db.sqlite'))
  const auth=new AuthService({users:repos.users,sessions:repos.sessions,configStore})
  server=createTripPlannerServer({tripRepository:repos.trips,userRepository:repos.users,sessionRepository:repos.sessions,accessRepository:repos.access,authService:auth,configStore})
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`

  let admin=(await login(base,'admin','admin')).cookie
  let x=await jsonFetch(base,'/api/auth/admin-credentials',{method:'PUT',headers:{cookie:admin,'content-type':'application/json'},body:JSON.stringify({adminId:'owner',password:'OwnerPass123!'})});assert.equal(x.r.status,200)
  admin=(await login(base,'owner','OwnerPass123!')).cookie

  for(const name of ['alice','bob']){
    x=await jsonFetch(base,'/api/auth/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:name,password:'Traveler123!'})});assert.equal(x.r.status,201)
  }
  x=await jsonFetch(base,'/api/admin/users',{headers:{cookie:admin}});const alice=x.body.users.find(u=>u.username==='alice'),bob=x.body.users.find(u=>u.username==='bob')
  for(const user of [alice,bob])assert.equal((await fetch(base+`/api/admin/users/${user.id}/approve`,{method:'POST',headers:{cookie:admin}})).status,200)

  await ok('global user permission can deny Trip creation without disabling account',async()=>{
    let r=await jsonFetch(base,`/api/admin/users/${bob.id}/permissions`,{method:'PUT',headers:{cookie:admin,'content-type':'application/json'},body:JSON.stringify({canCreateTrips:false})});assert.equal(r.r.status,200)
    const bobLogin=await login(base,'bob','Traveler123!');assert.equal(bobLogin.body.permissions.canCreateTrips,false)
    r=await jsonFetch(base,'/api/trips',{method:'POST',headers:{cookie:bobLogin.cookie,'content-type':'application/json'},body:JSON.stringify({name:'Nope',mapProvider:'GOOGLE'})});assert.equal(r.r.status,403);assert.equal(r.body.code,'TRIP_CREATE_FORBIDDEN')
  })

  let tripId=''
  const aliceLogin=await login(base,'alice','Traveler123!'),bobLogin=await login(base,'bob','Traveler123!')
  await ok('legacy/open Trip remains visible to all active users',async()=>{
    const r=await jsonFetch(base,'/api/trips',{method:'POST',headers:{cookie:aliceLogin.cookie,'content-type':'application/json'},body:JSON.stringify({name:'Shared',mapProvider:'GOOGLE'})});assert.equal(r.r.status,201);tripId=r.body.snapshot.tripId
    const list=await jsonFetch(base,'/api/trips',{headers:{cookie:bobLogin.cookie}});assert.ok(list.body.trips.some(t=>t.tripId===tripId))
  })
  await ok('restricted Trip ACL filters list and blocks direct load',async()=>{
    let r=await jsonFetch(base,`/api/admin/trips/${tripId}/access`,{method:'PUT',headers:{cookie:admin,'content-type':'application/json'},body:JSON.stringify({accessMode:'RESTRICTED',allowedUserIds:[alice.id]})});assert.equal(r.r.status,200);assert.deepEqual(r.body,{accessMode:'RESTRICTED',allowedUserIds:[alice.id]})
    let list=await jsonFetch(base,'/api/trips',{headers:{cookie:bobLogin.cookie}});assert.ok(!list.body.trips.some(t=>t.tripId===tripId))
    r=await jsonFetch(base,`/api/trips/${tripId}`,{headers:{cookie:bobLogin.cookie}});assert.equal(r.r.status,403);assert.equal(r.body.code,'TRIP_FORBIDDEN')
    r=await jsonFetch(base,`/api/trips/${tripId}`,{headers:{cookie:aliceLogin.cookie}});assert.equal(r.r.status,200)
  })
  await ok('admin Trip access list exposes server-side ACL independently of snapshots',async()=>{
    const r=await jsonFetch(base,'/api/admin/trips/access',{headers:{cookie:admin}});assert.equal(r.r.status,200);const trip=r.body.trips.find(t=>t.tripId===tripId);assert.equal(trip.accessMode,'RESTRICTED');assert.deepEqual(trip.allowedUserIds,[alice.id])
  })
  await ok('path thickness keeps the original 3 px baseline while allowing numeric Trip settings',async()=>{
    const source=await readFile('src/map/pathThickness.ts','utf8');assert.match(source,/normalizeConnectionWidthPx/);assert.match(source,/stateBoost/)
    const settings=await readFile('src/map/tripMapSettings.ts','utf8');assert.match(settings,/DEFAULT_CONNECTION_WIDTH_PX=3/);assert.match(settings,/MAX_CONNECTION_WIDTH_PX=24/)
    const tripMap=await readFile('src/components/TripMap.tsx','utf8');assert.match(tripMap,/strokeWidthPx:mapSettings\.connectionWidthPx/);assert.match(tripMap,/if\(!route\?\.geometry\?\.length\)return sized/)
  })
  await ok('map providers keep zoom floors without hard world-pan bounds',async()=>{
    const google=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8'),naver=await readFile('src/map/provider/naver/NaverMapRenderer.ts','utf8')
    assert.doesNotMatch(google,/restriction:|strictBounds:true/);assert.match(google,/minZoom/)
    assert.doesNotMatch(naver,/maxBounds/);assert.match(naver,/minZoom: 1/)
  })
  await ok('display nomenclature is separated into a locale-ready catalog',async()=>{
    const catalog=await readFile('src/i18n/catalog.ts','utf8'),locale=await readFile('src/i18n/locales/ko-KR.ts','utf8'),app=await readFile('src/App.tsx','utf8'),authPages=await readFile('src/components/AuthPages.tsx','utf8')
    assert.match(catalog,/export const koKR=/);assert.match(locale,/tripSettings:/);assert.match(locale,/management:/);assert.match(app,/from '\.\/i18n\/catalog'/);assert.match(authPages,/from '\.\.\/i18n\/catalog'/)
  })
  console.log(`\n${passed} devpack15 access/map/i18n tests passed.`)
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));try{repos?.close()}catch{}
  rmSync(temp,{recursive:true,force:true})
}
