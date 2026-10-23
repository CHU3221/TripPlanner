import type { BucketItem, TripBase, TripPlace, TripPlaceFieldKey } from '../domain/place'
import { DEFAULT_TIMELINE_VIEW, type ConnectionPlan, type MajorTransportData, type TimelineLabel, type TimelineViewSettings, type VisitData } from '../model'
import { DEFAULT_TRIP_APPEARANCE, normalizeTripAppearanceSettings, type TripAppearanceSettings, type TripDayColors } from '../visual/appearance'
import type { Region } from '../domain/region'
import type { StoredMajorTransport, StoredPlace, TripSnapshot, TripSnapshotV3 } from './contract'
import { DEFAULT_TRIP_MAP_SETTINGS, normalizeTripMapSettings, type TripMapSettings } from '../map/tripMapSettings'

export type TripEditorState={
  tripId:string;name:string;mapProvider:'GOOGLE'|'NAVER';places:TripPlace[];regions:Region[];visits:VisitData[];bucketItems:BucketItem[];bases:TripBase[];transports:MajorTransportData[];labels:TimelineLabel[];plans:Record<string,ConnectionPlan>;timelineView:TimelineViewSettings;dayColors:TripDayColors;mapSettings?:TripMapSettings;appearanceSettings?:TripAppearanceSettings
}
export type RestoredTripEditorState=Omit<TripEditorState,'tripId'|'name'|'mapProvider'>
const userSource=(place:TripPlace,key:TripPlaceFieldKey)=>place.provenance?.[key]?.source==='USER'||(!place.providerRef&&!place.provenance?.[key])
export function storeTripPlace(place:TripPlace):StoredPlace{
  const userData:StoredPlace['userData']={}
  if(userSource(place,'name')&&place.name)userData.name=place.name
  if(userSource(place,'address')&&place.address)userData.address=place.address
  if(userSource(place,'position')&&place.position)userData.position={...place.position}
  if(place.category)userData.category=place.category
  if(place.memo)userData.memo=place.memo
  if(place.searchLabel)userData.searchLabel=place.searchLabel
  return {id:place.id,...(place.providerRef?{providerRef:{...place.providerRef}}:{}),userData}
}
function storeTransport(t:MajorTransportData):StoredMajorTransport{return {id:t.id,occupiedFrom:t.occupiedFrom,occupiedUntil:t.occupiedUntil,...(t.mode?{mode:t.mode}:{}),...(t.serviceNumber?{serviceNumber:t.serviceNumber}:{}),...(t.seat?{seat:t.seat}:{}),...(t.memo?{memo:t.memo}:{}),...(t.userTitle?{userTitle:t.userTitle}:{}),...(t.collapsedRange?{collapsedRange:{...t.collapsedRange}}:{}),...(t.visualColor?{visualColor:t.visualColor}:{}),departure:{placeId:t.departure.placeId,departureAt:t.departure.departureAt,...(t.departure.detail?{detail:t.departure.detail}:{})},arrival:{placeId:t.arrival.placeId,arrivalAt:t.arrival.arrivalAt,...(t.arrival.detail?{detail:t.arrival.detail}:{})}}}
export function createTripSnapshot(state:TripEditorState):TripSnapshotV3{const mapSettings=normalizeTripMapSettings(state.mapSettings),appearanceSettings=normalizeTripAppearanceSettings(state.appearanceSettings);return {schemaVersion:3,tripId:state.tripId,name:state.name,mapProvider:state.mapProvider,places:state.places.map(storeTripPlace),regions:structuredClone(state.regions),visits:structuredClone(state.visits),bucketItems:structuredClone(state.bucketItems),bases:structuredClone(state.bases),transports:state.transports.map(storeTransport),labels:structuredClone(state.labels),plans:structuredClone(state.plans),timelineView:{...(state.timelineView??DEFAULT_TIMELINE_VIEW)},...(Object.keys(state.dayColors).length?{dayColors:{...state.dayColors}}:{}),...(mapSettings.connectionWidthPx!==DEFAULT_TRIP_MAP_SETTINGS.connectionWidthPx?{mapSettings}:{}),...(appearanceSettings.planBColor!==DEFAULT_TRIP_APPEARANCE.planBColor?{appearanceSettings}:{})}}
function restorePlace(place:StoredPlace):TripPlace{
  const u=place.userData
  const provenance:TripPlace['provenance']={}
  if(u.name)provenance.name={source:'USER'}
  if(u.address)provenance.address={source:'USER'}
  if(u.position)provenance.position={source:'USER'}
  return {id:place.id,name:u.name??u.searchLabel??(place.providerRef?'저장된 장소':'이름 없는 장소'),...(u.address?{address:u.address}:{}),...(u.position?{position:{...u.position}}:{}),...(u.category?{category:u.category}:{}),...(u.memo?{memo:u.memo}:{}),...(u.searchLabel?{searchLabel:u.searchLabel}:{}),...(place.providerRef?{providerRef:{...place.providerRef}}:{}),...(Object.keys(provenance).length?{provenance}:{})}
}
const iconFor=(mode:MajorTransportData['mode'])=>mode==='TRAIN'?'train':mode==='FLIGHT'?'flight':mode==='SHIP'?'directions_boat':mode==='BUS'?'directions_bus':'directions_car'
const projectedPlaceName=(places:readonly TripPlace[],id:string)=>places.find(p=>p.id===id)?.name??'저장된 장소'

