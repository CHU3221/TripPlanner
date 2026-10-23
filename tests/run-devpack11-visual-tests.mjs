import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const out=mkdtempSync(path.join(tmpdir(),'trip-visual-'))
let passed=0
function ok(name,fn){fn();passed++;console.log('PASS',name)}
try{
 symlinkSync(path.resolve('node_modules'),path.join(out,'node_modules'),'dir')
 execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--ignoreConfig','--ignoreDeprecations','6.0',
  '--outDir',out,'--rootDir','.','--target','ES2022','--module','commonjs','--moduleResolution','node','--resolveJsonModule','--esModuleInterop','--lib','ES2022,DOM','--skipLibCheck',
  'src/visual/appearance.ts','src/map/pathArrowSampling.ts','src/map/mapConnectionPrimitives.ts'],{stdio:'pipe'})
 const req=createRequire(import.meta.url)
 const load=filename=>req(path.join(out,filename))
 const {DAY_PALETTE,dayColor,visualColor,updateDayColor,dayKey}=load('src/visual/appearance.js')
 const {sampleScreenSpaceArrows}=load('src/map/pathArrowSampling.js')
 const {buildMapPathProjection}=load('src/map/mapConnectionPrimitives.js')
 ok('day colors stable and differ on adjacent dates',()=>{
  assert.notEqual(dayColor(60),dayColor(1440+60))
  assert.equal(dayColor(60),DAY_PALETTE[0])
  assert.equal(dayKey(1440),'2026-10-21')
 })
 ok('date override takes precedence over default palette',()=>{
  const days=updateDayColor({},'2026-10-20','#d62233')
  assert.equal(dayColor(800,days),'#d62233')
  assert.notEqual(dayColor(1440,days),'#d62233')
  assert.equal(dayColor(800,updateDayColor(days,'2026-10-20',undefined)),DAY_PALETTE[0])
 })
 ok('per-Visit direct override wins and resets to date',()=>{
  const days={'2026-10-20':'#ff0000'}
  assert.equal(visualColor('#0011aa',500,days),'#0011aa')
  assert.equal(visualColor(undefined,500,days),'#ff0000')
  assert.equal(visualColor('not-a-color',500,days),'#ff0000')
 })
 ok('color day input fails closed',()=>{
  assert.throws(()=>updateDayColor({},'__proto__','#abcdef'))
  assert.throws(()=>updateDayColor({},'2026-10-20','red'))
 })
 ok('manual Connection inherits day color',()=>{
  const places=[{id:'A',position:{lat:1,lng:1}},{id:'B',position:{lat:2,lng:2}}]
  const visits=[{id:'a',start:100,end:200,placeId:'A'},{id:'b',start:350,end:400,placeId:'B'}]
  const result=buildMapPathProjection(places,visits,[],{},{});
  assert.equal(result.length,1)
  assert.equal(result[0].primitive.color,DAY_PALETTE[0])
  assert.equal(result[0].primitive.direction,'FORWARD')
  assert.equal(result[0].target.kind,'CONNECTION')
 })
 ok('direct Connection color survives provider appearance config defaults',()=>{
  const places=[{id:'A',position:{lat:1,lng:1}},{id:'B',position:{lat:2,lng:2}}]
  const visits=[{id:'a',start:100,end:200,placeId:'A'},{id:'b',start:350,end:400,placeId:'B'}]
  const plan={id:'VISIT:a__VISIT:b',source:'MANUAL',visualColor:'#aa22bb',segments:[]}
  const result=buildMapPathProjection(places,visits,[],{[plan.id]:plan},{'2026-10-20':'#ee2211'})
  assert.equal(result[0].primitive.color,'#aa22bb')
 })
 ok('MajorTransport color follows departure day and overrides',()=>{
  const places=[{id:'A',position:{lat:1,lng:1}},{id:'B',position:{lat:2,lng:2}}]
  const t={id:'T',occupiedFrom:1600,occupiedUntil:1700,departure:{placeId:'A'},arrival:{placeId:'B'},onboard:{title:'Transport'}}
  let result=buildMapPathProjection(places,[],[t])
  assert.equal(result[0].primitive.color,DAY_PALETTE[1])
  result=buildMapPathProjection(places,[],[{...t,visualColor:'#223344'}])
  assert.equal(result[0].primitive.color,'#223344')
 })
 ok('screen-space arrow glyph direction points to destination',()=>{
  const points=[{x:0,y:0,lat:1,lng:1},{x:200,y:0,lat:1,lng:3}]
  const arrows=sampleScreenSpaceArrows(points,40)
  assert.equal(arrows.length,5)
  assert.equal(arrows[0].degrees,0)
  assert.ok(arrows.every(a=>a.x>=0 && a.x<=200))
 })
 ok('screen-space arrow turns with waypoint and handles zero segments',()=>{
  const points=[{x:0,y:0,lat:0,lng:0},{x:100,y:0,lat:0,lng:1},{x:100,y:100,lat:1,lng:1}]
  const arrows=sampleScreenSpaceArrows(points,50)
  assert.ok(arrows.some(a=>a.degrees===0))
  assert.ok(arrows.some(a=>a.degrees===90))
  assert.deepEqual(sampleScreenSpaceArrows([{x:0,y:0,lat:0,lng:0}],50),[])
 })
 ok('large route arrows are bounded',()=>{
  const arrows=sampleScreenSpaceArrows([{x:0,y:0,lat:0,lng:0},{x:10000,y:0,lat:1,lng:1}],30,100)
  assert.equal(arrows.length,100)
 })
 ok('Google and NAVER paths render directional repetition without route API',()=>{
  const google=readFileSync('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  const naver=readFileSync('src/map/provider/naver/NaverMapRenderer.ts','utf8')
  assert.match(google,/repeat: `\$\{arrow\.repeatPx\}px`/)
  assert.match(naver,/sampleScreenSpaceArrows/)
  assert.match(naver,/clickable:false/)
 })
 ok('color UI and History without route geometry persistence',()=>{
  const app=readFileSync('src/App.tsx','utf8')
  assert.match(app,/kind:'DAY_COLOR'/)
  assert.match(app,/setDayColors/)
  for(const file of ['src/model.ts','src/persistence/contract.ts'])
   assert.ok(!readFileSync(file,'utf8').includes('transitSteps'))
 })
 console.log(`\n${passed} devpack11 visual tests passed.`)
}finally{rmSync(out,{recursive:true,force:true})}
