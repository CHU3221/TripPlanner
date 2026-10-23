import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const out=mkdtempSync(path.join(tmpdir(),'trip-devpack13-'))
let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}
try{
  symlinkSync(path.resolve('node_modules'),path.join(out,'node_modules'),'dir')
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0',
    '--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--esModuleInterop','--lib','ES2022,DOM','--skipLibCheck',
    'src/placeSearchUi.ts'],{stdio:'pipe'})
  const req=createRequire(import.meta.url)
  const {searchPlaceCandidates}=req(path.join(out,'src/placeSearchUi.js'))

  await ok('unified place search uses one text request when results exist',async()=>{
    const calls=[]
    const candidate={provider:'GOOGLE',name:'서울역',position:{lat:37.55,lng:126.97}}
    const provider={searchPlaces:async q=>{calls.push(['text',q]);return[candidate]},searchAddress:async q=>{calls.push(['address',q]);return[]}}
    assert.deepEqual(await searchPlaceCandidates(provider,' 서울역 '),[candidate])
    assert.deepEqual(calls,[['text','서울역']])
  })

  await ok('geocoding is only a no-result fallback',async()=>{
    const calls=[]
    const address={provider:'GOOGLE',name:'272 Gonghang-ro',position:{lat:37.46,lng:126.44}}
    const provider={searchPlaces:async q=>{calls.push(['text',q]);return[]},searchAddress:async q=>{calls.push(['address',q]);return[address]}}
    assert.deepEqual(await searchPlaceCandidates(provider,'공항로 272'),[address])
    assert.deepEqual(calls,[['text','공항로 272'],['address','공항로 272']])
  })

  await ok('planning, bucket, visit, base, and transport share PlacePicker',async()=>{
    const files=['src/components/AddScheduleModal.tsx','src/components/BucketItemModal.tsx','src/components/VisitModal.tsx','src/components/BaseModal.tsx','src/components/TransportPlacePicker.tsx']
    for(const file of files) assert.match(readFileSync(file,'utf8'),/PlacePicker/)
  })

  await ok('toolbar navigation and edit actions are one ordered group',async()=>{
    const app=readFileSync('src/App.tsx','utf8')
    const group=app.match(/<div className="history-controls">([\s\S]*?)<\/div><\/header>/)?.[1]??''
    const tokens=['text.topbar.backToList','save-trip-button','title={text.common.undo}','title={text.common.redo}','text.topbar.addSchedule']
    let at=-1
    for(const token of tokens){const next=group.indexOf(token);assert.ok(next>at,token);at=next}
  })

  await ok('timeline cards show duration and preserve memo line breaks',async()=>{
    const timeline=readFileSync('src/components/Timeline.tsx','utf8')
    const css=readFileSync('src/styles/timeline.css','utf8')
    assert.match(timeline,/visit-time-row/)
    assert.match(timeline,/visit-duration/)
    assert.match(timeline,/durationText\(visit\.end-visit\.start\)/)
    assert.match(css,/white-space:\s*pre-wrap/)
    assert.match(css,/overflow-wrap:\s*anywhere/)
  })

  await ok('bucket, PLAN B, and BASE are separate sidebar sections',async()=>{
    const sidebar=readFileSync('src/components/Sidebar.tsx','utf8')
    assert.match(sidebar,/ui\.sidebar\.planB/)
    assert.match(sidebar,/ui\.sidebar\.base/)
    assert.match(sidebar,/planningKind==='NEARBY'/)
    assert.match(sidebar,/planningKind!=='NEARBY'/)
  })

  await ok('timeline-origin drag supports edge autoscroll and wheel scrolling',async()=>{
    const timeline=readFileSync('src/components/Timeline.tsx','utf8')
    assert.match(timeline,/DRAG_SCROLL_EDGE_PX/)
    assert.match(timeline,/requestAnimationFrame\(tick\)/)
    assert.match(timeline,/pointerStartTime:localPointerTime/)
    assert.match(timeline,/function dragWheel/)
    assert.match(timeline,/onWheel=\{dragWheel\}/)
    assert.match(timeline,/refreshPlacementAfterScroll\(\)/)
  })

  await ok('Google picker uses explicit Search/Enter autocomplete with stale-result protection',async()=>{
    const picker=readFileSync('src/components/PlacePicker.tsx','utf8')
    const provider=readFileSync('src/map/provider/google/GooglePlaceSearchProvider.ts','utf8')
    assert.match(picker,/Provider network requests only start after Search\/Enter/)
    assert.match(picker,/<form className="place-search-row" onSubmit=/)
    assert.match(picker,/button type="submit"/)
    assert.doesNotMatch(picker,/setTimeout\([^\n]*300|300\s*ms|debounce/i)
    assert.match(picker,/requestGenerationRef/);assert.match(picker,/createAutocompleteSession/)
    assert.match(provider,/fetchAutocompleteSuggestions/);assert.match(provider,/AutocompleteSessionToken/)
    assert.match(provider,/fields: \['id', 'formattedAddress', 'location'\]/)
    assert.ok(!provider.match(/fetchFields\(\{ fields: \[[^\]]*displayName/))
  })

  await ok('map background dismisses popup while marker/path overlays suppress background dismissal',async()=>{
    const map=readFileSync('src/components/TripMap.tsx','utf8')
    const contract=readFileSync('src/map/provider/contract.ts','utf8')
    const google=readFileSync('src/map/provider/google/GoogleMapRenderer.ts','utf8')
    const naver=readFileSync('src/map/provider/naver/NaverMapRenderer.ts','utf8')
    assert.match(contract,/onMapClick/);assert.match(map,/onMapClick:\(\)=>\{setPoiSelection\(null\);selectHandlerRef\.current\(null\)\}/)
    assert.match(google,/suppressBackgroundClickForTurn/);assert.match(naver,/suppressBackgroundClickForTurn/)
  })

  await ok('direction arrow color is independent and defaults to white',async()=>{
    const contract=readFileSync('src/map/provider/contract.ts','utf8')
    const config=readFileSync('config/map-appearance.config.json','utf8')
    const google=readFileSync('src/map/provider/google/GoogleMapRenderer.ts','utf8')
    const naver=readFileSync('src/map/provider/naver/NaverMapRenderer.ts','utf8')
    assert.match(contract,/directionColor/);assert.match(config,/"directionColor": "#FFFFFF"/)
    const thickness=readFileSync('src/map/pathThickness.ts','utf8')
    assert.match(google,/arrowColor/);assert.match(google,/strokeWeight: arrow\.googleOutlineWeight/)
    assert.match(naver,/arrowColor/);assert.match(naver,/naverShadowPx/)
    assert.match(thickness,/0\.7\*Math\.max/);assert.match(thickness,/1\.5\*factor/)
  })

  await ok('hydrated Place names reproject MajorTransport endpoint card labels',async()=>{
    const app=readFileSync('src/App.tsx','utf8')
    const codec=readFileSync('src/persistence/snapshotCodec.ts','utf8')
    assert.match(codec,/refreshMajorTransportPlaceProjection/)
    assert.match(app,/setTransports\(current=>current\.map\(transport=>refreshMajorTransportPlaceProjection\(transport,hydrated\.places\)\)\)/)
  })

  await ok('connection arrows scale with configured width while remaining bounded',async()=>{
    const thickness=readFileSync('src/map/pathThickness.ts','utf8')
    const google=readFileSync('src/map/provider/google/GoogleMapRenderer.ts','utf8')
    const naver=readFileSync('src/map/provider/naver/NaverMapRenderer.ts','utf8')
    assert.match(thickness,/Math\.sqrt\(base\/DEFAULT_CONNECTION_WIDTH_PX\)/)
    assert.match(thickness,/Math\.min\(3,/)
    assert.match(google,/scale:\s*arrow\.googleScale/)
    assert.match(google,/repeat:\s*`\$\{arrow\.repeatPx\}px`/)
    assert.match(naver,/sampleScreenSpaceArrows\(points,\s*arrowMetrics\.repeatPx/)
    assert.match(naver,/\$\{arrowMetrics\.naverFontPx\}px/)
  })

  await ok('map popup exposes useful schedule details and edit actions',async()=>{
    const map=readFileSync('src/components/TripMap.tsx','utf8')
    for(const token of ['durationText','trip-map-related-card','x.detail','onEditVisit','onEditBucketItem','onEditBase','onEditTransport','relatedBases','relatedTransports','text.mapPopup.focus'])assert.ok(map.includes(token),token)
  })

  await ok('MajorTransport hover highlights both endpoint pins and uses Material Symbols',async()=>{
    const app=readFileSync('src/App.tsx','utf8')
    const map=readFileSync('src/components/TripMap.tsx','utf8')
    const timeline=readFileSync('src/components/Timeline.tsx','utf8')
    assert.match(app,/hoveredTransportId/)
    assert.match(map,/new Set\(\[transport\.departure\.placeId,transport\.arrival\.placeId\]\)/)
    assert.match(map,/hoveredTransportPlaces\.has\(place\.id\)/)
    assert.match(timeline,/material-symbols-rounded transport-icon/)
    for(const icon of ["'train'","'flight'","'directions_boat'","'directions_bus'"])assert.ok(app.includes(icon),icon)
  })

  await ok('long place text is constrained without changing stored data',async()=>{
    const css=readFileSync('src/styles/panels.css','utf8')
    assert.match(css,/place-picker-selected-address/)
    assert.match(css,/line-clamp/)
    assert.match(css,/overflow-wrap:\s*anywhere/)
  })

  await ok('generic persistent place icon field remains deferred',async()=>{
    const place=readFileSync('src/domain/place.ts','utf8')
    const tripPlace=place.match(/export type TripPlace\s*=\s*\{([\s\S]*?)\n\}/)?.[1]??''
    assert.ok(!/\bicon\??\s*:/.test(tripPlace))
  })

  console.log(`\n${passed} devpack13 UX tests passed.`)
}finally{rmSync(out,{recursive:true,force:true})}
