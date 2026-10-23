import type { TripPlace } from '../domain/place'
import type { MapProviderId } from '../map/provider/contract'
import { resolveTripPlaceRef } from '../map/provider/composition'
import { readGooglePlacePositionCache, writeGooglePlacePositionCache } from '../providerData/httpProviderCache'
import { mergeProviderPlaceRuntime } from './snapshotCodec'

export type ProviderHydrationMode='FULL'|'METADATA_ONLY'|'CACHE_ONLY'
export type HydrationResult={places:TripPlace[];failedPlaceIds:string[];requestCount:number;cacheHitCount:number;cacheWriteCount:number}

/**
 * Runtime provider hydration with an explicit network mode.
 * - FULL: legacy/manual behavior; provider may supply all missing fields.
 * - METADATA_ONLY: explicit compatibility mode; provider may refresh display metadata, but never position.
 * - CACHE_ONLY: Trip open/collaboration sync uses server cache only and never contacts provider.
 */
export async function hydrateProviderPlaces(
  providerId:MapProviderId,
  places:readonly TripPlace[],
  options:{googleApiKey?:string;tripId?:string;googlePlacesPositionCacheTtlHours?:number;mode?:ProviderHydrationMode},
):Promise<HydrationResult>{
  const mode=options.mode??'FULL'
  const next=places.map(place=>({...place}))
  const failed:string[]=[]
  let requestCount=0,cacheHitCount=0,cacheWriteCount=0
  const positionCacheEnabled=providerId==='GOOGLE'&&!!options.tripId&&(options.googlePlacesPositionCacheTtlHours??0)!==0
  for(let i=0;i<next.length;i++){
    let place=next[i]
    const providerRef=place.providerRef
    if(!providerRef||providerRef.provider!==providerId)continue
    let needsName=place.provenance?.name?.source!=='USER'
    let needsAddress=place.provenance?.address?.source!=='USER'
    let needsPosition=place.provenance?.position?.source!=='USER'
    if(!needsName&&!needsAddress&&!needsPosition)continue

    if(positionCacheEnabled&&needsPosition&&providerRef.provider==='GOOGLE'){
      try{
        const cached=await readGooglePlacePositionCache(options.tripId!,providerRef.id)
        const point=cached.hit?cached.value:undefined
        if(point&&Number.isFinite(point.lat)&&Number.isFinite(point.lng)){
          place={...place,position:{lat:point.lat,lng:point.lng},provenance:{...place.provenance,position:{source:'PROVIDER',provider:'GOOGLE'}}}
          next[i]=place;needsPosition=false;cacheHitCount++
        }
      }catch{}
    }

    if(mode==='CACHE_ONLY')continue
    const requestPosition=mode==='FULL'&&needsPosition
    if(!needsName&&!needsAddress&&!requestPosition)continue
    requestCount++
    try{
      const resolved=await resolveTripPlaceRef(providerId,providerRef,{googleApiKey:options.googleApiKey,requestedFields:{name:needsName,address:needsAddress,position:requestPosition},allowGeocodingFallback:mode==='FULL'})
      resolved.id=place.id
      next[i]=mergeProviderPlaceRuntime(place,resolved)
      if(positionCacheEnabled&&requestPosition&&resolved.position&&providerRef.provider==='GOOGLE'){
        try{const stored=await writeGooglePlacePositionCache(options.tripId!,providerRef.id,resolved.position);if(stored.stored)cacheWriteCount++}catch{}
      }
    }catch{failed.push(place.id)}
  }
  return {places:next,failedPlaceIds:failed,requestCount,cacheHitCount,cacheWriteCount}
}

/**
 * Explicit user action. Refreshes provider-owned pin coordinates sequentially so opening an old Trip
 * can never fan out into a burst of Places/Geocoding calls. Google refresh uses Place Details location
 * only; Geocoding fallback is intentionally disabled for predictable one-request-per-pin behavior.
 */
export async function refreshProviderPlacePositions(
  providerId:MapProviderId,
  places:readonly TripPlace[],
  options:{googleApiKey?:string;tripId?:string;googlePlacesPositionCacheTtlHours?:number},
):Promise<HydrationResult>{
  const next=places.map(place=>({...place}))
  const failed:string[]=[]
  let requestCount=0,cacheHitCount=0,cacheWriteCount=0
  const positionCacheEnabled=providerId==='GOOGLE'&&!!options.tripId&&(options.googlePlacesPositionCacheTtlHours??0)!==0
  for(let i=0;i<next.length;i++){
    const place=next[i],providerRef=place.providerRef
    if(!providerRef||providerRef.provider!==providerId||place.provenance?.position?.source==='USER')continue
    requestCount++
    try{
      const resolved=await resolveTripPlaceRef(providerId,providerRef,{googleApiKey:options.googleApiKey,requestedFields:{name:false,address:false,position:true},allowGeocodingFallback:false})
      resolved.id=place.id
      next[i]=mergeProviderPlaceRuntime(place,resolved)
      if(positionCacheEnabled&&resolved.position&&providerRef.provider==='GOOGLE'){
        try{const stored=await writeGooglePlacePositionCache(options.tripId!,providerRef.id,resolved.position);if(stored.stored)cacheWriteCount++}catch{}
      }
    }catch{failed.push(place.id)}
  }
  return {places:next,failedPlaceIds:failed,requestCount,cacheHitCount,cacheWriteCount}
}
