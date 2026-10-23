import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const out=mkdtempSync(path.join(tmpdir(),'tripplanner-devpack16-hydration-'))
let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}
try{
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0','--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--lib','ES2022,DOM','--skipLibCheck','src/persistence/providerHydration.ts'],{stdio:'pipe'})
  const req=createRequire(import.meta.url)
  const {hydrateProviderPlaces}=req(path.join(out,'src/persistence/providerHydration.js'))

  await ok('position-only hydration uses server cache and makes zero Google requests',async()=>{
    let imports=0
    globalThis.window={google:{maps:{importLibrary:async()=>{imports++;throw new Error('must not call Google')}}}}
    globalThis.fetch=async()=>({ok:true,json:async()=>({enabled:true,hit:true,value:{lat:37.5,lng:127},ttlHours:720,maxTtlHours:720})})
    const place={id:'p',name:'내 이름',address:'내 주소',providerRef:{provider:'GOOGLE',id:'pid'},provenance:{name:{source:'USER'},address:{source:'USER'},position:{source:'PROVIDER',provider:'GOOGLE'}}}
    const result=await hydrateProviderPlaces('GOOGLE',[place],{googleApiKey:'k',tripId:'T',googlePlacesPositionCacheTtlHours:720})
    assert.equal(result.requestCount,0);assert.equal(result.cacheHitCount,1);assert.equal(imports,0);assert.deepEqual(result.places[0].position,{lat:37.5,lng:127})
  })

  await ok('cache hit removes location from Google Place Details field request',async()=>{
    const fields=[]
    class Place{constructor(){this.displayName='';this.formattedAddress=''}async fetchFields(opts){fields.push(...opts.fields);this.displayName='서울역';this.formattedAddress='서울특별시'}}
    globalThis.window={google:{maps:{importLibrary:async name=>{assert.equal(name,'places');return {Place}}}}}
    globalThis.fetch=async()=>({ok:true,json:async()=>({enabled:true,hit:true,value:{lat:37.55,lng:126.97},ttlHours:720,maxTtlHours:720})})
    const place={id:'p',name:'저장된 장소',providerRef:{provider:'GOOGLE',id:'pid'},provenance:{name:{source:'PROVIDER',provider:'GOOGLE'},address:{source:'PROVIDER',provider:'GOOGLE'},position:{source:'PROVIDER',provider:'GOOGLE'}}}
    const result=await hydrateProviderPlaces('GOOGLE',[place],{googleApiKey:'k',tripId:'T',googlePlacesPositionCacheTtlHours:720})
    assert.deepEqual(fields,['displayName','formattedAddress']);assert.equal(result.requestCount,1);assert.equal(result.cacheHitCount,1);assert.deepEqual(result.places[0].position,{lat:37.55,lng:126.97})
  })

  await ok('cache miss fetches Google location then writes position to server cache',async()=>{
    const fields=[];let writes=0
    class Place{constructor(){this.displayName='';this.formattedAddress='';this.location=undefined}async fetchFields(opts){fields.push(...opts.fields);this.displayName='서울역';this.formattedAddress='서울특별시';this.location={lat:()=>37.55,lng:()=>126.97}}}
    globalThis.window={google:{maps:{importLibrary:async name=>{assert.equal(name,'places');return {Place}}}}}
    globalThis.fetch=async(_url,init)=>{
      if(init?.method==='PUT'){writes++;return {ok:true,json:async()=>({stored:true})}}
      return {ok:true,json:async()=>({enabled:true,hit:false,ttlHours:720,maxTtlHours:720})}
    }
    const place={id:'p',name:'저장된 장소',providerRef:{provider:'GOOGLE',id:'pid'},provenance:{name:{source:'PROVIDER',provider:'GOOGLE'},address:{source:'PROVIDER',provider:'GOOGLE'},position:{source:'PROVIDER',provider:'GOOGLE'}}}
    const result=await hydrateProviderPlaces('GOOGLE',[place],{googleApiKey:'k',tripId:'T',googlePlacesPositionCacheTtlHours:720})
    assert.deepEqual(fields,['displayName','formattedAddress','location']);assert.equal(result.cacheWriteCount,1);assert.equal(writes,1);assert.deepEqual(result.places[0].position,{lat:37.55,lng:126.97})
  })

  console.log(`\n${passed} devpack16 hydration cache tests passed.`)
}finally{rmSync(out,{recursive:true,force:true})}
