export const LEGAL_PROVIDER_CACHE_CATALOG_VERSION='2026-10-20'

export const LEGAL_PROVIDER_CACHE_CATALOG=Object.freeze({
  'GOOGLE.PLACES.PLACE_ID':Object.freeze({provider:'GOOGLE',maxTtlHours:-1,refreshAfterHours:8760,crossTripReuse:'ALLOWED',status:'VERIFIED',verifiedAt:'2026-10-20',notes:'Place IDs are exempt from Places caching restrictions; refresh is recommended after 12 months.'}),
  'GOOGLE.PLACES.POSITION':Object.freeze({provider:'GOOGLE',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'VERIFIED',verifiedAt:'2026-10-20',notes:'Places latitude/longitude may be cached for up to 30 consecutive calendar days.'}),
  'GOOGLE.PLACES.NAME':Object.freeze({provider:'GOOGLE',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'CONSERVATIVE',verifiedAt:'2026-10-20'}),
  'GOOGLE.PLACES.ADDRESS':Object.freeze({provider:'GOOGLE',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'CONSERVATIVE',verifiedAt:'2026-10-20'}),
  'GOOGLE.PLACES.DETAILS':Object.freeze({provider:'GOOGLE',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'CONSERVATIVE',verifiedAt:'2026-10-20'}),
  'GOOGLE.PLACES.PHOTO':Object.freeze({provider:'GOOGLE',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'CONSERVATIVE',verifiedAt:'2026-10-20'}),
  'GOOGLE.PLACES.REVIEW':Object.freeze({provider:'GOOGLE',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'CONSERVATIVE',verifiedAt:'2026-10-20'}),
  'NAVER.LOCAL_SEARCH.RESULT':Object.freeze({provider:'NAVER',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'UNVERIFIED'}),
  'NAVER.GEOCODING.RESULT':Object.freeze({provider:'NAVER',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'UNVERIFIED'}),
  'NAVER.DIRECTIONS5.RESULT':Object.freeze({provider:'NAVER',maxTtlHours:-1,crossTripReuse:'ALLOWED',status:'UNVERIFIED'}),
})

const finiteNonNegative=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0
const validTtl=value=>typeof value==='number'&&Number.isFinite(value)&&(value===-1||value>=0)
const defaultRetentionHours=legal=>0

export function defaultProviderCacheOperatorConfig(){
  const policies={}
  for(const [key,legal] of Object.entries(LEGAL_PROVIDER_CACHE_CATALOG)){
    if(key==='GOOGLE.PLACES.PLACE_ID')policies[key]={ttlHours:-1,safetyMarginHours:0,retentionHours:-1}
    else if(key==='GOOGLE.PLACES.POSITION')policies[key]={ttlHours:360,retentionHours:720}
    else policies[key]={ttlHours:0,retentionHours:defaultRetentionHours(legal)}
  }
  return {schemaVersion:1,cleanupPollHours:1,defaultSafetyMarginHours:2,allowCrossTripCacheReuse:false,policies}
}

function validateTtl(key,ttlHours,legal){
  if(legal.maxTtlHours===0&&ttlHours!==0)throw new Error(`${key}: storage is disabled by the application legal ceiling`)
  if(legal.maxTtlHours>0){
    if(ttlHours===-1)throw new Error(`${key}: a finite legal TTL cannot be made permanent`)
    if(ttlHours>legal.maxTtlHours)throw new Error(`${key}: ttlHours ${ttlHours} exceeds maximum ${legal.maxTtlHours}`)
  }
}
function validateRetention(key,ttlHours,retentionHours,legal){
  if(!validTtl(retentionHours))throw new Error(`${key}: invalid retentionHours`)
  if(legal.maxTtlHours===0&&retentionHours!==0)throw new Error(`${key}: retention is disabled by the application legal ceiling`)
  if(legal.maxTtlHours===-1){
    if(ttlHours===-1&&retentionHours!==-1)throw new Error(`${key}: permanent active TTL requires permanent retention`)
    if(retentionHours!==-1&&ttlHours>0&&retentionHours<ttlHours)throw new Error(`${key}: retentionHours must be >= ttlHours`)
    return
  }
  if(retentionHours===-1)throw new Error(`${key}: finite legal ceiling cannot use permanent retention`)
  if(retentionHours>legal.maxTtlHours)throw new Error(`${key}: retentionHours ${retentionHours} exceeds maximum ${legal.maxTtlHours}`)
  if(ttlHours>0&&retentionHours<ttlHours)throw new Error(`${key}: retentionHours must be >= ttlHours`)
}

