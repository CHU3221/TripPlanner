import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

let passed=0
const ok=async(name,fn)=>{await fn();passed++;console.log('PASS',name)}

await ok('placement hover does not insert a layout-shifting preview card',async()=>{
  const source=await readFile('src/components/Sidebar.tsx','utf8')
  assert.doesNotMatch(source,/function BucketDropSlot/)
  assert.doesNotMatch(source,/bucket-insertion-placeholder/)
  assert.match(source,/bucket-drop-reaction/)
  assert.match(source,/bucket-drop-glow/)
})

await ok('placement target reaction is glass-style and layout-stable',async()=>{
  const css=await readFile('src/styles/panels.css','utf8')
  assert.match(css,/\.bucket-drop-zone\{position:relative;isolation:isolate/)
  assert.match(css,/\.bucket-drop-reaction\{position:absolute/)
  assert.match(css,/backdrop-filter:blur\(16px\)/)
  assert.match(css,/drop-target-hover[\s\S]*transform:translateY\(-1px\) scale\(1\.006\)/)
})

await ok('successful placement drop clears global and source-card drag visuals immediately',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const sidebar=await readFile('src/components/Sidebar.tsx','utf8')
  assert.match(app,/function movePayloadToPlacement\([^)]*\)\{\s*setExternalDrag\(null\)/)
  assert.match(app,/activeExternalDragSourceId=\{externalDrag\?\.payload\.sourceId\?\?null\}/)
  assert.match(sidebar,/useEffect\(\(\)=>\{if\(dragActive===false\)setDragging\(false\)\},\[dragActive\]\)/)
})

console.log(`\n${passed} devpack21.1 drag-ux tests passed.`)
