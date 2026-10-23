import { useState } from 'react'
import { DateTextInput, TimeTextInput, isValidDateText, parseTimeText } from './DateTimeInput'
import type { TripPlace } from '../domain/place'
import type { MajorTransportData } from '../model'
import type { PlaceChoice, PlacePlanDraft, TransportDraft } from './editorTypes'
import type { PlaceCandidate, PlaceSearchProvider } from '../map/provider/contract'
import { MIN_VISIT, TIMELINE_EPOCH_DATE, timelineMinuteFromDateTime } from '../model'
import { ScheduleEditorFields, buildScheduleDefinition, draftFromSchedule } from './ScheduleEditorFields'
import { TransportPlacePicker } from './TransportPlacePicker'
import { PlacePicker } from './PlacePicker'
import { text as ui } from '../i18n/catalog'


function transportFieldConfig(mode:NonNullable<MajorTransportData['mode']>){
 switch(mode){
  case 'TRAIN': return {service:true,serviceLabel:ui.transport.trainNumber,seat:true}
  case 'FLIGHT': return {service:true,serviceLabel:ui.transport.serviceNumber,seat:true}
  case 'SHIP': return {service:true,serviceLabel:ui.transport.shipService,seat:true}
  case 'BUS': return {service:true,serviceLabel:ui.transport.busService,seat:true}
  default: return {service:false,serviceLabel:ui.transport.serviceNumber,seat:false}
 }
}


