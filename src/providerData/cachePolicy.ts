import type { PlaceProviderId } from '../domain/place'
import {
  LEGAL_PROVIDER_CACHE_CATALOG,
  LEGAL_PROVIDER_CACHE_CATALOG_VERSION,
  type ProviderCacheLegalPolicyEntry,
} from './legalPolicyCatalog'

export type CacheTtlHours = number
export type ProviderCacheOperatorPolicy = {
  ttlHours: CacheTtlHours
  safetyMarginHours?: number
  /** Physical retention horizon. Expired active data may remain dormant until this age. */
  retentionHours?: CacheTtlHours
}
export type ProviderCacheOperatorConfig = {
  schemaVersion: 1
  cleanupPollHours: number
  defaultSafetyMarginHours: number
  allowCrossTripCacheReuse: boolean
  policies: Record<string, ProviderCacheOperatorPolicy>
}
export type EffectiveProviderCachePolicyEntry = ProviderCacheLegalPolicyEntry & {
  ttlHours: CacheTtlHours
  safetyMarginHours: number
  retentionHours: CacheTtlHours
}
export type ProviderCachePolicyConfig = {
  schemaVersion: 1
  legalCatalogVersion: string
  cleanupPollHours: number
  defaultSafetyMarginHours: number
  allowCrossTripCacheReuse: boolean
  policies: Record<string, EffectiveProviderCachePolicyEntry>
}
export type ProviderCacheRecord<T> = {cacheId:string;provider:PlaceProviderId;policyKey:string;subjectKey:string;fetchedAtEpochMs:number;value:T}
export type ProviderCacheTripReference = {tripId:string;cacheId:string}
export type CacheEvaluation = {
  cacheable:boolean;fresh:boolean;retained:boolean;dormant:boolean;permanent:boolean;policyKnown:boolean
  effectiveTtlHours?:number;expiresAtEpochMs?:number;retentionHours?:number;purgeAtEpochMs?:number|null
  refreshRecommended:boolean
  reason:'FRESH'|'PERMANENT'|'DORMANT'|'RETENTION_EXPIRED'|'CACHE_FORBIDDEN'|'UNKNOWN_POLICY'|'INVALID_POLICY'|'PROVIDER_MISMATCH'
}
export type ProviderCacheLookupScope='TRIP'|'GLOBAL'
const HOUR_MS=3600000
const finiteNonNegative=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0
const validTtl=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&(value===-1||value>=0)
const defaultRetention=(legal:ProviderCacheLegalPolicyEntry)=>0

function validateTtl(key:string,ttl:number,legal:ProviderCacheLegalPolicyEntry){
  if(legal.maxTtlHours===0&&ttl!==0)throw new Error(`${key}: operator cannot enable storage; developer legal ceiling is 0`)
  if(legal.maxTtlHours>0){if(ttl===-1)throw new Error(`${key}: operator cannot make a finite legal TTL permanent`);if(ttl>legal.maxTtlHours)throw new Error(`${key}: ttlHours ${ttl} exceeds developer legal ceiling ${legal.maxTtlHours}`)}
}
function validateRetention(key:string,ttl:number,retention:number,legal:ProviderCacheLegalPolicyEntry){
  if(!validTtl(retention))throw new Error(`${key}: invalid retentionHours`)
  if(legal.maxTtlHours===0&&retention!==0)throw new Error(`${key}: retention is disabled by developer legal ceiling`)
  if(legal.maxTtlHours===-1){if(ttl===-1&&retention!==-1)throw new Error(`${key}: permanent active TTL requires permanent retention`);if(retention!==-1&&ttl>0&&retention<ttl)throw new Error(`${key}: retentionHours must be >= ttlHours`);return}
  if(retention===-1)throw new Error(`${key}: finite legal ceiling cannot use permanent retention`)
  if(retention>legal.maxTtlHours)throw new Error(`${key}: retentionHours ${retention} exceeds developer legal ceiling ${legal.maxTtlHours}`)
  if(ttl>0&&retention<ttl)throw new Error(`${key}: retentionHours must be >= ttlHours`)
}