/** Rebuilds display-only MajorTransport strings from canonical endpoint Place IDs. */
export function refreshMajorTransportPlaceProjection(t:MajorTransportData,places:readonly TripPlace[]):MajorTransportData{
  const dep=projectedPlaceName(places,t.departure.placeId),arr=projectedPlaceName(places,t.arrival.placeId)
  const title=t.userTitle??t.serviceNumber??`${dep} → ${arr}`
  return {...t,departure:{...t.departure,place:dep},arrival:{...t.arrival,place:arr},onboard:{title,route:`${dep} → ${arr}`,icon:iconFor(t.mode)}}
}
function restoreTransport(t:StoredMajorTransport,places:TripPlace[]):MajorTransportData{
  const dep=projectedPlaceName(places,t.departure.placeId),arr=projectedPlaceName(places,t.arrival.placeId),title=t.userTitle??t.serviceNumber??`${dep} → ${arr}`
  return {...structuredClone(t),departure:{...t.departure,place:dep},arrival:{...t.arrival,place:arr},onboard:{title,route:`${dep} → ${arr}`,icon:iconFor(t.mode)}}
}
export function restoreTripSnapshot(snapshot:TripSnapshot):RestoredTripEditorState{
  const places=snapshot.places.map(restorePlace)
  return {places,regions:structuredClone(snapshot.regions),visits:structuredClone(snapshot.visits),bucketItems:structuredClone(snapshot.bucketItems),bases:structuredClone(snapshot.bases),transports:snapshot.transports.map(t=>restoreTransport(t,places)),labels:structuredClone(snapshot.labels),plans:structuredClone(snapshot.plans),timelineView:{...(snapshot.timelineView??DEFAULT_TIMELINE_VIEW)},dayColors:{...(snapshot.dayColors??{})},mapSettings:normalizeTripMapSettings(snapshot.mapSettings),appearanceSettings:normalizeTripAppearanceSettings(snapshot.appearanceSettings)}
}
export function mergeProviderPlaceRuntime(base:TripPlace,resolved:TripPlace):TripPlace{
  const isUser=(key:TripPlaceFieldKey)=>base.provenance?.[key]?.source==='USER'
  return {...base,name:isUser('name')?base.name:(resolved.name||base.name),address:isUser('address')?base.address:(resolved.address??base.address),position:isUser('position')?base.position:(resolved.position??base.position),provenance:{...base.provenance,...(!isUser('name')&&resolved.name?{name:resolved.provenance?.name}:{}),...(!isUser('address')&&resolved.address?{address:resolved.provenance?.address}:{}),...(!isUser('position')&&resolved.position?{position:resolved.provenance?.position}:{})}}
}
