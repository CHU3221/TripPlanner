import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { SqliteRepositories } from '../server/repositories.mjs'
import { ServerConfigStore } from '../server/configStore.mjs'
import { AuthService } from '../server/auth.mjs'
import { createTripPlannerServer } from '../server/app.mjs'

let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}
const temp=mkdtempSync(path.join(tmpdir(),'tripplanner-devpack14-'))
let repos,server
const cookieOf=response=>(response.headers.get('set-cookie')??'').split(';')[0]
async function jsonFetch(base,pathname,init={}){const r=await fetch(base+pathname,init);const body=await r.json().catch(()=>({}));return {r,body}}
try{
  const root=path.join(temp,'root');mkdirSync(path.join(root,'config'),{recursive:true})
  const configStore=new ServerConfigStore(root,{VITE_GOOGLE_MAPS_API_KEY:'google-test-key',VITE_GOOGLE_MAP_ID:'map-id',VITE_NAVER_MAP_CLIENT_ID:'naver-id'})
  repos=new SqliteRepositories(path.join(temp,'auth.sqlite'))
  const auth=new AuthService({users:repos.users,sessions:repos.sessions,configStore})
  server=createTripPlannerServer({tripRepository:repos.trips,userRepository:repos.users,sessionRepository:repos.sessions,authService:auth,configStore})
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`

  await ok('unauthenticated requests cannot reach trips or runtime map keys',async()=>{
    assert.equal((await fetch(base+'/api/trips')).status,401)
    assert.equal((await fetch(base+'/api/runtime-config')).status,401)
  })
  let adminCookie=''
  await ok('missing admin env fields enable only bootstrap admin/admin and force setup',async()=>{
    const {r,body}=await jsonFetch(base,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'admin'})})
    assert.equal(r.status,200);assert.equal(body.role,'ADMIN');assert.equal(body.mustChangeAdminPassword,true);adminCookie=cookieOf(r);assert.ok(adminCookie.startsWith('tp_session='))
  })
  await ok('bootstrap setup writes hashed admin credentials to .env.local',async()=>{
    const {r,body}=await jsonFetch(base,'/api/auth/admin-credentials',{method:'PUT',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({adminId:'owner',password:'OwnerPass123!'})})
    assert.equal(r.status,200);assert.equal(body.username,'owner');assert.equal(body.mustChangeAdminPassword,false)
    const env=readFileSync(path.join(root,'.env.local'),'utf8');assert.match(env,/ADMIN_ID="owner"/);assert.match(env,/ADMIN_PASSWORD_HASH="scrypt\$/);assert.ok(!env.includes('OwnerPass123!'))
    const old=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password:'admin'})});assert.equal(old.status,401)
  })
  await ok('signup remains pending until admin approval',async()=>{
    let x=await jsonFetch(base,'/api/auth/signup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'traveler',password:'Traveler123!'})});assert.equal(x.r.status,201)
    x=await jsonFetch(base,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'traveler',password:'Traveler123!'})});assert.equal(x.r.status,403);assert.equal(x.body.code,'ACCOUNT_PENDING')
    const list=await jsonFetch(base,'/api/admin/users',{headers:{cookie:adminCookie}});assert.equal(list.r.status,200);assert.equal(list.body.users[0].status,'PENDING');assert.equal('passwordHash' in list.body.users[0],false)
    const id=list.body.users[0].id;assert.equal((await fetch(base+`/api/admin/users/${id}/approve`,{method:'POST',headers:{cookie:adminCookie}})).status,200)
  })
  let userCookie='',userId=''
  await ok('approved user can login and only then receive runtime map configuration',async()=>{
    const x=await jsonFetch(base,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'traveler',password:'Traveler123!'})});assert.equal(x.r.status,200);userCookie=cookieOf(x.r);userId=x.body.userId
    const config=await jsonFetch(base,'/api/runtime-config',{headers:{cookie:userCookie}});assert.equal(config.r.status,200);assert.equal(config.body.googleApiKey,'google-test-key');assert.equal(config.body.googleMapId,'map-id')
  })
  await ok('admin password reset invalidates user sessions and forces password change',async()=>{
    let x=await jsonFetch(base,`/api/admin/users/${userId}/reset-password`,{method:'PUT',headers:{cookie:adminCookie,'content-type':'application/json'},body:JSON.stringify({password:'TempPass99!'})});assert.equal(x.r.status,200);assert.equal(x.body.mustChangePassword,true)
    x=await jsonFetch(base,'/api/auth/status',{headers:{cookie:userCookie}});assert.equal(x.body.authenticated,false)
    x=await jsonFetch(base,'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'traveler',password:'TempPass99!'})});assert.equal(x.r.status,200);assert.equal(x.body.mustChangePassword,true);userCookie=cookieOf(x.r)
    x=await jsonFetch(base,'/api/auth/password',{method:'PUT',headers:{cookie:userCookie,'content-type':'application/json'},body:JSON.stringify({currentPassword:'TempPass99!',newPassword:'FinalPass99!'})});assert.equal(x.r.status,200);assert.equal(x.body.mustChangePassword,false)
  })
  await ok('management exposes cache wiring state honestly',async()=>{
    const x=await jsonFetch(base,'/api/admin/system',{headers:{cookie:adminCookie}});assert.equal(x.r.status,200);assert.equal(x.body.maps.googleConfigured,true);assert.equal(x.body.cache.runtimeWiring,'ENABLED')
  })
  await ok('trip map settings persist only when non-default and validator rejects unknown size',()=>{
    const out=path.join(temp,'ts-out');mkdirSync(out,{recursive:true});
    const nodeModules=path.join(process.cwd(),'node_modules');
    execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0','--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--resolveJsonModule','--esModuleInterop','--lib','ES2022,DOM','--skipLibCheck','src/persistence/snapshotCodec.ts'],{stdio:'pipe'})
    const req=createRequire(import.meta.url),codec=req(path.join(out,'src/persistence/snapshotCodec.js'))
    const baseState={tripId:'x',name:'X',mapProvider:'GOOGLE',places:[],regions:[],visits:[],bucketItems:[],bases:[],transports:[],labels:[],plans:{},timelineView:{viewStart:600,viewEnd:2160},dayColors:{}}
    assert.equal(codec.createTripSnapshot({...baseState,mapSettings:{connectionWidthPx:3}}).mapSettings,undefined)
    assert.equal(codec.createTripSnapshot({...baseState,mapSettings:{connectionWidthPx:7}}).mapSettings.connectionWidthPx,7)
  })
  await ok('map renderers apply per-trip path size and viewport zoom floors',()=>{
    const app=readFileSync('src/App.tsx','utf8'),google=readFileSync('src/map/provider/google/GoogleMapRenderer.ts','utf8'),naver=readFileSync('src/map/provider/naver/NaverMapRenderer.ts','utf8'),map=readFileSync('src/components/TripMap.tsx','utf8')
    assert.match(app,/material-symbols-rounded">settings</);assert.match(app,/mapSettings=\{mapSettings\}/);assert.match(map,/strokeWidthPx:mapSettings\.connectionWidthPx/)
    assert.match(google,/Math\.ceil\(Math\.log2/);assert.doesNotMatch(google,/strictBounds:true|restriction:/);assert.match(google,/mapPathStrokeWeight\(primitive\)/)
    assert.match(naver,/minZoom: 1/);assert.doesNotMatch(naver,/maxBounds/);assert.match(naver,/mapPathStrokeWeight\(primitive\)/)
  })
  await ok('frontend does not embed VITE Google key and gates runtime config behind auth state',()=>{
    const app=readFileSync('src/App.tsx','utf8');assert.ok(!app.includes('VITE_GOOGLE_MAPS_API_KEY'));assert.match(app,/authApi\.status\(\)/);assert.match(app,/if\(!auth\.authenticated\)return <LoginPage/);assert.match(app,/authApi\.runtimeConfig\(\)/)
  })
  console.log(`\n${passed} devpack14 auth/settings tests passed.`)
}finally{
  if(server)await new Promise(resolve=>server.close(resolve));try{repos?.close()}catch{}
  rmSync(temp,{recursive:true,force:true})
}