export function parseProviderCacheOperatorConfig(input:unknown):ProviderCacheOperatorConfig{
  if(!input||typeof input!=='object')throw new Error('operator cache config must be an object')
  const root=input as Record<string,unknown>
  if(root.schemaVersion!==1)throw new Error('unsupported operator cache config schemaVersion')
  if(!finiteNonNegative(root.cleanupPollHours)||root.cleanupPollHours<=0)throw new Error('cleanupPollHours must be > 0')
  if(!finiteNonNegative(root.defaultSafetyMarginHours))throw new Error('defaultSafetyMarginHours must be >= 0')
  if(typeof root.allowCrossTripCacheReuse!=='boolean')throw new Error('allowCrossTripCacheReuse must be boolean')
  if(!root.policies||typeof root.policies!=='object'||Array.isArray(root.policies))throw new Error('policies must be an object')
  const policies:Record<string,ProviderCacheOperatorPolicy>={}
  for(const [key,raw] of Object.entries(root.policies as Record<string,unknown>)){
    const legal=LEGAL_PROVIDER_CACHE_CATALOG[key as keyof typeof LEGAL_PROVIDER_CACHE_CATALOG]
    if(!legal)throw new Error(`unknown provider cache policy key: ${key}`)
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`invalid operator cache policy: ${key}`)
    const entry=raw as Record<string,unknown>
    if(!validTtl(entry.ttlHours))throw new Error(`invalid ttlHours for ${key}`)
    if(entry.safetyMarginHours!==undefined&&!finiteNonNegative(entry.safetyMarginHours))throw new Error(`invalid safetyMarginHours for ${key}`)
    const ttl=entry.ttlHours,safety=(entry.safetyMarginHours as number|undefined)??root.defaultSafetyMarginHours as number,retention=entry.retentionHours===undefined?defaultRetention(legal):entry.retentionHours
    validateTtl(key,ttl,legal);validateRetention(key,ttl,retention as number,legal)
    if(ttl===-1&&safety!==0)throw new Error(`${key}: permanent ttlHours=-1 requires safetyMarginHours=0`)
    if(ttl>0&&ttl<=safety)throw new Error(`${key}: positive ttlHours must be greater than safetyMarginHours`)
    policies[key]={ttlHours:ttl,safetyMarginHours:entry.safetyMarginHours as number|undefined,retentionHours:retention as number}
  }
  return {schemaVersion:1,cleanupPollHours:root.cleanupPollHours as number,defaultSafetyMarginHours:root.defaultSafetyMarginHours as number,allowCrossTripCacheReuse:root.allowCrossTripCacheReuse as boolean,policies}
}

export function resolveProviderCachePolicyConfig(input:unknown):ProviderCachePolicyConfig{
  const operator=parseProviderCacheOperatorConfig(input),policies:Record<string,EffectiveProviderCachePolicyEntry>={}
  for(const [key,legal] of Object.entries(LEGAL_PROVIDER_CACHE_CATALOG)){
    const override=operator.policies[key],ttl=override?.ttlHours??0,safety=ttl===-1?0:(override?.safetyMarginHours??operator.defaultSafetyMarginHours),retention=override?.retentionHours??defaultRetention(legal)
    validateTtl(key,ttl,legal);validateRetention(key,ttl,retention,legal)
    if(ttl>0&&ttl<=safety)throw new Error(`${key}: positive ttlHours must be greater than safetyMarginHours`)
    policies[key]={...legal,ttlHours:ttl,safetyMarginHours:safety,retentionHours:retention}
  }
  return {schemaVersion:1,legalCatalogVersion:LEGAL_PROVIDER_CACHE_CATALOG_VERSION,cleanupPollHours:operator.cleanupPollHours,defaultSafetyMarginHours:operator.defaultSafetyMarginHours,allowCrossTripCacheReuse:operator.allowCrossTripCacheReuse,policies}
}

