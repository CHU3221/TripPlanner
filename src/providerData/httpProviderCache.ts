import type { RouteCandidate, RouteRequest } from '../map/provider/contract'
import { routeRequestKey } from '../connectionRuntime'
import type { GeoPoint, TripPlace } from '../domain/place'

export type ProviderCacheRead<T>={enabled:boolean;hit:boolean;value?:T;ttlHours:number;maxTtlHours:number;fetchedAtEpochMs?:number}

async function json<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,{credentials:'same-origin',...init,headers:{Accept:'application/json',...(init?.body?{'content-type':'application/json'}:{}),...(init?.headers??{})}})
  const body=await response.json().catch(()=>({})) as T&{message?:string}
  if(!response.ok)throw new Error(body.message??`Provider cache 요청 실패 (${response.status})`)
  return body
}

export function readGooglePlacePositionCache(tripId:string,placeId:string){
  const q=new URLSearchParams({policyKey:'GOOGLE.PLACES.POSITION',subjectKey:`place:${placeId}`})
  return json<ProviderCacheRead<GeoPoint>>(`/api/trips/${encodeURIComponent(tripId)}/provider-cache?${q}`)
}

export function writeGooglePlacePositionCache(tripId:string,placeId:string,position:GeoPoint){
  return json<{stored:boolean;reason?:string}>(`/api/trips/${encodeURIComponent(tripId)}/provider-cache`,{method:'PUT',body:JSON.stringify({policyKey:'GOOGLE.PLACES.POSITION',subjectKey:`place:${placeId}`,value:position})})
}

export async function primeGooglePlacePositionCache(tripId:string,places:readonly TripPlace[],enabled:boolean):Promise<number>{
  if(!enabled)return 0
  const candidates=places.filter(place=>place.providerRef?.provider==='GOOGLE'&&place.providerRef.id&&place.position&&Number.isFinite(place.position.lat)&&Number.isFinite(place.position.lng))
  let stored=0
  for(const place of candidates){
    try{const result=await writeGooglePlacePositionCache(tripId,place.providerRef!.id,place.position!);if(result.stored)stored++}catch{}
  }
  return stored
}

/** Route cache entries contain provider-neutral candidates, never the native Google SDK objects. */
export function routeCachePolicyKey(provider:'GOOGLE'|'NAVER'){
  return provider==='GOOGLE'?'GOOGLE.ROUTES.RESULT':'NAVER.DIRECTIONS5.RESULT'
}
export function routeCacheSubjectKey(request:RouteRequest){return `route:v1:${routeRequestKey(request)}`}

export function readRouteCandidatesCache(tripId:string,provider:'GOOGLE'|'NAVER',request:RouteRequest){
  const q=new URLSearchParams({policyKey:routeCachePolicyKey(provider),subjectKey:routeCacheSubjectKey(request)})
  return json<ProviderCacheRead<RouteCandidate[]>>(`/api/trips/${encodeURIComponent(tripId)}/provider-cache?${q}`)
}
export function writeRouteCandidatesCache(tripId:string,provider:'GOOGLE'|'NAVER',request:RouteRequest,routes:readonly RouteCandidate[]){
  return json<{stored:boolean;reason?:string}>(`/api/trips/${encodeURIComponent(tripId)}/provider-cache`,{method:'PUT',body:JSON.stringify({policyKey:routeCachePolicyKey(provider),subjectKey:routeCacheSubjectKey(request),value:routes})})
}
