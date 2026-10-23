import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEmptyTripSnapshot, validateTripSnapshot } from '../server/snapshotValidation.mjs'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}

await ok('saved button has explicit readable light-state contrast despite glass button rule',async()=>{
  const css=await readFile('src/styles/poc.css','utf8')
  assert.match(css,/\.history-controls \.save-trip-button\{background:#27342c!important;color:#fff!important/)
  assert.match(css,/\.history-controls \.save-trip-button:disabled\{background:#f7f8f6!important;color:#4f5952!important/)
})

await ok('manual Connection stores an optional user-authored expected duration',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const modal=await readFile('src/components/ConnectionModal.tsx','utf8')
  const model=await readFile('src/model.ts','utf8')
  assert.match(model,/expectedDurationMinutes\?: number/)
  assert.match(modal,/ui\.connection\.expectedDuration/)
  assert.match(app,/expectedDurationMinutes:expectedDuration/)
  assert.match(app,/!auto&&Number\.isFinite\(draftConnectionExpectedDuration\)/)

  const snapshot=createEmptyTripSnapshot({tripId:'DP20',name:'DP20',mapProvider:'GOOGLE'})
  snapshot.plans['A>B']={id:'A>B',fromNodeKey:'A',toNodeKey:'B',source:'MANUAL',user:{expectedDurationMinutes:45},segments:[]}
  assert.equal(validateTripSnapshot(snapshot).plans['A>B'].user.expectedDurationMinutes,45)
  snapshot.plans['A>B'].user.expectedDurationMinutes=10081
  assert.throws(()=>validateTripSnapshot(snapshot),/expectedDurationMinutes/)
})

await ok('Timeline manual Connection summary prefers explicit expected duration over segment total',async()=>{
  const source=await readFile('src/components/Timeline.tsx','utf8')
  assert.match(source,/const manualExpected=/)
  assert.match(source,/const total=runtimeMinutes\?\?manualExpected\?\?segments\.reduce/)
  assert.match(source,/manualExpected!==undefined/)
})

await ok('capture view remains paged and full-day while using the newer portrait document layout',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const capture=await readFile('src/components/CaptureTimeline.tsx','utf8')
  const catalog=await readFile('src/i18n/locales/ko-KR.ts','utf8')
  assert.match(app,/captureMode\?<CaptureTimeline/)
  assert.match(capture,/capture-document/)
  assert.match(capture,/capture-day-strip/)
  assert.match(capture,/>24:00</)
  assert.match(capture,/setPage\(x=>Math\.max\(0,x-1\)\)/)
  assert.match(capture,/setPage\(x=>Math\.min\(days\.length-1,x\+1\)\)/)
  assert.doesNotMatch(capture,/onPointerDown|onDrag|draggable/)
  assert.match(catalog,/scrollCaptureHelp:/)
  assert.match(catalog,/nextDay:'다음 날'/)
})


await ok('capture day paging also scopes the map to the selected day',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const capture=await readFile('src/components/CaptureTimeline.tsx','utf8')
  assert.match(capture,/onDayChange\?\.\(dayStart\)/)
  assert.match(app,/captureVisits=captureMode&&captureDayStart!==null/)
  assert.match(app,/bucketItems=\{captureMode\?\[\]:bucketItems\}/)
  assert.match(app,/visits=\{captureVisits\} transports=\{captureTransports\}/)
})

console.log(`\n${passed} devpack20 presentation/connection tests passed.`)
