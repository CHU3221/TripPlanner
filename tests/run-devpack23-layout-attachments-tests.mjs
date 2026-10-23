import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SqliteRepositories } from '../server/repositories.mjs'
import { createEmptyTripSnapshot, validateTripSnapshot } from '../server/snapshotValidation.mjs'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}

await ok('map providers no longer hard-restrict world panning and expose fit for itinerary viewport',async()=>{
  const google=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  const naver=await readFile('src/map/provider/naver/NaverMapRenderer.ts','utf8')
  assert.doesNotMatch(google,/strictBounds\s*:\s*true|restriction\s*:/)
  assert.doesNotMatch(naver,/maxBounds\s*:/)
  assert.match(google,/fit\(positions:/)
  assert.match(naver,/fit\(positions:/)
  assert.match(google,/gapIndex/)
  assert.match(naver,/gapIndex/)
})

await ok('normal map starts from earliest positioned timeline schedule and falls back to Seoul',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  assert.match(app,/timelineLocationCandidates=/)
  assert.match(app,/\.sort\(\(a,b\)=>a\.at-b\.at\)/)
  assert.match(app,/defaultMapPoint=\{lat:37\.5665,lng:126\.978\}/)
  assert.match(app,/initialMapCandidate=timelineLocationCandidates\[0\]/)
  assert.match(app,/normalAutoFitPoints=\[initialMapCandidate\?\.point\?\?defaultMapPoint\]/)
})

await ok('sidebar hides its scrollbar but supports wheel scrolling while dragging',async()=>{
  const sidebar=await readFile('src/components/Sidebar.tsx','utf8')
  const css=await readFile('src/styles/visualIdentity.css','utf8')
  assert.match(sidebar,/if\(!dragActive\)return/)
  assert.match(sidebar,/node\.scrollTop\+=e\.deltaY/)
  assert.match(css,/\.bucket\{scrollbar-width:none/)
  assert.match(css,/\.bucket::-webkit-scrollbar/)
})

await ok('delete drop target floats over the lower center of the map instead of consuming sidebar length',async()=>{
  const sidebar=await readFile('src/components/Sidebar.tsx','utf8')
  const map=await readFile('src/components/TripMap.tsx','utf8')
  const css=await readFile('src/styles/visualIdentity.css','utf8')
  assert.doesNotMatch(sidebar,/function TrashDropZone/)
  assert.match(map,/className=\{\['map-trash-zone'/)
  assert.match(css,/\.map-trash-zone\{position:absolute[^}]*left:50%[^}]*bottom:72px/)
  assert.match(css,/max-width:calc\(100% - 160px\)/)
})

await ok('snapshot v3 accepts short summary, detailed memo, and image attachment references',async()=>{
  const snapshot=createEmptyTripSnapshot({tripId:'dp23',name:'DP23',mapProvider:'GOOGLE'})
  snapshot.visits.push({id:'v1',start:60,end:120,title:'Visit',detail:'짧은 요약',notes:'예약은 한 달 전에',attachments:[{id:'a1',fileName:'ticket.png',mimeType:'image/png',sizeBytes:4}]})
  const validated=validateTripSnapshot(snapshot)
  assert.equal(validated.schemaVersion,3)
  assert.equal(validated.visits[0].detail,'짧은 요약')
  assert.equal(validated.visits[0].notes,'예약은 한 달 전에')
  assert.equal(validated.visits[0].attachments[0].id,'a1')
})

await ok('attachment repository stores bytes outside the snapshot and removes orphaned files on reconcile',async()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'tripplanner-dp23-'))
  const dbPath=path.join(root,'tripplanner.sqlite')
  const repos=new SqliteRepositories(dbPath)
  try{
    assert.equal(repos.schemaVersion,5)
    const snapshot=createEmptyTripSnapshot({tripId:'t1',name:'T1',mapProvider:'GOOGLE'})
    await repos.trips.create(snapshot)
    const created=await repos.attachments.create({id:'a1',tripId:'t1',fileName:'ticket.png',mimeType:'image/png',bytes:Buffer.from([1,2,3,4])})
    assert.equal(created.sizeBytes,4)
    assert.deepEqual([...((await repos.attachments.get('t1','a1')).bytes)],[1,2,3,4])
    // Another collaborator saving before this draft is committed must not delete a fresh upload.
    await repos.attachments.reconcile('t1',new Set())
    assert.ok(await repos.attachments.get('t1','a1'))
    // First successful save commits the reference; a later save that removes it deletes the file.
    await repos.attachments.reconcile('t1',new Set(['a1']))
    assert.equal((await repos.attachments.list('t1'))[0].committed,true)
    await repos.attachments.reconcile('t1',new Set())
    assert.equal(await repos.attachments.get('t1','a1'),null)
    await repos.attachments.create({id:'draft',tripId:'t1',fileName:'draft.webp',mimeType:'image/webp',bytes:Buffer.from([5])})
    assert.equal(await repos.attachments.cleanupExpiredDrafts(0),1)
    assert.equal(await repos.attachments.get('t1','draft'),null)
  } finally { repos.close(); rmSync(root,{recursive:true,force:true}) }
})

