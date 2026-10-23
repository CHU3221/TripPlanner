import type { TripPlace, ScheduleDefinition, PlanningKind, PlacementConstraints, VisitPropertyIcon, ScheduleAttachment } from '../domain/place'
import { TIMELINE_EPOCH_DATE, timelineDateFromMinute, timelineMinuteFromDateTime } from '../model'
import { DateTextInput, TimeTextInput, isValidDateText, parseTimeText } from './DateTimeInput'
import { text as ui } from '../i18n/catalog'
import { COMMON_COST_CURRENCIES, VISIT_PROPERTY_ICONS } from '../visitProperties'
import { AttachmentEditor } from './AttachmentEditor'

export type TimeKind = 'ALWAYS'|'LIMITED'|'FIXED'

export type ScheduleDefinitionDraft = {
  placeId?:string
  title:string
  detail:string
  notes:string
  planningKind:PlanningKind
  visitIcon:VisitPropertyIcon
  expectedCostAmount:string
  expectedCostCurrency:string
  checklistText:string
  attachments:ScheduleAttachment[]
  timeKind:TimeKind
  dateStart:string
  dateEnd:string
  availabilityEnabled:boolean
  availStart:string
  availEnd:string
  fixedDate:string
  fixedTime:string
}

const minuteText=(minute?:number)=>minute===undefined?'':`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`
const timeOfMinute=(minute:number)=>minuteText(((Math.round(minute)%1440)+1440)%1440)

export function timeKindFromConstraints(constraints?:PlacementConstraints):TimeKind{
  if(constraints?.fixedStart!==undefined)return 'FIXED'
  if(constraints?.dateRange)return 'LIMITED'
  return 'ALWAYS'
}

export function draftFromSchedule(definition:ScheduleDefinition):ScheduleDefinitionDraft{
  const constraints=definition.constraints
  const fixed=constraints?.fixedStart
  return {
    placeId:definition.placeId,
    title:definition.title??'',
    detail:definition.detail??'',
    notes:definition.notes??'',
    planningKind:definition.planningKind??'VISIT',
    visitIcon:definition.visitIcon??'PLACE',
    expectedCostAmount:definition.expectedCost?String(definition.expectedCost.amount):'',
    expectedCostCurrency:definition.expectedCost?.currency??'KRW',
    checklistText:(definition.checklist??[]).join('\n'),
    attachments:structuredClone(definition.attachments??[]),
    timeKind:timeKindFromConstraints(constraints),
    dateStart:constraints?.dateRange?.startDate??TIMELINE_EPOCH_DATE,
    dateEnd:constraints?.dateRange?.endDate??TIMELINE_EPOCH_DATE,
    availabilityEnabled:!!constraints?.dailyAvailability,
    availStart:minuteText(constraints?.dailyAvailability?.startMinute),
    availEnd:minuteText(constraints?.dailyAvailability?.endMinute),
    fixedDate:fixed===undefined?TIMELINE_EPOCH_DATE:timelineDateFromMinute(fixed),
    fixedTime:fixed===undefined?'':timeOfMinute(fixed),
  }
}

export function buildScheduleDefinition(draft:ScheduleDefinitionDraft,options?:{hasPhysicalPlace?:boolean}):{definition?:ScheduleDefinition;error?:string}{
  const title=draft.title.trim()||undefined
  const detail=draft.detail.trim()||undefined
  const notes=draft.notes.trim()||undefined
  const hasPhysicalPlace=options?.hasPhysicalPlace??!!draft.placeId
  if(draft.planningKind==='NEARBY'&&!hasPhysicalPlace)return {error:ui.schedule.nearbyNeedsPlace}
  if(!hasPhysicalPlace&&!title)return {error:ui.schedule.titleRequiredWithoutPlace}

  let expectedCost:ScheduleDefinition['expectedCost']
  if(draft.expectedCostAmount.trim()){
    const amount=Number(draft.expectedCostAmount.replaceAll(',',''))
    if(!Number.isFinite(amount)||amount<0)return {error:ui.schedule.costInvalid}
    const currency=draft.expectedCostCurrency.trim().toUpperCase()
    if(!/^[A-Z]{3}$/.test(currency))return {error:ui.schedule.currencyInvalid}
    expectedCost={amount:Math.round(amount*100)/100,currency}
  }
  const checklist=[...new Set(draft.checklistText.split(/\r?\n|,/).map(item=>item.trim()).filter(Boolean))].slice(0,40)

  const constraints:PlacementConstraints={}
  if(draft.timeKind==='LIMITED'){
    if(!isValidDateText(draft.dateStart)||!isValidDateText(draft.dateEnd)||draft.dateEnd<draft.dateStart)return {error:ui.schedule.dateRangeInvalid}
    constraints.dateRange={startDate:draft.dateStart,endDate:draft.dateEnd}
  }
  if(draft.timeKind==='FIXED'){
    if(!isValidDateText(draft.fixedDate)||parseTimeText(draft.fixedTime)===null)return {error:ui.schedule.fixedDateTimeInvalid}
    constraints.fixedStart=timelineMinuteFromDateTime(draft.fixedDate,draft.fixedTime)
  }else if(draft.availabilityEnabled){
    const start=parseTimeText(draft.availStart),end=parseTimeText(draft.availEnd)
    if(start===null||end===null||end<=start)return {error:ui.schedule.availabilityInvalid}
    constraints.dailyAvailability={startMinute:start,endMinute:end}
  }

  return {definition:{
    placeId:draft.placeId,
    title,
    detail,
    notes,
    planningKind:draft.planningKind,
    ...(draft.visitIcon!=='PLACE'?{visitIcon:draft.visitIcon}:{}),
    ...(expectedCost?{expectedCost}:{}),
    ...(checklist.length?{checklist}:{}),
    ...(draft.attachments.length?{attachments:structuredClone(draft.attachments)}:{}),
    constraints:Object.keys(constraints).length?constraints:undefined,
  }}
}

