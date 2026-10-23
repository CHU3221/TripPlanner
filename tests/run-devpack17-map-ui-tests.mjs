import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateTripSnapshot } from '../server/snapshotValidation.mjs'

let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}

await ok('management page owns vertical scrolling under the overflow-hidden app shell',async()=>{
  const css=await readFile('src/styles/poc.css','utf8')
  assert.match(css,/\.management-page\{[^}]*height:100%[^}]*overflow-y:auto[^}]*overflow-x:hidden/)
})

await ok('Google default Street View, Camera, and Fullscreen controls are explicitly hidden',async()=>{
  const source=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  assert.match(source,/streetViewControl:\s*false/)
  assert.match(source,/cameraControl:\s*false/)
  assert.match(source,/fullscreenControl:\s*false/)
  assert.match(source,/zoomControl:\s*false/)
  assert.match(source,/rotateControl:\s*false/)
})

await ok('legacy XL path setting remains accepted for v1 snapshot migration',async()=>{
  const snapshot={schemaVersion:1,tripId:'t1',name:'Trip',mapProvider:'GOOGLE',places:[],regions:[],visits:[],bucketItems:[],bases:[],transports:[],labels:[],plans:{},timelineView:{viewStart:600,viewEnd:2160},mapSettings:{connectionSize:'XLARGE'}}
  assert.equal(validateTripSnapshot(snapshot).mapSettings.connectionSize,'XLARGE')
  const settings=await readFile('src/map/tripMapSettings.ts','utf8')
  assert.match(settings,/value==='XLARGE'\?9/)
})

console.log(`\n${passed} devpack17 map/UI tests passed.`)
