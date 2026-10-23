import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SqliteRepositories } from '../server/repositories.mjs'
import { ServerConfigStore } from '../server/configStore.mjs'
import { AuthService } from '../server/auth.mjs'

let passed=0
async function ok(name,fn){await fn();passed++;console.log('PASS',name)}

await ok('auth accepts trimmed Unicode IDs and one-character passwords while rejecting empty values',async()=>{
  const temp=mkdtempSync(path.join(tmpdir(),'tripplanner-devpack24-auth-'))
  let repos
  try{
    const root=path.join(temp,'root');mkdirSync(path.join(root,'config'),{recursive:true})
    const store=new ServerConfigStore(root,{})
    repos=new SqliteRepositories(path.join(temp,'auth.sqlite'))
    const auth=new AuthService({users:repos.users,sessions:repos.sessions,configStore:store})
    const signup=await auth.signup('  김 민수  ','1')
    assert.equal(signup.username,'김 민수')
    await repos.users.setStatus(signup.id,'ACTIVE')
    const login=await auth.login('김 민수','1')
    assert.equal(login.status.authenticated,true)
    assert.equal(login.status.username,'김 민수')
    await assert.rejects(()=>auth.signup('   ','x'),e=>e?.code==='INVALID_USERNAME')
    await assert.rejects(()=>auth.signup('다른사용자',''),e=>e?.code==='PASSWORD_REQUIRED')
  }finally{try{repos?.close()}catch{};rmSync(temp,{recursive:true,force:true})}
})

await ok('auth UI no longer imposes username/password min/max length rules',async()=>{
  const auth=await readFile('src/components/AuthPages.tsx','utf8')
  const serverAuth=await readFile('server/auth.mjs','utf8')
  const passwords=await readFile('server/passwords.mjs','utf8')
  assert.doesNotMatch(auth,/minLength=\{?8\}?|maxLength=\{?40\}?/)
  assert.doesNotMatch(serverAuth,/\[A-Za-z0-9_\.\-\]|\{3,40\}/)
  assert.doesNotMatch(passwords,/length\s*<\s*8|8자/)
  assert.match(passwords,/normalized\.length===0/)
})

await ok('product UI copy has a locale payload file with compatibility registry exports',async()=>{
  const registry=await readFile('src/i18n/catalog.ts','utf8')
  const locale=await readFile('src/i18n/locales/ko-KR.ts','utf8')
  assert.match(registry,/from '\.\/locales\/ko-KR'/)
  assert.match(registry,/export const koKR=/)
  assert.match(registry,/export const text=/)
  assert.match(locale,/export const koKR=/)
  assert.match(locale,/tripSettings:/)
  assert.match(locale,/management:/)
  assert.match(locale,/editorEyebrow:/)
})

await ok('key editor/auth components use catalog-backed copy instead of embedded product wording',async()=>{
  for(const file of ['src/components/AuthPages.tsx','src/components/BucketItemModal.tsx','src/components/BaseModal.tsx','src/components/MajorTransportModal.tsx']){
    const source=await readFile(file,'utf8')
    // Material Symbol names and developer comments are allowed; Korean product copy belongs in the locale catalog.
    const withoutComments=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'')
    assert.doesNotMatch(withoutComments,/[가-힣]/,`${file} still contains Korean UI copy`)
  }
})

await ok('PLAN B has a stable cool-gray semantic default and persists only non-default appearance settings',async()=>{
  const appearance=await readFile('src/visual/appearance.ts','utf8')
  const codec=await readFile('src/persistence/snapshotCodec.ts','utf8')
  const validator=await readFile('server/snapshotValidation.mjs','utf8')
  assert.match(appearance,/DEFAULT_PLAN_B_COLOR = '#7D8793'/)
  assert.match(codec,/appearanceSettings\.planBColor!==DEFAULT_TRIP_APPEARANCE\.planBColor/)
  assert.match(validator,/appearanceSettings\.planBColor must be a hex color/)
})

await ok('PLAN B color is configurable in Trip settings and used as a semantic accent before timeline placement',async()=>{
  const app=await readFile('src/App.tsx','utf8')
  const sidebar=await readFile('src/components/Sidebar.tsx','utf8')
  const map=await readFile('src/components/TripMap.tsx','utf8')
  const css=await readFile('src/styles/visualIdentity.css','utf8')
  assert.match(app,/type="color"[^>]+appearance\.planBColor/)
  assert.match(sidebar,/--plan-b-color/)
  assert.match(map,/planBOnly\?appearanceSettings\.planBColor/)
  assert.match(css,/\.bucket-place\.is-plan-b/)
})

await ok('bucket/sidebar visuals are no longer split between competing legacy hardcoded surfaces',async()=>{
  const panels=await readFile('src/styles/panels.css','utf8')
  const identity=await readFile('src/styles/visualIdentity.css','utf8')
  assert.doesNotMatch(panels,/\.bucket\s*\{[^}]*background:\s*#f7f7f7/s)
  assert.match(identity,/--surface/)
  assert.match(identity,/--radius-md/)
  assert.doesNotMatch(panels,/bucket-visit-drop-placeholder/)
  assert.doesNotMatch(identity,/bucket-trash-zone/)
  const poc=await readFile('src/styles/poc.css','utf8')
  assert.doesNotMatch(poc,/bucket-insertion-placeholder/)
})

await ok('release-cleanup baseline remains valid in the 1.0.0 release',async()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'))
  assert.equal(pkg.version,'1.0.0')
  assert.match(pkg.scripts.test,/test:devpack24/)
})

console.log(`\n${passed} devpack24 release-cleanup tests passed.`)