export function ScheduleEditorFields({tripId,places,draft,onChange,showPlace=true,showPlanningKind=true,showTimeConditions=true,hasPhysicalPlace}:{tripId:string;places:TripPlace[];draft:ScheduleDefinitionDraft;onChange:(next:ScheduleDefinitionDraft)=>void;showPlace?:boolean;showPlanningKind?:boolean;showTimeConditions?:boolean;hasPhysicalPlace?:boolean}){
  const set=<K extends keyof ScheduleDefinitionDraft>(key:K,value:ScheduleDefinitionDraft[K])=>onChange({...draft,[key]:value})
  const chooseKind=(planningKind:PlanningKind)=>onChange({...draft,planningKind})
  const chooseTime=(timeKind:TimeKind)=>onChange({...draft,timeKind})
  const selectedPlace=places.find(p=>p.id===draft.placeId)
  const hasPlace=hasPhysicalPlace??!!draft.placeId
  return <>
    <section className="editor-section editor-section-basic">
      <div className="editor-section-heading"><div><strong>{ui.schedule.info}</strong><small>{ui.schedule.infoHelp}</small></div></div>
      <div className="editor-grid">
        {showPlace&&<label className="editor-field editor-field-wide"><span>{ui.common.place}</span><select value={draft.placeId??''} onChange={e=>set('placeId',e.target.value||undefined)}><option value="">{draft.planningKind==='NEARBY'?ui.schedule.selectPlaceRequired:ui.placePicker.anywhere}</option>{places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}</select><small>{draft.placeId?ui.schedule.currentPlace(selectedPlace?.name??ui.common.unknownPlace):ui.schedule.physicalOptional}</small></label>}
        <label className="editor-field editor-field-wide"><span>{ui.schedule.name}</span><input value={draft.title} onChange={e=>set('title',e.target.value)} placeholder={hasPlace?ui.schedule.titleUsePlace:ui.schedule.titleAnywhereRequired}/></label>
        <label className="editor-field editor-field-wide"><span>{ui.schedule.summary}</span><textarea value={draft.detail} onChange={e=>set('detail',e.target.value)} placeholder={ui.schedule.summaryPlaceholder} rows={2}/><small>{ui.schedule.summaryHelp}</small></label>
        <label className="editor-field editor-field-wide"><span>{ui.schedule.detailedNotes}</span><textarea value={draft.notes} onChange={e=>set('notes',e.target.value)} placeholder={ui.schedule.detailedNotesPlaceholder} rows={5}/><small>{ui.schedule.detailedNotesHelp}</small></label>
        <div className="editor-field editor-field-wide"><span>{ui.attachments.title}</span><AttachmentEditor tripId={tripId} value={draft.attachments} onChange={attachments=>set('attachments',attachments)}/></div>
      </div>
    </section>

    {showPlanningKind&&<section className="editor-section">
      <div className="editor-section-heading"><div><strong>{ui.schedule.planningKind}</strong><small>{ui.schedule.planningKindHelp}</small></div></div>
      <div className="segmented-choice segmented-choice-2"><button type="button" className={draft.planningKind==='VISIT'?'active':''} onClick={()=>chooseKind('VISIT')}>{ui.schedule.visit}</button><button type="button" className={draft.planningKind==='NEARBY'?'active':''} onClick={()=>chooseKind('NEARBY')}>{ui.schedule.nearby}</button></div>
    </section>}

    <section className="editor-section visit-properties-section">
      <div className="editor-section-heading"><div><strong>{ui.schedule.properties}</strong><small>{ui.schedule.propertiesHelp}</small></div></div>
      <div className="visit-icon-picker" role="group" aria-label={ui.schedule.visitIcon}>{VISIT_PROPERTY_ICONS.map(option=><button type="button" key={option.id} className={draft.visitIcon===option.id?'active':''} title={ui.schedule.iconLabels[option.id]} onClick={()=>set('visitIcon',option.id)}><span className="material-symbols-rounded">{option.symbol}</span><small>{ui.schedule.iconLabels[option.id]}</small></button>)}</div>
      <div className="editor-grid visit-property-grid">
        <label className="editor-field"><span>{ui.schedule.expectedCost}</span><input inputMode="decimal" value={draft.expectedCostAmount} onChange={e=>set('expectedCostAmount',e.target.value)} placeholder="0"/><small>{ui.schedule.expectedCostHelp}</small></label>
        <label className="editor-field"><span>{ui.common.currency}</span><input list="tripplanner-currencies" maxLength={3} value={draft.expectedCostCurrency} onChange={e=>set('expectedCostCurrency',e.target.value.toUpperCase())}/><datalist id="tripplanner-currencies">{COMMON_COST_CURRENCIES.map(code=><option key={code} value={code}/>)}</datalist></label>
        <label className="editor-field editor-field-wide"><span>{ui.schedule.preparations}</span><textarea rows={3} value={draft.checklistText} onChange={e=>set('checklistText',e.target.value)} placeholder={ui.schedule.preparationsHelp}/><small>{ui.schedule.preparationsHelp}</small></label>
      </div>
    </section>

    {showTimeConditions&&<section className="editor-section">
      <div className="editor-section-heading"><div><strong>{ui.schedule.timeCondition}</strong><small>{ui.schedule.timeConditionHelp}</small></div></div>
      <div className="segmented-choice segmented-choice-3"><button type="button" className={draft.timeKind==='ALWAYS'?'active':''} onClick={()=>chooseTime('ALWAYS')}>{ui.schedule.always}</button><button type="button" className={draft.timeKind==='LIMITED'?'active':''} onClick={()=>chooseTime('LIMITED')}>{ui.schedule.limited}</button><button type="button" className={draft.timeKind==='FIXED'?'active':''} onClick={()=>chooseTime('FIXED')}>{ui.schedule.fixed}</button></div>

      {draft.timeKind==='LIMITED'&&<div className="editor-grid editor-subgrid"><label className="editor-field"><span>{ui.schedule.periodStart}</span><DateTextInput value={draft.dateStart} onChange={v=>set('dateStart',v)}/></label><label className="editor-field"><span>{ui.schedule.periodEnd}</span><DateTextInput value={draft.dateEnd} onChange={v=>set('dateEnd',v)}/></label></div>}

      {draft.timeKind==='FIXED'?<div className="editor-grid editor-subgrid"><label className="editor-field"><span>{ui.schedule.fixedDate}</span><DateTextInput value={draft.fixedDate} onChange={v=>set('fixedDate',v)}/></label><label className="editor-field"><span>{ui.schedule.fixedTime}</span><TimeTextInput value={draft.fixedTime} onChange={v=>set('fixedTime',v)}/></label></div>:<div className="availability-editor">
        {!draft.availabilityEnabled?<button type="button" className="inline-add-button" onClick={()=>set('availabilityEnabled',true)}>{ui.schedule.availabilityAdd}</button>:<><div className="editor-section-heading compact"><div><strong>{ui.schedule.availability}</strong><small>{ui.schedule.availabilityHelp}</small></div><button type="button" className="text-action" onClick={()=>onChange({...draft,availabilityEnabled:false,availStart:'',availEnd:''})}>{ui.schedule.remove}</button></div><div className="editor-grid editor-subgrid"><label className="editor-field"><span>{ui.common.start}</span><TimeTextInput value={draft.availStart} onChange={v=>set('availStart',v)}/></label><label className="editor-field"><span>{ui.common.end}</span><TimeTextInput value={draft.availEnd} onChange={v=>set('availEnd',v)}/></label></div></>}
      </div>}
    </section>}
  </>
}