await ok('image drag/drop attachment editor is shared by create, timeline, bucket/plan-b and base editors',async()=>{
  const attachment=await readFile('src/components/AttachmentEditor.tsx','utf8')
  const fields=await readFile('src/components/ScheduleEditorFields.tsx','utf8')
  const add=await readFile('src/components/AddScheduleModal.tsx','utf8')
  const visit=await readFile('src/components/VisitModal.tsx','utf8')
  const bucket=await readFile('src/components/BucketItemModal.tsx','utf8')
  const base=await readFile('src/components/BaseModal.tsx','utf8')
  assert.match(attachment,/onDrop=/)
  assert.match(attachment,/dataTransfer\.files/)
  assert.match(attachment,/uploadTripAttachment/)
  assert.match(fields,/<AttachmentEditor/)
  for(const source of [add,visit,bucket,base]) assert.match(source,/<ScheduleEditorFields/)
})

await ok('trip save reconciles attachment references and trip deletion clears attachment files',async()=>{
  const server=await readFile('server/app.mjs','utf8')
  assert.match(server,/attachmentRefs/)
  assert.match(server,/attachmentRepository\.reconcile/)
  assert.match(server,/attachmentRepository\.deleteTripFiles/)
  assert.match(server,/\/attachments/)
})

await ok('capture is full-width two-column itinerary/map/detail layout with print-safe map replacement',async()=>{
  const capture=await readFile('src/components/CaptureTimeline.tsx','utf8')
  const css=await readFile('src/styles/visualIdentity.css','utf8')
  assert.match(capture,/capture-page-header/)
  assert.match(capture,/capture-page-timeline/)
  assert.match(capture,/capture-page-detail/)
  assert.match(capture,/capture-attachment-grid/)
  assert.match(capture,/capture-print-map-placeholder/)
  assert.match(css,/width:100%!important;max-width:none!important/)
  assert.match(css,/grid-template-columns:minmax\(320px,36%\) minmax\(0,64%\)/)
  assert.match(css,/@media print[\s\S]*\.capture-mode \.map-panel\{display:none!important\}/)
})

await ok('capture and editor keep short summary separate from detailed notes',async()=>{
  const domain=await readFile('src/domain/place.ts','utf8')
  const editor=await readFile('src/components/ScheduleEditorFields.tsx','utf8')
  const capture=await readFile('src/components/CaptureTimeline.tsx','utf8')
  assert.match(domain,/Short summary shown on Timeline\/cards/)
  assert.match(domain,/Long-form planning note/)
  assert.match(editor,/detailedNotes/)
  assert.match(capture,/visit\?\.detail/)
  assert.match(capture,/visit\.notes/)
})

console.log(`\n${passed} devpack23 layout/attachment tests passed.`)
