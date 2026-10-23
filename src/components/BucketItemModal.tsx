import { useEffect, useState } from 'react'
import type { BucketItem, TripPlace } from '../domain/place'
import type { PlaceCandidate, PlaceSearchProvider } from '../map/provider/contract'
import { MIN_VISIT } from '../model'
import { ScheduleEditorFields, buildScheduleDefinition, draftFromSchedule } from './ScheduleEditorFields'
import { PlacePicker } from './PlacePicker'
import type { PlaceChoice } from './editorTypes'
import { text as ui } from '../i18n/catalog'

function bucketMeta(item:BucketItem, fixed:boolean){
  if(fixed)return ui.schedule.fixedTemporarilyRemoved
  return item.planningKind==='NEARBY'?ui.schedule.nearby:ui.schedule.visitIntent
}
const initialChoice=(item:BucketItem):PlaceChoice=>item.placeId?{mode:'EXISTING',placeId:item.placeId}:{mode:'NONE'}

export function BucketItemModal({tripId,item,places,placeSearch,onPreviewPlaceCandidate,onClose,onSave,onDelete,onFocusPlace,canFocusPlace}:{tripId:string;item:BucketItem;places:TripPlace[];placeSearch?:PlaceSearchProvider;onPreviewPlaceCandidate?:(candidate:PlaceCandidate|null)=>void;onClose:()=>void;onSave:(item:BucketItem,place:PlaceChoice)=>void;onDelete:()=>void;onFocusPlace:(placeId?:string)=>void;canFocusPlace:(placeId?:string)=>boolean}){
 const [draft,setDraft]=useState(()=>draftFromSchedule(item))
 const [place,setPlace]=useState<PlaceChoice>(()=>initialChoice(item))
 const [duration,setDuration]=useState(item.duration===undefined?'':String(item.duration))
 const [error,setError]=useState('')
 useEffect(()=>{setDraft(draftFromSchedule(item));setPlace(initialChoice(item));setDuration(item.duration===undefined?'':String(item.duration));setError('')},[item])
 function save(){
   if(item.planningKind==='NEARBY'&&place.mode==='NONE'){setError(ui.schedule.nearbyNeedsPlace);return}
   if(place.mode==='NEW'&&!place.name.trim()){setError(ui.schedule.newPlaceNameRequired);return}
   const effective={...draft,placeId:place.mode==='EXISTING'?place.placeId:undefined}
   const built=buildScheduleDefinition(effective,{hasPhysicalPlace:place.mode!=='NONE'})
   if(built.error||!built.definition){setError(built.error??ui.schedule.infoInvalid);return}
   const minutes=duration===''?undefined:Number(duration)
   if(minutes!==undefined&&(!Number.isFinite(minutes)||minutes<MIN_VISIT)){setError(ui.schedule.minDuration(MIN_VISIT));return}
   onSave({...item,...built.definition,meta:bucketMeta({...item,...built.definition},built.definition.constraints?.fixedStart!==undefined),duration:minutes===undefined?undefined:Math.round(minutes),durationExplicit:minutes!==undefined},place)
 }
 const focusPlaceId=place.mode==='EXISTING'?place.placeId:undefined
 return <div className="modal-backdrop" onPointerDown={onClose}><section className="visit-modal schedule-editor-modal" onPointerDown={e=>e.stopPropagation()}><header><div><small>{ui.editorEyebrow.schedule}</small><strong>{ui.schedule.edit}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header><div className="visit-editor schedule-editor-body"><section className="editor-section editor-section-basic"><div className="editor-section-heading"><div><strong>{ui.common.place}</strong><small>{ui.schedule.samePlaceSearch}</small></div></div><div className="editor-grid"><PlacePicker value={place} onChange={setPlace} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate} allowNone={item.planningKind!=='NEARBY'}/></div></section><ScheduleEditorFields tripId={tripId} places={places} draft={{...draft,placeId:focusPlaceId}} onChange={setDraft} showPlace={false}/><section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.schedule.placementPrep}</strong><small>{ui.schedule.placementPrepHelp}</small></div></div><div className="editor-grid"><label className="editor-field editor-field-wide"><span>{ui.schedule.stayDuration}</span><div className="duration-input"><input type="number" min={MIN_VISIT} step="1" value={duration} onChange={e=>setDuration(e.target.value)} placeholder={ui.common.optional}/><em>{ui.common.minutes}</em></div><small>{ui.schedule.emptyDurationHelp}</small></label></div></section>{error&&<p className="visit-editor-error">{error}</p>}</div><footer><button type="button" className="danger-action" onClick={()=>window.confirm(ui.schedule.deleteConfirm)&&onDelete()}>{ui.common.delete}</button><button type="button" className="map-focus-action" onClick={()=>{onFocusPlace(focusPlaceId);onClose()}} disabled={!canFocusPlace(focusPlaceId)}><span className="material-symbols-rounded">map</span>{ui.common.viewPlace}</button><button onClick={onClose}>{ui.common.cancel}</button><button className="primary" onClick={save}>{ui.common.save}</button></footer></section></div>
}
