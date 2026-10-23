import { useEffect, useState } from 'react'
import type { TripBase, TripPlace } from '../domain/place'
import type { PlaceCandidate, PlaceSearchProvider } from '../map/provider/contract'
import { MIN_VISIT } from '../model'
import { PlacePicker } from './PlacePicker'
import type { PlaceChoice } from './editorTypes'
import { text as ui } from '../i18n/catalog'
import { ScheduleEditorFields, buildScheduleDefinition, draftFromSchedule } from './ScheduleEditorFields'

const initialChoice=(base:TripBase):PlaceChoice=>({mode:'EXISTING',placeId:base.placeId})
const baseDraft=(base:TripBase)=>draftFromSchedule({placeId:base.placeId,title:base.title,detail:base.detail,notes:base.notes,visitIcon:base.visitIcon,expectedCost:base.expectedCost,checklist:base.checklist,attachments:base.attachments,planningKind:'VISIT'})

export function BaseModal({tripId,base,places,placeSearch,onPreviewPlaceCandidate,onClose,onSave,onDelete,onFocusPlace,canFocusPlace}:{tripId:string;base:TripBase;places:TripPlace[];placeSearch?:PlaceSearchProvider;onPreviewPlaceCandidate?:(candidate:PlaceCandidate|null)=>void;onClose:()=>void;onSave:(base:TripBase,place:PlaceChoice)=>void;onDelete:()=>void;onFocusPlace:(placeId?:string)=>void;canFocusPlace:(placeId?:string)=>boolean}){
  const [place,setPlace]=useState<PlaceChoice>(()=>initialChoice(base)),[draft,setDraft]=useState(()=>baseDraft(base)),[duration,setDuration]=useState(base.duration===undefined?'':String(base.duration)),[error,setError]=useState('')
  useEffect(()=>{setPlace(initialChoice(base));setDraft(baseDraft(base));setDuration(base.duration===undefined?'':String(base.duration));setError('')},[base])
  function save(){
    if(place.mode==='NONE'){setError(ui.base.needsPlace);return}
    if(place.mode==='NEW'&&!place.name.trim()){setError(ui.schedule.newPlaceNameRequired);return}
    const minutes=duration===''?undefined:Number(duration)
    if(minutes!==undefined&&(!Number.isFinite(minutes)||minutes<MIN_VISIT)){setError(ui.schedule.stayMinDuration(MIN_VISIT));return}
    const built=buildScheduleDefinition({...draft,placeId:place.mode==='EXISTING'?place.placeId:undefined,planningKind:'VISIT'},{hasPhysicalPlace:true})
    if(built.error||!built.definition){setError(built.error??ui.schedule.infoInvalid);return}
    const definition=built.definition
    onSave({...base,title:definition.title,detail:definition.detail,notes:definition.notes,duration:minutes===undefined?undefined:Math.round(minutes),visitIcon:definition.visitIcon,expectedCost:definition.expectedCost,checklist:definition.checklist,attachments:definition.attachments},place)
  }
  const focusPlaceId=place.mode==='EXISTING'?place.placeId:undefined
  return <div className="modal-backdrop" onPointerDown={onClose}><section className="visit-modal schedule-editor-modal" onPointerDown={e=>e.stopPropagation()}><header><div><small>{ui.editorEyebrow.base}</small><strong>{ui.base.edit}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header><div className="visit-editor schedule-editor-body"><section className="editor-section editor-section-basic"><div className="editor-section-heading"><div><strong>{ui.common.place}</strong><small>{ui.base.placeHelp}</small></div></div><div className="editor-grid"><PlacePicker value={place} onChange={setPlace} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate} allowNone={false}/></div></section><ScheduleEditorFields tripId={tripId} places={places} draft={{...draft,placeId:focusPlaceId}} onChange={setDraft} showPlace={false} showPlanningKind={false} showTimeConditions={false} hasPhysicalPlace/><section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.base.defaultDuration}</strong><small>{ui.base.infoHelp}</small></div></div><div className="editor-grid"><label className="editor-field editor-field-wide"><span>{ui.base.defaultDuration}</span><div className="duration-input"><input type="number" min={MIN_VISIT} value={duration} onChange={e=>setDuration(e.target.value)} placeholder={ui.common.optional}/><em>{ui.common.minutes}</em></div></label></div></section>{error&&<p className="visit-editor-error">{error}</p>}</div><footer><button type="button" className="danger-action" onClick={()=>window.confirm(ui.base.deleteConfirm)&&onDelete()}>{ui.common.delete}</button><button type="button" className="map-focus-action" onClick={()=>{onFocusPlace(focusPlaceId);onClose()}} disabled={!canFocusPlace(focusPlaceId)}><span className="material-symbols-rounded">map</span>{ui.common.viewPlace}</button><button onClick={onClose}>{ui.common.cancel}</button><button className="primary" onClick={save}>{ui.common.save}</button></footer></section></div>
}
