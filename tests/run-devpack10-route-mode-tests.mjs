import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const out = mkdtempSync(path.join(tmpdir(), 'trip-devpack10-route-mode-'))
let passed = 0
const ok = async (name, fn) => { await fn(); passed++; console.log('PASS', name) }
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0', '--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--lib','ES2022,DOM','--skipLibCheck',
    'src/routeSearchUi.ts','src/connectionRuntime.ts','src/map/provider/naver/createNaverProvider.ts','src/map/provider/google/createGoogleProvider.ts'], {stdio:'pipe'})
  const req=createRequire(import.meta.url)
  const load=name=>req(path.join(out,name))
  const { routeModeSupported, preferredRouteMode, searchRouteCandidates, routeSearchErrorMessage, RouteRequestGate }=load('src/routeSearchUi.js')
  const { MapProviderError }=load('src/map/provider/contract.js')
  const { routeRequestKey, savedConnectionRouteRequest }=load('src/connectionRuntime.js')
  const { createNaverProvider }=load('src/map/provider/naver/createNaverProvider.js')
  const { createGoogleProvider }=load('src/map/provider/google/createGoogleProvider.js')

  const pointA={lat:35,lng:139}, pointB={lat:36,lng:140}

  await ok('capability selection is pure and performs zero route calls', async()=>{
    let calls=0
    const provider={id:'GOOGLE',capabilities:{placeSearch:false,addressSearch:false,routes:{walk:true,car:true,transit:true}},renderer:{},routes:{findRoutes:async()=>{calls++;return[]}}}
    assert.equal(routeModeSupported(provider.capabilities,'CAR'),true)
    assert.equal(routeModeSupported(provider.capabilities,'WALK'),true)
    assert.equal(routeModeSupported(provider.capabilities,'TRANSIT'),true)
    assert.equal(preferredRouteMode(provider.capabilities),'CAR')
    assert.equal(calls,0)
  })

  await ok('NAVER capability exposes CAR only and unsupported mode is blocked before provider I/O', async()=>{
    const naver=createNaverProvider('id')
    let calls=0
    naver.routes={findRoutes:async()=>{calls++;return[]}}
    assert.equal(routeModeSupported(naver.capabilities,'CAR'),true)
    assert.equal(routeModeSupported(naver.capabilities,'WALK'),false)
    assert.equal(routeModeSupported(naver.capabilities,'TRANSIT'),false)
    await assert.rejects(()=>searchRouteCandidates(naver,{origin:pointA,destination:pointB,mode:'WALK'}),e=>e.code==='NOT_SUPPORTED')
    assert.equal(calls,0)
  })

  await ok('one explicit query produces exactly one provider call for CAR/WALK/TRANSIT', async()=>{
    const calls=[]
    const provider={id:'GOOGLE',capabilities:{placeSearch:false,addressSearch:false,routes:{walk:true,car:true,transit:true}},renderer:{},routes:{findRoutes:async request=>{calls.push(request.mode);return[{id:request.mode,mode:request.mode,durationMinutes:10}]}}}
    for(const mode of ['CAR','WALK','TRANSIT']){
      const routes=await searchRouteCandidates(provider,{origin:pointA,destination:pointB,mode})
      assert.equal(routes[0].mode,mode)
    }
    assert.deepEqual(calls,['CAR','WALK','TRANSIT'])
  })

  await ok('empty route list is a normal no-route result, not an auth/capability error', async()=>{
    const provider={id:'GOOGLE',capabilities:{placeSearch:false,addressSearch:false,routes:{walk:false,car:true,transit:false}},renderer:{},routes:{findRoutes:async()=>[]}}
    assert.deepEqual(await searchRouteCandidates(provider,{origin:pointA,destination:pointB,mode:'CAR'}),[])
  })

  await ok('request gate blocks duplicate clicks and recovers after completion', async()=>{
    const gate=new RouteRequestGate()
    let resolve
    let calls=0
    const pending=new Promise(r=>{resolve=r})
    const first=gate.run(async()=>{calls++;await pending;return 'ok'})
    const duplicate=await gate.run(async()=>{calls++;return 'duplicate'})
    assert.equal(duplicate.status,'BUSY')
    assert.equal(calls,1)
    resolve()
    assert.deepEqual(await first,{status:'COMPLETED',value:'ok'})
    const again=await gate.run(async()=>{calls++;return 'again'})
    assert.deepEqual(again,{status:'COMPLETED',value:'again'})
    assert.equal(calls,2)
  })

  await ok('request gate recovers after failure and error categories remain distinct', async()=>{
    const gate=new RouteRequestGate()
    const failed=await gate.run(async()=>{throw new MapProviderError('RATE_LIMITED','quota')})
    assert.equal(failed.status,'FAILED')
    assert.match(routeSearchErrorMessage(failed.error),/호출 한도 초과/)
    assert.match(routeSearchErrorMessage(new MapProviderError('AUTH_ERROR','bad key')),/인증\/권한 문제/)
    assert.match(routeSearchErrorMessage(new MapProviderError('NETWORK_ERROR','offline')),/네트워크 문제/)
    assert.equal((await gate.run(async()=>42)).status,'COMPLETED')
  })

  await ok('RouteRuntime key separates modes and saved RouteIntent restores its mode without API I/O', async()=>{
    const car={origin:pointA,destination:pointB,mode:'CAR'}
    const walk={...car,mode:'WALK'}
    assert.notEqual(routeRequestKey(car),routeRequestKey(walk))
    const places=[{id:'A',name:'A',position:pointA},{id:'B',name:'B',position:pointB}]
    const pair={from:{type:'VISIT',id:'a',key:'a',start:0,end:10,exitPlaceId:'A',title:'A'},to:{type:'VISIT',id:'b',key:'b',start:20,end:30,entryPlaceId:'B',title:'B'}}
    const plan={id:'x',fromNodeKey:'a',toNodeKey:'b',source:'ROUTE_API',segments:[],routeIntent:{provider:'GOOGLE',mode:'TRANSIT'}}
    assert.equal(savedConnectionRouteRequest(pair,places,plan).mode,'TRANSIT')
  })

  await ok('provider capability declarations remain expected after integration', async()=>{
    const google=createGoogleProvider('x')
    assert.deepEqual(google.capabilities.routes,{walk:true,car:true,transit:true})
    const naver=createNaverProvider('x')
    assert.deepEqual(naver.capabilities.routes,{walk:false,car:true,transit:false})
  })

  await ok('UI source keeps mode change separate from route query and persistence excludes runtime type', async()=>{
    const app=readFileSync('src/App.tsx','utf8')
    const start=app.indexOf('function changeRouteMode('), end=app.indexOf('function editAutoWaypoints(',start)
    const changeBlock=app.slice(start,end)
    assert.ok(changeBlock.includes('setDraftRouteMode'))
    assert.ok(!changeBlock.includes('searchRouteCandidates'))
    assert.ok(!changeBlock.includes('.findRoutes('))
    const persistence=readFileSync('src/persistence/contract.ts','utf8')
    assert.ok(!persistence.includes('RouteRuntimeResult'))
    assert.ok(!persistence.includes('RouteCandidate'))
  })

  console.log(`\n${passed} devpack10 route-mode tests passed.`)
} finally { rmSync(out,{recursive:true,force:true}) }
