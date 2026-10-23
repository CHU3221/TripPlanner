import { randomUUID } from 'node:crypto'
import { cacheLookupScope, defaultProviderCacheOperatorConfig, evaluateProviderCacheRecord, resolveProviderCachePolicyConfig } from './providerCachePolicy.mjs'

const storageSubject=(tripId,subjectKey,scope)=>scope==='GLOBAL'?subjectKey:`trip:${tripId}:${subjectKey}`

export class ProviderCacheService{
  constructor({repository,configStore,now=Date.now}){this.repository=repository;this.configStore=configStore;this.now=now;this.timer=null}
  config(){try{return this.configStore.providerCachePolicy()}catch{return resolveProviderCachePolicyConfig(defaultProviderCacheOperatorConfig())}}
  async get(tripId,{provider,policyKey,subjectKey}){
    const config=this.config(),policy=config.policies[policyKey]
    if(!policy||policy.provider!==provider||policy.ttlHours===0)return {enabled:false,hit:false,policy:policy??null}
    const scope=cacheLookupScope(policyKey,config),key={provider,policyKey,subjectKey:storageSubject(tripId,subjectKey,scope)}
    const record=scope==='GLOBAL'?await this.repository.findGlobal(key):await this.repository.findForTrip(tripId,key)
    if(!record)return {enabled:true,hit:false,policy}
    const evaluation=evaluateProviderCacheRecord(record,config,this.now())
    if(!evaluation.cacheable||!evaluation.fresh)return {enabled:true,hit:false,policy,evaluation}
    if(scope==='GLOBAL')await this.repository.linkTripToCache(tripId,record.cacheId)
    return {enabled:true,hit:true,policy,value:record.value,fetchedAtEpochMs:record.fetchedAtEpochMs,evaluation}
  }
  async put(tripId,{provider,policyKey,subjectKey,value}){
    const config=this.config(),policy=config.policies[policyKey]
    if(!policy||policy.provider!==provider||policy.ttlHours===0)return {stored:false,reason:'DISABLED'}
    validateValue(policyKey,value)
    const scope=cacheLookupScope(policyKey,config),now=this.now()
    const record={cacheId:randomUUID(),provider,policyKey,subjectKey:storageSubject(tripId,subjectKey,scope),fetchedAtEpochMs:now,value}
    const evaluation=evaluateProviderCacheRecord(record,config,now)
    if(!evaluation.cacheable||!evaluation.fresh)return {stored:false,reason:evaluation.reason}
    record.cacheScope=scope
    await this.repository.saveForTrip(tripId,record)
    return {stored:true,fetchedAtEpochMs:now,evaluation}
  }
  async purge(){
    const config=this.config(),records=await this.repository.listAll(),now=this.now(),ids=[]
    for(const record of records){const evaluation=evaluateProviderCacheRecord(record,config,now);if(!evaluation.retained)ids.push(record.cacheId)}
    if(ids.length)await this.repository.deleteByCacheIds(ids)
    return ids
  }
  async stats(){const records=await this.repository.listAll();return {records:records.length}}
  start(){this.stop();void this.purge();const hours=this.config().cleanupPollHours;this.timer=setInterval(()=>void this.purge(),hours*3600000);this.timer.unref?.()}
  restart(){this.start()}
  stop(){if(this.timer){clearInterval(this.timer);this.timer=null}}
}

function validateValue(policyKey,value){
  if(policyKey==='GOOGLE.PLACES.POSITION'){
    if(!value||typeof value!=='object'||!Number.isFinite(value.lat)||!Number.isFinite(value.lng)||Math.abs(value.lat)>90||Math.abs(value.lng)>180)throw Object.assign(new Error('캐시 좌표가 올바르지 않습니다.'),{statusCode:400})
    return
  }
  if(policyKey==='GOOGLE.PLACES.PLACE_ID'){
    if(typeof value!=='string'||!value.trim()||value.length>512)throw Object.assign(new Error('Place ID 캐시 값이 올바르지 않습니다.'),{statusCode:400})
    return
  }
  throw Object.assign(new Error('이 캐시 정책은 런타임 쓰기를 지원하지 않습니다.'),{statusCode:400})
}
