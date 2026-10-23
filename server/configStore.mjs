import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defaultProviderCacheOperatorConfig, operatorConfigFromEffective, publicCachePolicyStatus, resolveProviderCachePolicyConfig } from './providerCachePolicy.mjs'

function unquote(value){
  const v=value.trim()
  if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))return v.slice(1,-1)
  return v
}
export function parseEnvText(text){
  const out={}
  for(const line of String(text??'').split(/\r?\n/)){
    const m=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if(m)out[m[1]]=unquote(m[2])
  }
  return out
}
function quoteEnv(value){return JSON.stringify(String(value))}
export class ServerConfigStore{
  constructor(rootDir,processEnv=process.env){this.rootDir=rootDir;this.file=path.join(rootDir,'.env.local');this.processEnv=processEnv;this.reload()}
  reload(){
    const fileEnv=existsSync(this.file)?parseEnvText(readFileSync(this.file,'utf8')):{}
    this.values={...fileEnv,...Object.fromEntries(Object.entries(this.processEnv).filter(([,v])=>v!==undefined))}
    const id=this.values.ADMIN_ID?.trim()??'',hash=this.values.ADMIN_PASSWORD_HASH?.trim()??''
    this.adminConfigInvalid=(!id)!==(!hash)
    this.admin={bootstrap:!id&&!hash,id:id||'admin',passwordHash:hash||null}
    this.runtime={
      googleApiKey:(this.values.GOOGLE_MAPS_API_KEY||this.values.VITE_GOOGLE_MAPS_API_KEY||'').trim(),
      googleMapId:(this.values.GOOGLE_MAP_ID||this.values.VITE_GOOGLE_MAP_ID||'').trim(),
      naverClientId:(this.values.NAVER_MAP_CLIENT_ID||this.values.VITE_NAVER_MAP_CLIENT_ID||'').trim(),
    }
    return this
  }
  setAdminCredentials(id,passwordHash){
    const current=existsSync(this.file)?readFileSync(this.file,'utf8'):''
    const lines=current.split(/\r?\n/).filter((line,index,all)=>!(index===all.length-1&&line===''))
    const replacements={ADMIN_ID:id,ADMIN_PASSWORD_HASH:passwordHash}
    const seen=new Set()
    const next=lines.map(line=>{
      const m=line.match(/^\s*(?:export\s+)?(ADMIN_ID|ADMIN_PASSWORD_HASH)\s*=/)
      if(!m)return line
      seen.add(m[1]);return `${m[1]}=${quoteEnv(replacements[m[1]])}`
    })
    for(const key of ['ADMIN_ID','ADMIN_PASSWORD_HASH'])if(!seen.has(key))next.push(`${key}=${quoteEnv(replacements[key])}`)
    writeFileSync(this.file,`${next.join('\n')}\n`,{mode:0o600})
    this.reload()
  }
  runtimeConfig(){return {...this.runtime}}
  cacheOverridePath(){return (this.values.PROVIDER_CACHE_POLICY_OVERRIDE||path.join(this.rootDir,'config/provider-cache-policy.override.json')).trim()}
  providerCachePolicy(){
    const overridePath=this.cacheOverridePath()
    const operator=existsSync(overridePath)?JSON.parse(readFileSync(overridePath,'utf8')):defaultProviderCacheOperatorConfig()
    return resolveProviderCachePolicyConfig(operator)
  }
  setProviderCachePolicy(operatorConfig){
    const effective=resolveProviderCachePolicyConfig(operatorConfig)
    const overridePath=this.cacheOverridePath()
    mkdirSync(path.dirname(overridePath),{recursive:true})
    writeFileSync(overridePath,`${JSON.stringify(operatorConfigFromEffective(effective),null,2)}\n`,{mode:0o600})
    return this.cachePolicyStatus()
  }
  cachePolicyStatus(){
    const overridePath=this.cacheOverridePath(),exists=existsSync(overridePath)
    try{
      const effective=this.providerCachePolicy()
      return {runtimeWiring:'ENABLED',overridePath,overrideExists:exists,operatorConfig:operatorConfigFromEffective(effective),error:null,note:'Provider cache runtime이 서버 SQLite와 연결되어 있습니다. 각 정책은 표시된 최대 TTL을 초과할 수 없습니다.',...publicCachePolicyStatus(effective)}
    }catch(e){
      const fallback=resolveProviderCachePolicyConfig(defaultProviderCacheOperatorConfig())
      return {runtimeWiring:'ERROR',overridePath,overrideExists:exists,operatorConfig:operatorConfigFromEffective(fallback),error:e instanceof Error?e.message:String(e),note:'캐시 설정 오류로 runtime cache가 fail-closed 상태입니다. Management에는 복구용 기본값을 표시합니다.',...publicCachePolicyStatus(fallback)}
    }
  }
}