export function evaluateProviderCacheRecord<T>(record:ProviderCacheRecord<T>,config:ProviderCachePolicyConfig,serverNowEpochMs:number):CacheEvaluation{
  const policy=config.policies[record.policyKey]
  if(!policy)return {cacheable:false,fresh:false,retained:false,dormant:false,permanent:false,policyKnown:false,refreshRecommended:false,reason:'UNKNOWN_POLICY'}
  if(record.provider!==policy.provider)return {cacheable:false,fresh:false,retained:false,dormant:false,permanent:false,policyKnown:true,refreshRecommended:false,reason:'PROVIDER_MISMATCH'}
  const age=Math.max(0,(serverNowEpochMs-record.fetchedAtEpochMs)/HOUR_MS),permanentRetention=policy.retentionHours===-1,retained=permanentRetention||age<policy.retentionHours,purgeAtEpochMs=permanentRetention?null:record.fetchedAtEpochMs+policy.retentionHours*HOUR_MS
  if(!retained)return {cacheable:policy.ttlHours!==0,fresh:false,retained:false,dormant:false,permanent:false,policyKnown:true,retentionHours:policy.retentionHours,purgeAtEpochMs,refreshRecommended:false,reason:'RETENTION_EXPIRED'}
  if(policy.ttlHours===0)return {cacheable:false,fresh:false,retained:true,dormant:true,permanent:false,policyKnown:true,retentionHours:policy.retentionHours,purgeAtEpochMs,refreshRecommended:false,reason:'CACHE_FORBIDDEN'}
  if(policy.ttlHours===-1)return {cacheable:true,fresh:true,retained:true,dormant:false,permanent:true,policyKnown:true,retentionHours:policy.retentionHours,purgeAtEpochMs,refreshRecommended:policy.refreshAfterHours!==undefined&&age>=policy.refreshAfterHours,reason:'PERMANENT'}
  const effective=policy.ttlHours-policy.safetyMarginHours
  if(!(effective>0))return {cacheable:false,fresh:false,retained:true,dormant:true,permanent:false,policyKnown:true,effectiveTtlHours:0,retentionHours:policy.retentionHours,purgeAtEpochMs,refreshRecommended:false,reason:'INVALID_POLICY'}
  const expiresAtEpochMs=record.fetchedAtEpochMs+effective*HOUR_MS,fresh=serverNowEpochMs<expiresAtEpochMs
  return {cacheable:true,fresh,retained:true,dormant:!fresh,permanent:false,policyKnown:true,effectiveTtlHours:effective,expiresAtEpochMs,retentionHours:policy.retentionHours,purgeAtEpochMs,refreshRecommended:!fresh,reason:fresh?'FRESH':'DORMANT'}
}

export function canPersistProviderValue(policyKey:string,config:ProviderCachePolicyConfig){const p=config.policies[policyKey];return !!p&&p.ttlHours!==0&&(p.ttlHours===-1||p.ttlHours>p.safetyMarginHours)}
export function canReuseProviderCacheAcrossTrips(policyKey:string,config:ProviderCachePolicyConfig){const p=config.policies[policyKey];return Boolean(p&&config.allowCrossTripCacheReuse&&p.crossTripReuse==='ALLOWED'&&p.ttlHours!==0)}
export function providerCacheLookupScope(policyKey:string,config:ProviderCachePolicyConfig):ProviderCacheLookupScope{return canReuseProviderCacheAcrossTrips(policyKey,config)?'GLOBAL':'TRIP'}
export function cleanupPollIntervalMs(config:ProviderCachePolicyConfig){return config.cleanupPollHours*HOUR_MS}
export type NewProviderCacheRecord<T>=Omit<ProviderCacheRecord<T>,'fetchedAtEpochMs'>
export function createProviderCacheRecord<T>(input:NewProviderCacheRecord<T>,config:ProviderCachePolicyConfig,serverNowEpochMs:number):ProviderCacheRecord<T>|null{const p=config.policies[input.policyKey];if(!p||p.provider!==input.provider||!canPersistProviderValue(input.policyKey,config))return null;return {...input,fetchedAtEpochMs:serverNowEpochMs}}
