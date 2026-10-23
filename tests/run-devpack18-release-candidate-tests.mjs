import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SqliteRepositories } from '../server/repositories.mjs'
import { createTripPlannerServer } from '../server/app.mjs'
import { validateTripSnapshot } from '../server/snapshotValidation.mjs'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}

await ok('DB migration framework keeps telemetry tables and advances through later compatible migrations',async()=>{
  const repos=new SqliteRepositories(':memory:')
  try{
    assert.equal(repos.schemaVersion,5)
    const versions=repos.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(x=>Number(x.version))
    assert.deepEqual(versions,[1,2,3,4,5])
    assert.ok(repos.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='telemetry_events'").get())
    assert.ok(repos.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='measurement_runs'").get())
  }finally{repos.close()}
})

await ok('Snapshot v2 accepts numeric width while v1 XL remains valid legacy input',async()=>{
  const base={tripId:'t',name:'Trip',mapProvider:'GOOGLE',places:[],regions:[],visits:[],bucketItems:[],bases:[],transports:[],labels:[],plans:{},timelineView:{viewStart:600,viewEnd:2160}}
  assert.equal(validateTripSnapshot({schemaVersion:2,...base,mapSettings:{connectionWidthPx:17}}).mapSettings.connectionWidthPx,17)
  assert.equal(validateTripSnapshot({schemaVersion:1,...base,mapSettings:{connectionSize:'XLARGE'}}).mapSettings.connectionSize,'XLARGE')
  assert.throws(()=>validateTripSnapshot({schemaVersion:2,...base,mapSettings:{connectionWidthPx:25}}),/1 to 24/)
})

await ok('numeric width normalizer migrates old presets and clamps integer input',async()=>{
  const out=mkdtempSync(path.join(tmpdir(),'tripplanner-dp18-width-'))
  try{
    execFileSync('tsc',['--target','ES2022','--module','commonjs','--moduleResolution','node','--skipLibCheck','--outDir',out,'src/map/tripMapSettings.ts'],{stdio:'pipe'})
    const req=createRequire(import.meta.url),settings=req(path.join(out,'tripMapSettings.js'))
    assert.equal(settings.normalizeTripMapSettings({connectionSize:'XLARGE'}).connectionWidthPx,9)
    assert.equal(settings.normalizeTripMapSettings({connectionWidthPx:17.6}).connectionWidthPx,18)
    assert.equal(settings.normalizeTripMapSettings({connectionWidthPx:100}).connectionWidthPx,24)
    assert.equal(settings.normalizeTripMapSettings({connectionWidthPx:0}).connectionWidthPx,1)
  }finally{rmSync(out,{recursive:true,force:true})}
})

await ok('measurement run tags internal usage events and reports grouped counts',async()=>{
  const repos=new SqliteRepositories(':memory:')
  const server=createTripPlannerServer({tripRepository:repos.trips,accessRepository:repos.access,telemetryRepository:repos.telemetry,databaseSchemaVersion:repos.schemaVersion})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const base=`http://127.0.0.1:${server.address().port}`
  try{
    let r=await fetch(`${base}/api/trips`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Measure',mapProvider:'GOOGLE'})});assert.equal(r.status,201);const created=await r.json();const tripId=created.snapshot.tripId
    r=await fetch(`${base}/api/admin/measurement-runs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label:'RC run'})});assert.equal(r.status,201);const run=await r.json()
    for(const eventType of ['GOOGLE_DYNAMIC_MAP','GOOGLE_GEOCODING','GOOGLE_GEOCODING']){r=await fetch(`${base}/api/telemetry`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventType,provider:'GOOGLE',tripId})});assert.equal(r.status,202)}
    r=await fetch(`${base}/api/admin/usage`);assert.equal(r.status,200);const usage=await r.json();assert.equal(usage.activeRun.id,run.id);const current=usage.recentRuns.find(x=>x.id===run.id);assert.equal(current.counts.GOOGLE_DYNAMIC_MAP,1);assert.equal(current.counts.GOOGLE_GEOCODING,2)
    r=await fetch(`${base}/api/admin/measurement-runs/${run.id}/stop`,{method:'POST'});assert.equal(r.status,200)
  }finally{await new Promise(resolve=>server.close(resolve));repos.close()}
})

await ok('Google billing-relevant call sites emit internal counters without query/place payloads',async()=>{
  const search=await readFile('src/map/provider/google/GooglePlaceSearchProvider.ts','utf8')
  const resolver=await readFile('src/map/provider/google/GooglePlaceResolver.ts','utf8')
  const route=await readFile('src/map/provider/google/GoogleRouteProvider.ts','utf8')
  const renderer=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  const telemetry=await readFile('src/telemetry.ts','utf8')
  assert.match(search,/GOOGLE_AUTOCOMPLETE_REQUEST/);assert.match(search,/GOOGLE_TEXT_SEARCH_PRO/);assert.match(search,/GOOGLE_PLACE_DETAILS_ESSENTIALS/)
  assert.match(resolver,/GOOGLE_PLACE_DETAILS_PRO/);assert.match(resolver,/GOOGLE_GEOCODING/)
  assert.match(route,/GOOGLE_COMPUTE_ROUTES_ESSENTIALS/);assert.match(renderer,/GOOGLE_DYNAMIC_MAP/)
  assert.doesNotMatch(telemetry,/query|placeId|address/i)
})

await ok('capture mode is presentation-only and hides the bucket without adding snapshot state',async()=>{
  const app=await readFile('src/App.tsx','utf8'),css=await readFile('src/styles/poc.css','utf8'),codec=await readFile('src/persistence/snapshotCodec.ts','utf8')
  assert.match(app,/captureMode/);assert.match(app,/UX_CAPTURE_ENTER/);assert.match(app,/!captureMode&&<Bucket/)
  assert.match(css,/\.capture-workspace\{grid-template-columns/);assert.match(css,/\.capture-mode \.bucket\{display:none/)
  assert.doesNotMatch(codec,/captureMode/)
})

await ok('Management exposes usage windows, Measurement Run controls, and DB schema version',async()=>{
  const page=await readFile('src/components/AuthPages.tsx','utf8'),api=await readFile('src/authApi.ts','utf8')
  assert.match(page,/usage-window-grid/);assert.match(page,/startMeasurement/);assert.match(page,/stopMeasurement/);assert.match(page,/databaseSchema/)
  assert.match(api,/\/api\/admin\/usage/);assert.match(api,/measurement-runs/)
})

console.log(`\n${passed} devpack18 release-candidate tests passed.`)