export function resolveProviderCachePolicyConfig(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('operator cache config must be an object')
  if(input.schemaVersion!==1)throw new Error('unsupported operator cache config schemaVersion')
  if(!finiteNonNegative(input.cleanupPollHours)||input.cleanupPollHours<=0)throw new Error('cleanupPollHours must be > 0')
  if(!finiteNonNegative(input.defaultSafetyMarginHours))throw new Error('defaultSafetyMarginHours must be >= 0')
  if(typeof input.allowCrossTripCacheReuse!=='boolean')throw new Error('allowCrossTripCacheReuse must be boolean')
  if(!input.policies||typeof input.policies!=='object'||Array.isArray(input.policies))throw new Error('policies must be an object')
  for(const key of Object.keys(input.policies))if(!LEGAL_PROVIDER_CACHE_CATALOG[key])throw new Error(`unknown provider cache policy key: ${key}`)
  const policies={}
  for(const [key,legal] of Object.entries(LEGAL_PROVIDER_CACHE_CATALOG)){
    const raw=input.policies[key]??{ttlHours:0}
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!validTtl(raw.ttlHours))throw new Error(`invalid ttlHours for ${key}`)
    if(raw.safetyMarginHours!==undefined&&!finiteNonNegative(raw.safetyMarginHours))throw new Error(`invalid safetyMarginHours for ${key}`)
    const ttlHours=raw.ttlHours
    const safetyMarginHours=ttlHours===-1?0:(raw.safetyMarginHours??input.defaultSafetyMarginHours)
    const retentionHours=raw.retentionHours??defaultRetentionHours(legal)
    validateTtl(key,ttlHours,legal)
    validateRetention(key,ttlHours,retentionHours,legal)
    if(ttlHours===-1&&safetyMarginHours!==0)throw new Error(`${key}: permanent ttlHours=-1 requires safetyMarginHours=0`)
    if(ttlHours>0&&ttlHours<=safetyMarginHours)throw new Error(`${key}: positive ttlHours must be greater than safetyMarginHours`)
    policies[key]={...legal,ttlHours,safetyMarginHours,retentionHours}
  }
  return {schemaVersion:1,legalCatalogVersion:LEGAL_PROVIDER_CACHE_CATALOG_VERSION,cleanupPollHours:input.cleanupPollHours,defaultSafetyMarginHours:input.defaultSafetyMarginHours,allowCrossTripCacheReuse:input.allowCrossTripCacheReuse,policies}
}

export function operatorConfigFromEffective(effective){
  const policies={}
  for(const [key,entry] of Object.entries(effective.policies))policies[key]={ttlHours:entry.ttlHours,retentionHours:entry.retentionHours,...(entry.safetyMarginHours!==effective.defaultSafetyMarginHours||entry.ttlHours===-1?{safetyMarginHours:entry.safetyMarginHours}:{})}
  return {schemaVersion:1,cleanupPollHours:effective.cleanupPollHours,defaultSafetyMarginHours:effective.defaultSafetyMarginHours,allowCrossTripCacheReuse:effective.allowCrossTripCacheReuse,policies}
}

export function evaluateProviderCacheRecord(record,config,now=Date.now()){
  const policy=config.policies[record.policyKey]
  if(!policy||policy.provider!==record.provider)return {cacheable:false,fresh:false,retained:false,dormant:false,permanent:false,reason:'INVALID'}
  const ageHours=Math.max(0,(now-record.fetchedAtEpochMs)/3600000)
  const permanentRetention=policy.retentionHours===-1
  const retained=permanentRetention||ageHours<policy.retentionHours
  const purgeAtEpochMs=permanentRetention?null:record.fetchedAtEpochMs+policy.retentionHours*3600000
  if(!retained)return {cacheable:policy.ttlHours!==0,fresh:false,retained:false,dormant:false,permanent:false,retentionHours:policy.retentionHours,purgeAtEpochMs,reason:'RETENTION_EXPIRED'}
  if(policy.ttlHours===0)return {cacheable:false,fresh:false,retained:true,dormant:true,permanent:false,retentionHours:policy.retentionHours,purgeAtEpochMs,reason:'DISABLED_DORMANT'}
  if(policy.ttlHours===-1)return {cacheable:true,fresh:true,retained:true,dormant:false,permanent:true,retentionHours:policy.retentionHours,purgeAtEpochMs,refreshRecommended:policy.refreshAfterHours!==undefined&&ageHours>=policy.refreshAfterHours,reason:'PERMANENT'}
  const effectiveTtlHours=policy.ttlHours-policy.safetyMarginHours
  if(!(effectiveTtlHours>0))return {cacheable:false,fresh:false,retained:true,dormant:true,permanent:false,retentionHours:policy.retentionHours,purgeAtEpochMs,reason:'INVALID'}
  const expiresAtEpochMs=record.fetchedAtEpochMs+effectiveTtlHours*3600000
  const fresh=now<expiresAtEpochMs
  return {cacheable:true,fresh,retained:true,dormant:!fresh,permanent:false,effectiveTtlHours,expiresAtEpochMs,retentionHours:policy.retentionHours,purgeAtEpochMs,refreshRecommended:!fresh,reason:fresh?'FRESH':'DORMANT'}
}

export function cacheLookupScope(policyKey,config){
  const policy=config.policies[policyKey]
  return config.allowCrossTripCacheReuse&&policy?.crossTripReuse==='ALLOWED'&&policy.ttlHours!==0?'GLOBAL':'TRIP'
}

export function publicCachePolicyStatus(config){
  return {
    legalCatalogVersion:config.legalCatalogVersion,
    cleanupPollHours:config.cleanupPollHours,
    defaultSafetyMarginHours:config.defaultSafetyMarginHours,
    allowCrossTripCacheReuse:config.allowCrossTripCacheReuse,
    policies:Object.entries(config.policies).map(([key,p])=>({key,provider:p.provider,ttlHours:p.ttlHours,maxTtlHours:p.maxTtlHours,retentionHours:p.retentionHours,safetyMarginHours:p.safetyMarginHours,effectiveTtlHours:p.ttlHours>0?Math.max(0,p.ttlHours-p.safetyMarginHours):p.ttlHours,status:p.status,crossTripReuse:p.crossTripReuse,refreshAfterHours:p.refreshAfterHours??null,verifiedAt:p.verifiedAt??null,notes:p.notes??null}))
  }
}
