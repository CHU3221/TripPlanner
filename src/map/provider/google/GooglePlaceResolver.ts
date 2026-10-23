import type { TripPlace, TripPlaceProviderRef } from '../../../domain/place'
import { googleError, loadGoogleMaps } from './GoogleMapsSdk'
import { recordTelemetry } from '../../../telemetry'

function providerTripPlace(ref:TripPlaceProviderRef,name:string,address:string|undefined,lat:number|undefined,lng:number|undefined):TripPlace{
  const hasPosition=Number.isFinite(lat)&&Number.isFinite(lng)
  return {
    id:'',
    name,
    ...(address?{address}:{}),
    ...(hasPosition?{position:{lat:lat!,lng:lng!}}:{}),
    providerRef:{...ref},
    provenance:{
      name:{source:'PROVIDER',provider:'GOOGLE'},
      ...(address?{address:{source:'PROVIDER',provider:'GOOGLE'} as const}:{}),
      ...(hasPosition?{position:{source:'PROVIDER',provider:'GOOGLE'} as const}:{})
    }
  }
}

export type GooglePlaceResolveFields={name:boolean;address:boolean;position:boolean}
const ALL_FIELDS:GooglePlaceResolveFields={name:true,address:true,position:true}

async function resolveByGeocoding(maps:any,ref:TripPlaceProviderRef,requested:GooglePlaceResolveFields):Promise<TripPlace>{
  const {Geocoder}=await maps.importLibrary('geocoding')
  recordTelemetry('GOOGLE_GEOCODING','GOOGLE')
  const response=await new Geocoder().geocode({placeId:ref.id})
  const entry=response.results?.[0]
  if(!entry)throw new Error('Google Geocoding returned no result for the stored Place ID')
  const point=entry.geometry?.location
  const lat=typeof point?.lat==='function'?point.lat():point?.lat
  const lng=typeof point?.lng==='function'?point.lng():point?.lng
  const address=entry.formatted_address?String(entry.formatted_address):undefined
  // Geocoding does not expose the Places displayName field. Use the formatted
  // address as a runtime label rather than persisting provider content in the Trip.
  return providerTripPlace(ref,requested.name?(address??'Google 장소'):'',requested.address?address:undefined,requested.position?lat:undefined,requested.position?lng:undefined)
}

export async function resolveGooglePlaceRef(apiKey:string,ref:TripPlaceProviderRef,requested:GooglePlaceResolveFields=ALL_FIELDS,allowGeocodingFallback=true):Promise<TripPlace>{
  if(ref.provider!=='GOOGLE')throw new Error('Google resolver received a non-Google place reference')
  let maps:any
  try{maps=await loadGoogleMaps(apiKey)}catch(error){throw googleError(error,'Google Maps SDK를 불러오지 못했습니다.')}
  try{
    const {Place}=await maps.importLibrary('places')
    const place=new Place({id:ref.id})
    const fields:string[]=[]
    if(requested.name)fields.push('displayName')
    if(requested.address)fields.push('formattedAddress')
    if(requested.position)fields.push('location')
    if(!fields.length)return providerTripPlace(ref,'',undefined,undefined,undefined)
    recordTelemetry(requested.name?'GOOGLE_PLACE_DETAILS_PRO':'GOOGLE_PLACE_DETAILS_ESSENTIALS','GOOGLE')
    await place.fetchFields({fields})
    const lat=typeof place.location?.lat==='function'?place.location.lat():place.location?.lat
    const lng=typeof place.location?.lng==='function'?place.location.lng():place.location?.lng
    return providerTripPlace(ref,requested.name?String(place.displayName||'Google 장소'):'',requested.address&&place.formattedAddress?String(place.formattedAddress):undefined,requested.position?lat:undefined,requested.position?lng:undefined)
  }catch(detailsError){
    if(!allowGeocodingFallback)throw googleError(detailsError,'저장된 Google 장소 정보를 다시 불러오지 못했습니다. Place Details 설정과 사용량 한도를 확인해주세요.')
    // Explicit/manual full hydration may still use the legacy Geocoding recovery path.
    try{return await resolveByGeocoding(maps,ref,requested)}
    catch(geocodeError){
      const detailsMessage=detailsError instanceof Error?detailsError.message:String(detailsError??'')
      const fallback=detailsMessage
        ? `저장된 Google 장소 정보를 다시 불러오지 못했습니다. Place Details 및 Geocoding 설정을 확인해주세요. (${detailsMessage})`
        : '저장된 Google 장소 정보를 다시 불러오지 못했습니다. Place Details 및 Geocoding 설정을 확인해주세요.'
      throw googleError(geocodeError,fallback)
    }
  }
}
