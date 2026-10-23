import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}

await ok('stable package version is 1.0.0',async()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'))
  assert.equal(pkg.version,'1.0.0')
})

await ok('connection arrow metrics scale from saved base width rather than hover state',async()=>{
  const source=await readFile('src/map/pathThickness.ts','utf8')
  assert.match(source,/mapPathArrowMetrics/)
  assert.match(source,/Math\.sqrt\(base\/DEFAULT_CONNECTION_WIDTH_PX\)/)
  assert.match(source,/mapPathBaseWidth\(path\)/)
})

await ok('Google direction arrows use dynamic scale, outline and spacing',async()=>{
  const source=await readFile('src/map/provider/google/GoogleMapRenderer.ts','utf8')
  assert.match(source,/mapPathArrowMetrics\(primitive\)/)
  assert.match(source,/scale: arrow\.googleScale/)
  assert.match(source,/strokeWeight: arrow\.googleOutlineWeight/)
  assert.match(source,/repeat: `\$\{arrow\.repeatPx\}px`/)
  assert.doesNotMatch(source,/scale:\s*1\.45\s*}/)
})

await ok('NAVER direction arrows use dynamic font size and anchor',async()=>{
  const source=await readFile('src/map/provider/naver/NaverMapRenderer.ts','utf8')
  assert.match(source,/mapPathArrowMetrics\(primitive\)/)
  assert.match(source,/\$\{arrowMetrics\.naverFontPx\}px/)
  assert.match(source,/arrowMetrics\.naverAnchorPx/)
  assert.doesNotMatch(source,/font:900 9px Arial/)
})

console.log(`\n${passed} stable-release tests passed.`)
