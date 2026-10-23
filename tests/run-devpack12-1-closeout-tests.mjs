import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createEmptyTripSnapshot, validateTripSnapshot } from '../server/snapshotValidation.mjs'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}
const out=mkdtempSync(path.join(tmpdir(),'tripplanner-devpack12-1-'))
try{
  await ok('new trips carry a persisted Timeline view and validator rejects invalid ranges',()=>{
    const snapshot=createEmptyTripSnapshot({tripId:'t',name:'T',mapProvider:'GOOGLE'})
    assert.deepEqual(snapshot.timelineView,{viewStart:600,viewEnd:2160})
    assert.doesNotThrow(()=>validateTripSnapshot(snapshot))
    assert.throws(()=>validateTripSnapshot({...snapshot,timelineView:{viewStart:100,viewEnd:120}}))
  })

  await ok('snapshot codec round-trips Timeline display range and old snapshots get default',()=>{
    execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0','--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--resolveJsonModule','--esModuleInterop','--lib','ES2022,DOM','--skipLibCheck','src/persistence/snapshotCodec.ts'],{stdio:'pipe'})
    const require=createRequire(import.meta.url),codec=require(path.join(out,'src/persistence/snapshotCodec.js'))
    const state={tripId:'t',name:'T',mapProvider:'GOOGLE',places:[],regions:[],visits:[],bucketItems:[],bases:[],transports:[],labels:[],plans:{},timelineView:{viewStart:1440,viewEnd:7200},dayColors:{}}
    const snapshot=codec.createTripSnapshot(state)
    assert.deepEqual(snapshot.timelineView,{viewStart:1440,viewEnd:7200})
    assert.deepEqual(codec.restoreTripSnapshot(snapshot).timelineView,{viewStart:1440,viewEnd:7200})
    const {timelineView,...legacy}=snapshot
    assert.deepEqual(codec.restoreTripSnapshot(legacy).timelineView,{viewStart:600,viewEnd:2160})
  })

  await ok('Timeline UI removes Time Skip and groups date color with axis control',()=>{
    const timeline=readFileSync('src/components/Timeline.tsx','utf8')
    assert.ok(!timeline.includes('시간 압축'))
    assert.ok(timeline.includes('timeline-axis-toolbar'))
    assert.ok(timeline.includes('ui.timeline.dayColors')||timeline.includes('날짜 색상'))
    assert.ok(timeline.includes('onViewSettingsChange({viewStart:nextStart,viewEnd:nextEnd})'))
    assert.ok(timeline.includes('createTimelineMapper(viewSettings.viewStart,viewSettings.viewEnd,[])'))
  })

  await ok('Save button is grouped with Undo/Redo/Add Schedule',()=>{
    const app=readFileSync('src/App.tsx','utf8')
    const group=app.match(/<div className="history-controls">([\s\S]*?)<\/div><\/header>/)?.[1]??''
    assert.ok(group.includes('save-trip-button'))
    assert.ok(group.includes('undo'))
    assert.ok(group.includes('redo'))
    assert.ok(group.includes('text.topbar.addSchedule')||group.includes('일정 추가'))
    assert.ok(!app.includes('<button className="day-palette-toggle" type="button" aria-expanded={colorEditorOpen}'))
  })

  await ok('Google Place resolver falls back to Place-ID Geocoding when Place Details fails',async()=>{
    const resolverOut=path.join(out,'resolver')
    execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0','--outDir',resolverOut,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--lib','ES2022,DOM','--skipLibCheck','src/map/provider/google/GooglePlaceResolver.ts'],{stdio:'pipe'})
    const require=createRequire(import.meta.url)
    let geocodeCalls=0
    globalThis.window={google:{maps:{importLibrary:async name=>{
      if(name==='places')return {Place:class {constructor({id}){this.id=id} async fetchFields(){throw new Error('RESOURCE_EXHAUSTED')}}}
      if(name==='geocoding')return {Geocoder:class {async geocode({placeId}){geocodeCalls++;assert.equal(placeId,'pid');return {results:[{formatted_address:'서울특별시 중구 서울역',geometry:{location:{lat:()=>37.5547,lng:()=>126.9706}}}]}}}}
      throw new Error(`unexpected library ${name}`)
    }}}}
    const {resolveGooglePlaceRef}=require(path.join(resolverOut,'src/map/provider/google/GooglePlaceResolver.js'))
    const place=await resolveGooglePlaceRef('key',{provider:'GOOGLE',id:'pid'})
    assert.equal(geocodeCalls,1)
    assert.equal(place.address,'서울특별시 중구 서울역')
    assert.deepEqual(place.position,{lat:37.5547,lng:126.9706})
  })

  console.log(`\n${passed} devpack12.1 closeout tests passed.`)
}finally{rmSync(out,{recursive:true,force:true})}
