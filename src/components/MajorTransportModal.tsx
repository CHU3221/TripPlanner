import { useEffect, useState } from 'react'
import { DateTextInput, TimeTextInput, isValidDateText, parseTimeText } from './DateTimeInput'
import type { TripPlace } from '../domain/place'
import type { MajorTransportData } from '../model'
import type { PlaceCandidate, PlaceSearchProvider } from '../map/provider/contract'
import { timelineDateFromMinute, timelineMinuteFromDateTime } from '../model'
import { isVisualColor } from '../visual/appearance'
import { TransportPlacePicker } from './TransportPlacePicker'
import type { PlaceChoice, TransportDraft } from './editorTypes'
import { text as ui } from '../i18n/catalog'

const timeValue=(m:number)=>{const minute=((Math.round(m)%1440)+1440)%1440;return `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`}
function transportFieldConfig(mode:NonNullable<MajorTransportData['mode']>){
 switch(mode){
  case 'TRAIN': return {service:true,serviceLabel:ui.transport.trainNumber,seat:true}
  case 'FLIGHT': return {service:true,serviceLabel:ui.transport.serviceNumber,seat:true}
  case 'SHIP': return {service:true,serviceLabel:ui.transport.shipService,seat:true}
  case 'BUS': return {service:true,serviceLabel:ui.transport.busService,seat:true}
  default: return {service:false,serviceLabel:ui.transport.serviceNumber,seat:false}
 }
}

