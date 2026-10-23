import { useEffect, useState } from 'react'
import type { TripPlace } from '../domain/place'
import type { PlaceCandidate, PlaceSearchProvider } from '../map/provider/contract'
import { MIN_VISIT, timelineDateFromMinute, timelineMinuteFromDateTime } from '../model'
import type { VisitData } from '../model'
import { DateTextInput, TimeTextInput, isValidDateText, parseTimeText } from './DateTimeInput'
import { isVisualColor } from '../visual/appearance'
import { ScheduleEditorFields, buildScheduleDefinition, draftFromSchedule } from './ScheduleEditorFields'
import { PlacePicker } from './PlacePicker'
import type { PlaceChoice } from './editorTypes'
import { text as ui } from '../i18n/catalog'

type EndMode = 'DURATION' | 'END'
const timeValue=(minutes:number)=>{const m=((Math.round(minutes)%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
const makeDraft=(visit:VisitData)=>{const draft=draftFromSchedule(visit);if(visit.constraints?.fixedStart===undefined){draft.fixedDate=timelineDateFromMinute(visit.start);draft.fixedTime=timeValue(visit.start)}return draft}
const initialChoice=(visit:VisitData):PlaceChoice=>visit.placeId?{mode:'EXISTING',placeId:visit.placeId}:{mode:'NONE'}

export function VisitModal({tripId,visit,places,placeSearch,onPreviewPlaceCandidate,onClose,onSave,onDelete,onFocusPlace,canFocusPlace}:{tripId:string;visit:VisitData;places:TripPlace[];placeSearch?:PlaceSearchProvider;onPreviewPlaceCandidate?:(candidate:PlaceCandidate|null)=>void;onClose:()=>void;onSave:(visit:VisitData,place:PlaceChoice)=>void;onDelete:()=>void;onFocusPlace:(placeId?:string)=>void;canFocusPlace:(placeId?:string)=>boolean}){
  const [draft,setDraft]=useState(()=>makeDraft(visit)),[place,setPlace]=useState<PlaceChoice>(()=>initialChoice(visit))
  const [startDate,setStartDate]=useState(timelineDateFromMinute(visit.start)),[startTime,setStartTime]=useState(timeValue(visit.start))
  const [endDate,setEndDate]=useState(timelineDateFromMinute(visit.end)),[endTime,setEndTime]=useState(timeValue(visit.end))
  const [visualColor,setVisualColor]=useState(visit.visualColor??''),[duration,setDuration]=useState(String(visit.end-visit.start)),[mode,setMode]=useState<EndMode>('DURATION'),[error,setError]=useState('')
  useEffect(()=>{setDraft(makeDraft(visit));setPlace(initialChoice(visit));setStartDate(timelineDateFromMinute(visit.start));setStartTime(timeValue(visit.start));setEndDate(timelineDateFromMinute(visit.end));setEndTime(timeValue(visit.end));setDuration(String(visit.end-visit.start));setVisualColor(visit.visualColor??'');setMode('DURATION');setError('')},[visit])
  function save(){
    if(visit.planningKind==='NEARBY'&&place.mode==='NONE'){setError(ui.schedule.nearbyNeedsPlace);return}
    if(place.mode==='NEW'&&!place.name.trim()){setError(ui.schedule.newPlaceNameRequired);return}
    const effective={...draft,placeId:place.mode==='EXISTING'?place.placeId:undefined}
    const built=buildScheduleDefinition(effective,{hasPhysicalPlace:place.mode!=='NONE'})
    if(built.error||!built.definition){setError(built.error??ui.schedule.infoInvalid);return}
    let nextStart:number
    if(built.definition.constraints?.fixedStart!==undefined)nextStart=built.definition.constraints.fixedStart
    else{if(!isValidDateText(startDate)||parseTimeText(startTime)===null){setError(ui.schedule.placementStartInvalid);return}nextStart=timelineMinuteFromDateTime(startDate,startTime)}
    let nextEnd:number
    if(mode==='DURATION'){const minutes=Number(duration);if(!Number.isFinite(minutes)||minutes<MIN_VISIT){setError(ui.schedule.minDuration(MIN_VISIT));return}nextEnd=nextStart+Math.round(minutes)}
    else{if(!isValidDateText(endDate)||parseTimeText(endTime)===null){setError(ui.schedule.placementEndInvalid);return}nextEnd=timelineMinuteFromDateTime(endDate,endTime)}
    if(nextEnd-nextStart<MIN_VISIT){setError(ui.schedule.minDuration(MIN_VISIT));return}
    const durationChanged=(nextEnd-nextStart)!==(visit.end-visit.start)
    onSave({...visit,...built.definition,start:nextStart,end:nextEnd,durationExplicit:visit.durationExplicit||durationChanged,visualColor:isVisualColor(visualColor)?visualColor:undefined},place)
  }
  const fixed=draft.timeKind==='FIXED',focusPlaceId=place.mode==='EXISTING'?place.placeId:undefined
  return <div className="modal-backdrop" onPointerDown={onClose}><section className="visit-modal schedule-editor-modal" onPointerDown={e=>e.stopPropagation()}>
    <header><div><small>SCHEDULE · TIMELINE</small><strong>{ui.schedule.edit}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header>
    <div className="visit-editor schedule-editor-body"><section className="editor-section editor-section-basic"><div className="editor-section-heading"><div><strong>{ui.common.place}</strong><small>{ui.schedule.samePlaceSearch}</small></div></div><div className="editor-grid"><PlacePicker value={place} onChange={setPlace} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate} allowNone={visit.planningKind!=='NEARBY'}/></div></section>
      <ScheduleEditorFields tripId={tripId} places={places} draft={{...draft,placeId:focusPlaceId}} onChange={setDraft} showPlace={false}/>
      <section className="editor-section editor-section-placement"><div className="editor-section-heading"><div><strong>{ui.schedule.placement}</strong><small>{fixed?ui.schedule.placementFixedHelp:ui.schedule.placementHelp}</small></div></div>{!fixed&&<div className="editor-grid editor-subgrid"><label className="editor-field"><span>{ui.schedule.startDate}</span><DateTextInput value={startDate} onChange={setStartDate}/></label><label className="editor-field"><span>{ui.schedule.startTime}</span><TimeTextInput value={startTime} onChange={setStartTime}/></label></div>}<div className="segmented-choice segmented-choice-2 compact-choice"><button type="button" className={mode==='DURATION'?'active':''} onClick={()=>setMode('DURATION')}>{ui.schedule.duration}</button><button type="button" className={mode==='END'?'active':''} onClick={()=>setMode('END')}>{ui.schedule.endDateTime}</button></div>{mode==='DURATION'?<div className="editor-grid"><label className="editor-field editor-field-wide"><span>{ui.schedule.duration}</span><div className="duration-input"><input type="number" min={MIN_VISIT} step="1" value={duration} onChange={e=>setDuration(e.target.value)}/><em>{ui.common.minutes}</em></div></label></div>:<div className="editor-grid editor-subgrid"><label className="editor-field"><span>{ui.schedule.endDate}</span><DateTextInput value={endDate} onChange={setEndDate}/></label><label className="editor-field"><span>{ui.schedule.endTime}</span><TimeTextInput value={endTime} onChange={setEndTime}/></label></div>}</section>
      <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.schedule.color}</strong><small>{ui.schedule.colorHelp}</small></div></div><div className="visual-color-picker"><input type="color" aria-label={ui.schedule.colorAria} value={isVisualColor(visualColor)?visualColor:'#3979dd'} onChange={e=>setVisualColor(e.target.value)}/><span>{visualColor||ui.schedule.autoDayColor}</span><button type="button" onClick={()=>setVisualColor('')}>{ui.schedule.useDayColor}</button></div></section>{error&&<p className="visit-editor-error">{error}</p>}
    </div><footer><button type="button" className="danger-action" onClick={()=>window.confirm(ui.schedule.deleteConfirm)&&onDelete()}>{ui.common.delete}</button><button type="button" className="map-focus-action" onClick={()=>{onFocusPlace(focusPlaceId);onClose()}} disabled={!canFocusPlace(focusPlaceId)}><span className="material-symbols-rounded">map</span>{ui.common.viewPlace}</button><button onClick={onClose}>{ui.common.cancel}</button><button className="primary" onClick={save}>{ui.common.save}</button></footer>
  </section></div>
}