export function AddScheduleModal({tripId,places,placeSearch,onPreviewPlaceCandidate,onClose,onCreatePlacePlan,onCreateTransport}:{tripId:string;places:TripPlace[];placeSearch?:PlaceSearchProvider;onPreviewPlaceCandidate?:(candidate:PlaceCandidate|null)=>void;onClose:()=>void;onCreatePlacePlan:(d:PlacePlanDraft)=>void;onCreateTransport:(d:TransportDraft)=>void}){
 const [top,setTop]=useState<'PLACE'|'TRANSPORT'>('PLACE')
 const [purpose,setPurpose]=useState<'VISIT'|'NEARBY'|'BASE'>('VISIT')
 const [place,setPlace]=useState<PlaceChoice>({mode:'NEW',name:''})
 const [scheduleDraft,setScheduleDraft]=useState(()=>draftFromSchedule({planningKind:'VISIT'}))
 const [baseDraft,setBaseDraft]=useState(()=>draftFromSchedule({planningKind:'VISIT'})),[duration,setDuration]=useState('')
 const [error,setError]=useState('')

 const [depPlace,setDepPlace]=useState<PlaceChoice>({mode:'NEW',name:''}),[arrPlace,setArrPlace]=useState<PlaceChoice>({mode:'NEW',name:''})
 const [mode,setMode]=useState<NonNullable<MajorTransportData['mode']>>('TRAIN'),[depDate,setDepDate]=useState(TIMELINE_EPOCH_DATE),[depTime,setDepTime]=useState(''),[arrDate,setArrDate]=useState(TIMELINE_EPOCH_DATE),[arrTime,setArrTime]=useState(''),[transportTitle,setTransportTitle]=useState(''),[service,setService]=useState(''),[seat,setSeat]=useState(''),[memo,setMemo]=useState('')
 const transportFields=transportFieldConfig(mode)

 function choosePurpose(next:'VISIT'|'NEARBY'|'BASE'){
   setPurpose(next)
   if(next!=='BASE')setScheduleDraft(d=>({...d,planningKind:next}))
   if(next!=='VISIT'&&place.mode==='NONE'){
     setPlace({mode:'NEW',name:''})
     onPreviewPlaceCandidate?.(null)
     setScheduleDraft(d=>({...d,placeId:undefined}))
   }
 }
 function parseDuration(){
   if(duration==='')return {value:undefined as number|undefined}
   const value=Number(duration)
   if(!Number.isFinite(value)||value<MIN_VISIT)return {error:ui.schedule.stayMinDuration(MIN_VISIT)}
   return {value:Math.round(value)}
 }
 function savePlace(){
   setError('')
   if(purpose!=='VISIT'&&place.mode==='NONE'){setError(purpose==='BASE'?ui.base.needsPlace:ui.schedule.nearbyNeedsPlace);return}
   if(place.mode==='NEW'&&!place.name.trim()){setError(ui.schedule.newPlaceNameRequired);return}
   const durationResult=parseDuration();if(durationResult.error){setError(durationResult.error);return}
   if(purpose==='BASE'){
     const built=buildScheduleDefinition({...baseDraft,placeId:place.mode==='EXISTING'?place.placeId:undefined,planningKind:'VISIT'},{hasPhysicalPlace:true})
     if(built.error||!built.definition){setError(built.error??ui.schedule.infoInvalid);return}
     const d=built.definition
     onCreatePlacePlan({purpose,place,title:d.title,detail:d.detail,notes:d.notes,duration:durationResult.value,visitIcon:d.visitIcon,expectedCost:d.expectedCost,checklist:d.checklist,attachments:d.attachments})
     return
   }
   const built=buildScheduleDefinition({...scheduleDraft,placeId:place.mode==='EXISTING'?place.placeId:undefined,planningKind:purpose},{hasPhysicalPlace:place.mode!=='NONE'})
   if(built.error||!built.definition){setError(built.error??ui.schedule.infoInvalid);return}
   onCreatePlacePlan({purpose,place,title:built.definition.title,detail:built.definition.detail,notes:built.definition.notes,duration:durationResult.value,visitIcon:built.definition.visitIcon,expectedCost:built.definition.expectedCost,checklist:built.definition.checklist,attachments:built.definition.attachments,constraints:built.definition.constraints})
 }
 function saveTransport(){
   setError('')
   if(depPlace.mode==='NONE'||arrPlace.mode==='NONE'||(depPlace.mode==='NEW'&&!depPlace.name.trim())||(arrPlace.mode==='NEW'&&!arrPlace.name.trim())){setError(ui.transport.placesRequired);return}
   if(!isValidDateText(depDate)||!isValidDateText(arrDate)||parseTimeText(depTime)===null||parseTimeText(arrTime)===null){setError(ui.transport.dateTimeInputInvalid);return}
   const departureAt=timelineMinuteFromDateTime(depDate,depTime),arrivalAt=timelineMinuteFromDateTime(arrDate,arrTime)
   if(arrivalAt<=departureAt){setError(ui.transport.arrivalAfterDeparture);return}
   onCreateTransport({mode,departurePlace:depPlace,arrivalPlace:arrPlace,departureAt,arrivalAt,title:transportTitle.trim(),serviceNumber:transportFields.service?service.trim()||undefined:undefined,seat:transportFields.seat?seat.trim()||undefined:undefined,memo:memo.trim()||undefined})
 }
 return <div className="modal-backdrop" onPointerDown={onClose}><section className="visit-modal schedule-create-modal schedule-editor-modal" onPointerDown={e=>e.stopPropagation()}><header><div><small>{ui.createSchedule.eyebrow}</small><strong>{ui.createSchedule.title}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header>
   <div className="visit-editor schedule-editor-body">
     <div className="segmented-choice segmented-choice-2 schedule-top-choice"><button type="button" className={top==='PLACE'?'active':''} onClick={()=>setTop('PLACE')}>{ui.createSchedule.placeTab}</button><button type="button" className={top==='TRANSPORT'?'active':''} onClick={()=>{setTop('TRANSPORT');onPreviewPlaceCandidate?.(null)}}>{ui.createSchedule.transportTab}</button></div>
     {top==='PLACE'?<>
       <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.createSchedule.purposeTitle}</strong><small>{ui.createSchedule.purposeHelp}</small></div></div><div className="segmented-choice segmented-choice-3"><button type="button" className={purpose==='VISIT'?'active':''} onClick={()=>choosePurpose('VISIT')}>{ui.schedule.visit}</button><button type="button" className={purpose==='NEARBY'?'active':''} onClick={()=>choosePurpose('NEARBY')}>{ui.schedule.nearby}</button><button type="button" className={purpose==='BASE'?'active':''} onClick={()=>choosePurpose('BASE')}>{ui.mapPopup.base}</button></div></section>
       <section className="editor-section editor-section-basic"><div className="editor-section-heading"><div><strong>{ui.common.place}</strong><small>{purpose==='BASE'?ui.createSchedule.basePlaceHelp:ui.createSchedule.placeHelp}</small></div></div><div className="editor-grid"><PlacePicker value={place} onChange={next=>{setPlace(next);setScheduleDraft(d=>({...d,placeId:next.mode==='EXISTING'?next.placeId:undefined}));if(next.mode!=='NEW')onPreviewPlaceCandidate?.(null)}} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate} allowNone={purpose==='VISIT'} noneLabel={ui.placePicker.anywhere} help={purpose==='BASE'?ui.base.needsPlace:ui.placePicker.help}/></div></section>
       {purpose==='BASE'?<><ScheduleEditorFields tripId={tripId} places={places} draft={{...baseDraft,placeId:place.mode==='EXISTING'?place.placeId:undefined,planningKind:'VISIT'}} onChange={setBaseDraft} showPlace={false} showPlanningKind={false} showTimeConditions={false} hasPhysicalPlace/><section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.base.defaultDuration}</strong><small>{ui.base.createInfoHelp}</small></div></div><div className="editor-grid"><label className="editor-field editor-field-wide"><span>{ui.base.defaultDuration}</span><div className="duration-input"><input type="number" min={MIN_VISIT} value={duration} onChange={e=>setDuration(e.target.value)} placeholder={ui.common.optional}/><em>{ui.common.minutes}</em></div></label></div></section></>:<><ScheduleEditorFields tripId={tripId} places={places} draft={{...scheduleDraft,placeId:place.mode==='EXISTING'?place.placeId:undefined,planningKind:purpose}} onChange={next=>setScheduleDraft(next)} showPlace={false} showPlanningKind={false} hasPhysicalPlace={place.mode!=='NONE'}/><section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.schedule.placementLength}</strong><small>{ui.schedule.placementLengthHelp}</small></div></div><div className="editor-grid"><label className="editor-field editor-field-wide"><span>{ui.schedule.stayDuration}</span><div className="duration-input"><input type="number" min={MIN_VISIT} value={duration} onChange={e=>setDuration(e.target.value)} placeholder={ui.common.optional}/><em>{ui.common.minutes}</em></div></label></div></section></>}
     </>:<>
       <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.createSchedule.transportInfo}</strong><small>{ui.createSchedule.transportInfoHelp}</small></div></div><div className="editor-grid"><label className="editor-field"><span>{ui.transport.mode}</span><select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="TRAIN">{ui.transport.train}</option><option value="FLIGHT">{ui.transport.flight}</option><option value="SHIP">{ui.transport.ship}</option><option value="BUS">{ui.transport.bus}</option><option value="OTHER">{ui.transport.carOther}</option></select></label><label className="editor-field"><span>{ui.transport.displayName}</span><input value={transportTitle} onChange={e=>setTransportTitle(e.target.value)} placeholder={ui.transport.displayNamePlaceholder}/></label>{transportFields.service&&<label className="editor-field"><span>{transportFields.serviceLabel}</span><input value={service} onChange={e=>setService(e.target.value)} placeholder={ui.common.optional}/></label>}{transportFields.seat&&<label className="editor-field"><span>{ui.transport.seat}</span><input value={seat} onChange={e=>setSeat(e.target.value)} placeholder={ui.common.optional}/></label>}</div></section>
       <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.createSchedule.endpoints}</strong><small>{ui.createSchedule.endpointsHelp}</small></div></div><div className="transport-endpoints"><div className="transport-endpoint-card"><TransportPlacePicker label={ui.common.departure} value={depPlace} onChange={setDepPlace} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate}/><div className="editor-grid editor-subgrid"><DateTextInput value={depDate} onChange={setDepDate}/><TimeTextInput value={depTime} onChange={setDepTime}/></div></div><div className="transport-endpoint-card"><TransportPlacePicker label={ui.common.arrival} value={arrPlace} onChange={setArrPlace} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate}/><div className="editor-grid editor-subgrid"><DateTextInput value={arrDate} onChange={setArrDate}/><TimeTextInput value={arrTime} onChange={setArrTime}/></div></div></div></section>
       <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.common.memo}</strong><small>{ui.transport.createMemoHelp}</small></div></div><textarea className="editor-full-textarea" value={memo} onChange={e=>setMemo(e.target.value)} rows={2} placeholder={ui.common.optional}/></section>
     </>}
     {error&&<p className="visit-editor-error">{error}</p>}
   </div><footer><span className="footer-spacer"/><button onClick={onClose}>{ui.common.cancel}</button><button className="primary" onClick={top==='PLACE'?savePlace:saveTransport}>{ui.common.add}</button></footer></section></div>
}