export function MajorTransportModal({transport,places,placeSearch,onPreviewPlaceCandidate,onClose,onSave,onDelete}:{
 transport:MajorTransportData
 places:TripPlace[]
 placeSearch?:PlaceSearchProvider
 onPreviewPlaceCandidate?:(candidate:PlaceCandidate|null)=>void
 onClose:()=>void
 onSave:(draft:TransportDraft)=>void
 onDelete:()=>void
}){
 const [dep,setDep]=useState<PlaceChoice>({mode:'EXISTING',placeId:transport.departure.placeId})
 const [arr,setArr]=useState<PlaceChoice>({mode:'EXISTING',placeId:transport.arrival.placeId})
 const [depDate,setDepDate]=useState(timelineDateFromMinute(transport.departure.departureAt)),[depTime,setDepTime]=useState(timeValue(transport.departure.departureAt))
 const [arrDate,setArrDate]=useState(timelineDateFromMinute(transport.arrival.arrivalAt)),[arrTime,setArrTime]=useState(timeValue(transport.arrival.arrivalAt))
 const [visualColor,setVisualColor]=useState(transport.visualColor??'');const [title,setTitle]=useState(transport.userTitle??''),[service,setService]=useState(transport.serviceNumber??''),[seat,setSeat]=useState(transport.seat??''),[memo,setMemo]=useState(transport.memo??''),[mode,setMode]=useState(transport.mode??'OTHER'),[error,setError]=useState('')
 useEffect(()=>{setDep({mode:'EXISTING',placeId:transport.departure.placeId});setArr({mode:'EXISTING',placeId:transport.arrival.placeId});setDepDate(timelineDateFromMinute(transport.departure.departureAt));setDepTime(timeValue(transport.departure.departureAt));setArrDate(timelineDateFromMinute(transport.arrival.arrivalAt));setArrTime(timeValue(transport.arrival.arrivalAt));setTitle(transport.userTitle??'');setVisualColor(transport.visualColor??'');setService(transport.serviceNumber??'');setSeat(transport.seat??'');setMemo(transport.memo??'');setMode(transport.mode??'OTHER');setError('');onPreviewPlaceCandidate?.(null)},[transport,onPreviewPlaceCandidate])
 const transportFields=transportFieldConfig(mode)
 function save(){
   if(dep.mode==='NONE'||arr.mode==='NONE'||(dep.mode==='NEW'&&!dep.name.trim())||(arr.mode==='NEW'&&!arr.name.trim())){setError(ui.transport.placesRequired);return}
   if(!isValidDateText(depDate)||!isValidDateText(arrDate)||parseTimeText(depTime)===null||parseTimeText(arrTime)===null){setError(ui.transport.dateTimeInvalid);return}
   const departureAt=timelineMinuteFromDateTime(depDate,depTime),arrivalAt=timelineMinuteFromDateTime(arrDate,arrTime)
   if(arrivalAt<=departureAt){setError(ui.transport.arrivalAfterDeparture);return}
   onSave({mode,departurePlace:dep,arrivalPlace:arr,departureAt,arrivalAt,title:title.trim(),serviceNumber:transportFields.service?service.trim()||undefined:undefined,seat:transportFields.seat?seat.trim()||undefined:undefined,memo:memo.trim()||undefined,visualColor:isVisualColor(visualColor)?visualColor:undefined,collapsedRange:transport.collapsedRange})
 }
 return <div className="modal-backdrop" onPointerDown={onClose}><section className="visit-modal schedule-editor-modal" data-component-version="4.5-provider-audit" onPointerDown={e=>e.stopPropagation()}><header><div><small>{ui.editorEyebrow.majorTransport}</small><strong>{ui.transport.majorEdit}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header><div className="visit-editor schedule-editor-body">
   <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.transport.info}</strong><small>{ui.transport.infoHelp}</small></div></div><div className="editor-grid"><label className="editor-field"><span>{ui.transport.mode}</span><select value={mode} onChange={e=>setMode(e.target.value as typeof mode)}><option value="TRAIN">{ui.transport.train}</option><option value="FLIGHT">{ui.transport.flight}</option><option value="SHIP">{ui.transport.ship}</option><option value="BUS">{ui.transport.bus}</option><option value="OTHER">{ui.transport.carOther}</option></select></label><label className="editor-field"><span>{ui.transport.displayName}</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder={ui.transport.displayNamePlaceholder}/></label>{transportFields.service&&<label className="editor-field"><span>{transportFields.serviceLabel}</span><input value={service} onChange={e=>setService(e.target.value)} placeholder={ui.common.optional}/></label>}{transportFields.seat&&<label className="editor-field"><span>{ui.transport.seat}</span><input value={seat} onChange={e=>setSeat(e.target.value)} placeholder={ui.common.optional}/></label>}</div></section>
   <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.transport.endpoints}</strong><small>{ui.transport.endpointsHelp}</small></div></div><div className="transport-endpoints"><div className="transport-endpoint-card"><TransportPlacePicker label={ui.common.departure} value={dep} onChange={setDep} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate}/><div className="editor-grid editor-subgrid"><DateTextInput value={depDate} onChange={setDepDate}/><TimeTextInput value={depTime} onChange={setDepTime}/></div></div><div className="transport-endpoint-card"><TransportPlacePicker label={ui.common.arrival} value={arr} onChange={setArr} places={places} placeSearch={placeSearch} onPreview={onPreviewPlaceCandidate}/><div className="editor-grid editor-subgrid"><DateTextInput value={arrDate} onChange={setArrDate}/><TimeTextInput value={arrTime} onChange={setArrTime}/></div></div></div></section>
   <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.common.memo}</strong><small>{ui.transport.memoHelp}</small></div></div><textarea className="editor-full-textarea" value={memo} onChange={e=>setMemo(e.target.value)} rows={2} placeholder={ui.common.optional}/></section>
   <section className="editor-section"><div className="editor-section-heading"><div><strong>{ui.transport.color}</strong><small>{ui.transport.colorHelp}</small></div></div><div className="visual-color-picker"><input type="color" aria-label={ui.transport.colorAria} value={isVisualColor(visualColor)?visualColor:'#3979dd'} onChange={e=>setVisualColor(e.target.value)}/><span>{visualColor||ui.schedule.autoDayColor}</span><button type="button" onClick={()=>setVisualColor('')}>{ui.schedule.useDayColor}</button></div></section>
   {error&&<p className="visit-editor-error">{error}</p>}
 </div><footer className="transport-modal-footer"><button type="button" className="danger-action" onClick={()=>window.confirm(ui.transport.deleteConfirm)&&onDelete()}>{ui.common.delete}</button><button onClick={onClose}>{ui.common.cancel}</button><button className="primary" onClick={save}>{ui.common.save}</button></footer></section></div>
}
