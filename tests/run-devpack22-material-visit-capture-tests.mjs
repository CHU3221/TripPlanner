import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createEmptyTripSnapshot, validateTripSnapshot } from '../server/snapshotValidation.mjs'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}

await ok('visit properties are stable semantic data and survive Bucket/Timeline conversion',async()=>{
  const domain=await readFile('src/domain/place.ts','utf8')
  const app=await readFile('src/App.tsx','utf8')
  const drop=await readFile('src/timelineDrop.ts','utf8')
  assert.match(domain,/export type VisitPropertyIcon/)
  assert.match(domain,/expectedCost\?:ExpectedCost/)
  assert.match(domain,/checklist\?:string\[\]/)
  assert.match(app,/visitIcon:item\.visitIcon,expectedCost:item\.expectedCost,checklist:item\.checklist/)
  assert.match(app,/visitIcon:visit\.visitIcon,expectedCost:visit\.expectedCost,checklist:visit\.checklist/)
  assert.match(drop,/visitIcon/);assert.match(drop,/expectedCost/);assert.match(drop,/checklist/)
})

await ok('visit property editor uses Material Symbols and user-owned cost/preparation fields',async()=>{
  const editor=await readFile('src/components/ScheduleEditorFields.tsx','utf8')
  const props=await readFile('src/visitProperties.ts','utf8')
  assert.match(editor,/visit-icon-picker/)
  assert.match(editor,/expectedCostAmount/)
  assert.match(editor,/checklistText/)
  assert.match(props,/FOOD.*restaurant/)
  assert.match(props,/HOTEL.*hotel/)
})

await ok('server validates visit icon, expected cost, and preparation payloads',async()=>{
  const snapshot=createEmptyTripSnapshot({tripId:'DP22',name:'DP22',mapProvider:'GOOGLE'})
  snapshot.visits.push({id:'V',start:0,end:60,title:'Visit',visitIcon:'FOOD',expectedCost:{amount:12000,currency:'KRW'},checklist:['예약 QR']})
  assert.equal(validateTripSnapshot(snapshot).visits[0].visitIcon,'FOOD')
  snapshot.visits[0].visitIcon='INVALID'
  assert.throws(()=>validateTripSnapshot(snapshot),/visitIcon/)
})

await ok('map pins receive semantic visit icons while cards only use an accent',async()=>{
  const map=await readFile('src/components/TripMap.tsx','utf8')
  const google=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  const sidebar=await readFile('src/components/Sidebar.tsx','utf8')
  const timeline=await readFile('src/components/Timeline.tsx','utf8')
  assert.match(map,/visitIconSymbol/)
  assert.match(google,/trip-map-pin-icon/)
  assert.match(sidebar,/visit-property-accent/)
  assert.match(timeline,/visit-property-accent/)
})

await ok('map defaults remain explicit and provider-neutral projection is controlled above the renderer',async()=>{
  const google=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  const naver=await readFile('src/map/provider/naver/NaverMapRenderer.ts','utf8')
  assert.match(google,/const center = this\.markerSnapshot\[0\]\?\.position/)
  assert.match(naver,/const first = this\.markerSnapshot\[0\]\?\.position/)
})

await ok('dragging suppresses accidental text selection and exposes contextual delete drop target',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const sidebar=await readFile('src/components/Sidebar.tsx','utf8')
  const timeline=await readFile('src/components/Timeline.tsx','utf8')
  const css=await readFile('src/styles/visualIdentity.css','utf8')
  assert.match(app,/tripplanner-dragging/)
  const map=await readFile('src/components/TripMap.tsx','utf8')
  assert.match(map,/data-trash-drop="true"/)
  assert.match(timeline,/'DELETE'/)
  assert.match(app,/function trashPayload/)
  assert.match(css,/body\.tripplanner-dragging/)
  assert.match(css,/user-select:none/)
})

await ok('capture mode is a natural-height portrait document for scroll capture',async()=>{
  const capture=await readFile('src/components/CaptureTimeline.tsx','utf8')
  const app=await readFile('src/App.tsx','utf8')
  const css=await readFile('src/styles/visualIdentity.css','utf8')
  assert.match(capture,/capture-document/)
  assert.match(capture,/capture-itinerary-list/)
  assert.match(capture,/capture-day-summary/)
  assert.doesNotMatch(capture,/CaptureOrientation/)
  assert.match(app,/capture-document-mode/)
  assert.match(css,/body\.capture-document-mode\{overflow-y:auto/)
  assert.match(css,/\.app\.capture-mode\{height:auto/)
  assert.match(css,/capture-workspace\{grid-template-columns:minmax\(0,760px\)/)
})

await ok('capture summary aggregates user-authored expected costs and preparations',async()=>{
  const capture=await readFile('src/components/CaptureTimeline.tsx','utf8')
  assert.match(capture,/const costs=useMemo/)
  assert.match(capture,/const preparations=useMemo/)
  assert.match(capture,/formatExpectedCost/)
  assert.match(capture,/capture-summary-tags/)
})

await ok('v0.22 uses Material interaction tokens and Mica-like sidebar surfaces',async()=>{
  const css=await readFile('src/styles/visualIdentity.css','utf8')
  assert.match(css,/--md-sys-color-primary/)
  assert.match(css,/--mica-surface:/)
  assert.match(css,/\.bucket\{background:var\(--mica-surface\);backdrop-filter:none/)
  assert.match(css,/Glass is reserved|True backdrop glass is reserved/i)
  assert.match(css,/\.map-trash-zone\{[^}]*backdrop-filter:blur/)
})

console.log(`\n${passed} devpack22 material/mica/visit/capture tests passed.`)
