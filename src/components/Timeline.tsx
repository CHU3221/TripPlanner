import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Dispatch, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, SetStateAction, WheelEvent as ReactWheelEvent } from 'react'
import {
  BOTTOM, DAY, MIN_VISIT,
  clamp, clock, createTimelineMapper, durationText, modeIcon, pairKey, shortClock, snap,
  timelineDateFromMinute, timelineDateLabel, timelineMinuteFromDateTime,
} from '../model'
import type { ConnectionPlan, MajorTransportData, Node, TimelineLabel, TimelineViewSettings, VisitData } from '../model'
import { findScheduleConflicts } from '../domain/placement'
import { constraintUnavailableRanges, findConstraintViolations } from '../domain/constraints'
import { readTimelineDropPayload, TIMELINE_DROP_MIME } from '../timelineDrop'
import type { TimelineDropPayload } from '../timelineDrop'
import type { TripPlace } from '../domain/place'
import type { RouteRuntimeResult } from '../connectionRuntime'
import { routeRequestKey, savedConnectionRouteRequest } from '../connectionRuntime'
import { routeModeIcon } from '../routeSearchUi'
import { dayColor, visualColor, type TripDayColors } from '../visual/appearance'
import { DateTextInput, TimeTextInput, isValidDateText, parseTimeText } from './DateTimeInput'
import { text as ui } from '../i18n/catalog'
import { visitIconSymbol } from '../visitProperties'

export type FreeDropState={target:'NONE'|'TIMELINE'|'BUCKET'|'PLAN_B'|'BASE'|'DELETE';visitId:string|null}
export type ExternalTimelinePreview={left:number;top:number;width:number;height:number;start:number;end:number}|null

type VisitCommit = { id: string; before: { start: number; end: number }; after: { start: number; end: number } }
type LabelMoveCommit = { id: string; before: number; after: number }
type FreeDropTarget = FreeDropState['target']
type Placement = { start:number; end:number }
type Interaction =
  | { kind: 'VISIT'; id: string; mode: 'MOVE'|'START'|'END'; pointerId: number; pointerStartX: number; pointerStartY: number; pointerStartTime:number; originalStart: number; originalEnd: number; gestureStartStart: number; gestureStartEnd: number; moved: boolean; phase:'ATTACHED'|'FREE'; returnPlacement?:Placement; previewPlacement?:Placement; activeDropTarget:FreeDropTarget }
  | { kind: 'LABEL'; id: string; pointerId: number; pointerStartY: number; pointerStartTime:number; originalAt: number; moved: boolean }
type LabelEditorState={mode:'ADD'|'EDIT';at:number;id?:string;text:string}
type ExternalDropPreview={start:number;end:number}
type TimelineMapper=ReturnType<typeof createTimelineMapper>
type AxisDraft={viewStartDate:string;viewStartTime:string;viewEndDate:string;viewEndTime:string}

const DEFAULT_NEW_VISIT_DURATION = 60
const VISIT_DRAG_THRESHOLD_PX = 4
const MAGNETIC_CAPTURE_PX = 8
const LABEL_CLEARANCE_PX = 24
// MOVE feel tuning: one rail detach threshold, then continuous free movement.
const TENSION_START_PX = 14
const DETACH_THRESHOLD_PX = 50
const MAX_TENSION_OFFSET_PX = 10
const DROP_TARGET_HYSTERESIS_PX = 6
const DRAG_SCROLL_EDGE_PX = 58
const DRAG_SCROLL_MAX_PX = 18

function compareNodes(a: Node, b: Node) { return a.start - b.start || a.end - b.end || a.key.localeCompare(b.key) }
const scheduleTitle=(visit:VisitData,places:TripPlace[])=>visit.title??places.find(p=>p.id===visit.placeId)?.name??ui.schedule.generic
const timeText=(minute:number)=>{const m=((Math.round(minute)%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}

function nodesFor(visits: VisitData[], transports:MajorTransportData[], places:TripPlace[]): Node[] {
  return [
    ...visits.map(v => ({ type:'VISIT' as const, id:v.id, key:`VISIT:${v.id}`, start:v.start, end:v.end, entryPlaceId:v.placeId, exitPlaceId:v.placeId, title:scheduleTitle(v,places) })),
    ...transports.map(v => ({ type:'TRANSPORT' as const, id:v.id, key:`TRANSPORT:${v.id}`, start:v.occupiedFrom, end:v.occupiedUntil, entryPlaceId:v.departure.placeId, exitPlaceId:v.arrival.placeId, title:v.onboard.title })),
  ].sort(compareNodes)
}

function connectionPairs(nodes: Node[]) {
  if (nodes.length < 2) return []
  const pairs: { from: Node; to: Node; key: string }[] = []
  let componentExit = nodes[0]
  let componentMaxEnd = nodes[0].end
  for (let i = 1; i < nodes.length; i += 1) {
    const node = nodes[i]
    if (node.start >= componentMaxEnd) {
      pairs.push({ from: componentExit, to: node, key: pairKey(componentExit, node) })
      componentExit = node
      componentMaxEnd = node.end
      continue
    }
    if (node.end > componentMaxEnd) { componentExit = node; componentMaxEnd = node.end }
  }
  return pairs
}

function axisDraftFrom(settings:TimelineViewSettings):AxisDraft{
  return {
    viewStartDate:timelineDateFromMinute(settings.viewStart),
    viewStartTime:timeText(settings.viewStart),
    viewEndDate:timelineDateFromMinute(settings.viewEnd),
    viewEndTime:timeText(settings.viewEnd),
  }
}

export function Timeline({ visits, setVisits, transports, places, labels, setLabels, plans, routeRuntime, dayColors, viewSettings, onViewSettingsChange, dayColorsOpen, onToggleDayColors, onConnectionClick, onVisitCommit, onVisitCreate, onVisitUnschedule, onVisitPlacementDrop, onVisitClick, onTransportClick, onTransportHover, onLabelMoveCommit, onLabelAdd, onLabelEdit, onLabelDelete, onFreeDropTargetChange, highlightedPlaceId, onPlaceHover, externalDragPayload, onExternalPreviewChange }: {
  visits: VisitData[]; setVisits: Dispatch<SetStateAction<VisitData[]>>; transports:MajorTransportData[]; places:TripPlace[]
  labels: TimelineLabel[]; setLabels: Dispatch<SetStateAction<TimelineLabel[]>>
  plans: Record<string,ConnectionPlan>; routeRuntime:Record<string,RouteRuntimeResult>; dayColors:TripDayColors; viewSettings:TimelineViewSettings; onViewSettingsChange:(settings:TimelineViewSettings)=>void; dayColorsOpen:boolean; onToggleDayColors:()=>void; onConnectionClick:(from:Node,to:Node)=>void
  onVisitCommit:(x:VisitCommit)=>void; onVisitCreate:(visit:VisitData,payload:TimelineDropPayload)=>void; onVisitUnschedule:(visit:VisitData)=>void; onVisitPlacementDrop?:(visit:VisitData,target:'BUCKET'|'PLAN_B'|'BASE'|'DELETE')=>void; onVisitClick:(visit:VisitData)=>void; onTransportClick:(transport:MajorTransportData)=>void; onTransportHover:(transportId:string|null)=>void
  onLabelMoveCommit:(x:LabelMoveCommit)=>void; onLabelAdd:(label:TimelineLabel)=>void; onLabelEdit:(x:{id:string;before:string;after:string})=>void; onLabelDelete:(label:TimelineLabel)=>void
  onFreeDropTargetChange:(state:FreeDropState)=>void; highlightedPlaceId:string|null; onPlaceHover:(placeId:string|null)=>void
  externalDragPayload?:TimelineDropPayload|null; onExternalPreviewChange:(preview:ExternalTimelinePreview)=>void
}) {
  const plannerRef=useRef<HTMLDivElement|null>(null), interactionRef=useRef<Interaction|null>(null)
  const dragPointerYRef=useRef<number|null>(null)
  const visitPlacementRef=useRef<Record<string,{start:number;end:number}>>({})
  const visitDragMetricsRef=useRef<{visit:VisitData;width:number;height:number;offsetX:number;offsetY:number}|null>(null)
  const suppressLabelClick=useRef<string|null>(null)
  const suppressVisitClick=useRef<string|null>(null)
  const [activeVisit,setActiveVisit]=useState<string|null>(null)
  const [dragGhost,setDragGhost]=useState<{visit:VisitData;x:number;y:number;width:number;height:number;offsetX:number;offsetY:number;justPopped:boolean}|null>(null)
  const [tensionOffset,setTensionOffset]=useState(0)
  const [freeDropTarget,setFreeDropTarget]=useState<FreeDropTarget>('NONE')
  const [externalPreview,setExternalPreview]=useState<ExternalDropPreview|null>(null)
  const [labelHoverAt,setLabelHoverAt]=useState<number|null>(null)
  const [labelEditor,setLabelEditor]=useState<LabelEditorState|null>(null)
  const [axisEditorOpen,setAxisEditorOpen]=useState(false)
  const [axisDraft,setAxisDraft]=useState<AxisDraft>(()=>axisDraftFrom(viewSettings))
  const [axisError,setAxisError]=useState('')

  const mapper=useMemo(()=>createTimelineMapper(viewSettings.viewStart,viewSettings.viewEnd,[]),[viewSettings])
  const {timeToY,yToTime,rangeHeight}=mapper
  const viewStart=viewSettings.viewStart,viewEnd=viewSettings.viewEnd
  const nodes=useMemo(()=>nodesFor(visits,transports,places),[visits,transports,places])
  const pairs=useMemo(()=>connectionPairs(nodes),[nodes])
  const validRouteRuntime=useMemo(()=>{
    const next:Record<string,RouteRuntimeResult>={}
    for(const pair of pairs){
      const request=savedConnectionRouteRequest(pair,places,plans[pair.key])
      const runtime=routeRuntime[pair.key]
      if(request&&runtime?.requestKey===routeRequestKey(request))next[pair.key]=runtime
    }
    return next
  },[pairs,places,plans,routeRuntime])
  const conflicts=useMemo(()=>findScheduleConflicts(visits,transports),[visits,transports])
  const constraintViolations=useMemo(()=>findConstraintViolations(visits),[visits])
  const timelineHeight=timeToY(viewEnd)+BOTTOM
  const dateBoundaries=useMemo(()=>{
    const result:number[]=[]
    const first=Math.ceil(viewStart/DAY)*DAY
    for(let x=first;x<=viewEnd;x+=DAY){
      if(x>=viewStart&&x<=viewEnd)result.push(x)
    }
    return result
  },[viewStart,viewEnd])
  const hourLines=useMemo(()=>{
    const result:number[]=[]
    for(let x=Math.ceil(viewStart/60)*60;x<=viewEnd;x+=60){
      // Midnight is rendered by DateBoundary so the axis never stacks `12 AM`
      // on top of the day-change marker.
      if(x%DAY===0)continue
      result.push(x)
    }
    return result
  },[viewStart,viewEnd,mapper])
  const activeConstraints=activeVisit?visits.find(v=>v.id===activeVisit)?.constraints:externalPreview?externalDragPayload?.constraints:undefined
  const constraintOverlayRanges=useMemo(()=>constraintUnavailableRanges(activeConstraints,viewStart,viewEnd),[activeConstraints,viewStart,viewEnd])

  useEffect(()=>{
    if(externalDragPayload)return
    setExternalPreview(null)
    onExternalPreviewChange(null)
  },[externalDragPayload,onExternalPreviewChange])

  useEffect(()=>{
    if(!activeVisit)return
    let frame=0
    const tick=()=>{
      const planner=plannerRef.current,y=dragPointerYRef.current,it=interactionRef.current
      if(planner&&y!==null&&it?.kind==='VISIT'){
        const rect=planner.getBoundingClientRect();let speed=0
        if(y<rect.top+DRAG_SCROLL_EDGE_PX)speed=-DRAG_SCROLL_MAX_PX*Math.min(1,(rect.top+DRAG_SCROLL_EDGE_PX-y)/DRAG_SCROLL_EDGE_PX)
        else if(y>rect.bottom-DRAG_SCROLL_EDGE_PX)speed=DRAG_SCROLL_MAX_PX*Math.min(1,(y-(rect.bottom-DRAG_SCROLL_EDGE_PX))/DRAG_SCROLL_EDGE_PX)
        if(speed){const before=planner.scrollTop;planner.scrollTop+=speed;if(planner.scrollTop!==before)refreshPlacementAfterScroll()}
      }
      frame=requestAnimationFrame(tick)
    }
    frame=requestAnimationFrame(tick)
    return()=>cancelAnimationFrame(frame)
  },[activeVisit,viewStart,viewEnd])

  function openAxisEditor(){setAxisDraft(axisDraftFrom(viewSettings));setAxisError('');setAxisEditorOpen(true)}
  function saveAxisSettings(){
    if(!isValidDateText(axisDraft.viewStartDate)||parseTimeText(axisDraft.viewStartTime)===null||!isValidDateText(axisDraft.viewEndDate)||parseTimeText(axisDraft.viewEndTime)===null){setAxisError(ui.timeline.rangeInvalid);return}
    const nextStart=timelineMinuteFromDateTime(axisDraft.viewStartDate,axisDraft.viewStartTime)
    const nextEnd=timelineMinuteFromDateTime(axisDraft.viewEndDate,axisDraft.viewEndTime)
    if(nextEnd-nextStart<60){setAxisError(ui.timeline.minRange);return}
    onViewSettingsChange({viewStart:nextStart,viewEnd:nextEnd})
    setAxisEditorOpen(false)
  }

  function localPointerTime(eventY:number){const p=plannerRef.current!,r=p.getBoundingClientRect();return yToTime(eventY-r.top+p.scrollTop)}
  function magneticTargets(excludeVisitId:string){const targets=[...visits.filter(v=>v.id!==excludeVisitId).flatMap(v=>[v.start,v.end]),...transports.flatMap(tr=>[tr.occupiedFrom,tr.occupiedUntil])];return [...new Set(targets)].sort((a,b)=>a-b)}
  function magneticSnap(probe:number,fallback:number,excludeVisitId:string,isValid:(time:number)=>boolean){let best:number|null=null,bestDistance=Infinity;for(const target of magneticTargets(excludeVisitId)){if(!isValid(target))continue;const distance=Math.abs(timeToY(target)-timeToY(probe));if(distance<MAGNETIC_CAPTURE_PX&&(distance<bestDistance||(distance===bestDistance&&(best===null||target<best)))){best=target;bestDistance=distance}}return best??fallback}
  function magneticMoveStart(rawStart:number,fallbackStart:number,duration:number,excludeVisitId:string){let bestStart:number|null=null,bestDistance=Infinity,bestTarget=Infinity;const rawEnd=rawStart+duration;for(const target of magneticTargets(excludeVisitId)){for(const candidate of [{start:target,distance:Math.abs(timeToY(target)-timeToY(rawStart))},{start:target-duration,distance:Math.abs(timeToY(target)-timeToY(rawEnd))}]){if(candidate.start<viewStart||candidate.start>viewEnd-duration)continue;if(candidate.distance<MAGNETIC_CAPTURE_PX&&(candidate.distance<bestDistance||(candidate.distance===bestDistance&&(target<bestTarget||(target===bestTarget&&(bestStart===null||candidate.start<bestStart)))))){bestStart=candidate.start;bestDistance=candidate.distance;bestTarget=target}}}return bestStart??fallbackStart}
  function startVisit(e:ReactPointerEvent<HTMLElement>,v:VisitData,mode:'MOVE'|'START'|'END'){if(e.button!==0)return;if(v.constraints?.fixedStart!==undefined&&mode==='START')return;e.preventDefault();e.stopPropagation();setLabelHoverAt(null);suppressVisitClick.current=null;dragPointerYRef.current=e.clientY;interactionRef.current={kind:'VISIT',id:v.id,mode,pointerId:e.pointerId,pointerStartX:e.clientX,pointerStartY:e.clientY,pointerStartTime:localPointerTime(e.clientY),originalStart:v.start,originalEnd:v.end,gestureStartStart:v.start,gestureStartEnd:v.end,moved:false,phase:'ATTACHED',activeDropTarget:'NONE'};visitPlacementRef.current[v.id]={start:v.start,end:v.end};setActiveVisit(v.id);if(mode==='MOVE'){const r=e.currentTarget.getBoundingClientRect();visitDragMetricsRef.current={visit:v,width:r.width,height:r.height,offsetX:e.clientX-r.left,offsetY:e.clientY-r.top}}e.currentTarget.setPointerCapture(e.pointerId)}
  function startLabel(e:ReactPointerEvent<HTMLElement>,label:TimelineLabel){if(e.button!==0)return;e.preventDefault();e.stopPropagation();setLabelHoverAt(null);dragPointerYRef.current=e.clientY;interactionRef.current={kind:'LABEL',id:label.id,pointerId:e.pointerId,pointerStartY:e.clientY,pointerStartTime:localPointerTime(e.clientY),originalAt:label.at,moved:false};suppressLabelClick.current=null;e.currentTarget.setPointerCapture(e.pointerId)}
  function pointInsideRect(x:number,y:number,r:DOMRect,margin=0){return x>=r.left-margin&&x<=r.right+margin&&y>=r.top-margin&&y<=r.bottom+margin}
  function freeTargetAt(x:number,y:number,current:FreeDropTarget):FreeDropTarget{
    const timeline=document.querySelector<HTMLElement>('[data-timeline-drop-zone="true"]')?.getBoundingClientRect()
    const placementTargets=(['BUCKET','PLAN_B','BASE'] as const).map(target=>({target,rect:document.querySelector<HTMLElement>(`[data-placement-drop="${target}"]`)?.getBoundingClientRect()}))
    const trash=document.querySelector<HTMLElement>('[data-trash-drop="true"]')?.getBoundingClientRect()
    if(current==='DELETE'&&trash&&pointInsideRect(x,y,trash,DROP_TARGET_HYSTERESIS_PX))return 'DELETE'
    if(current==='TIMELINE'&&timeline&&pointInsideRect(x,y,timeline,DROP_TARGET_HYSTERESIS_PX))return 'TIMELINE'
    const currentPlacement=placementTargets.find(item=>item.target===current)
    if(currentPlacement?.rect&&pointInsideRect(x,y,currentPlacement.rect,DROP_TARGET_HYSTERESIS_PX))return currentPlacement.target
    if(trash&&pointInsideRect(x,y,trash))return 'DELETE'
    for(const item of placementTargets)if(item.rect&&pointInsideRect(x,y,item.rect))return item.target
    if(timeline&&pointInsideRect(x,y,timeline))return 'TIMELINE'
    return 'NONE'
  }
  function movePlacementForPointer(it:Extract<Interaction,{kind:'VISIT'}>,clientY:number){if(visits.find(v=>v.id===it.id)?.constraints?.fixedStart!==undefined)return {start:it.originalStart,end:it.originalEnd};const duration=it.originalEnd-it.originalStart;const rawDelta=localPointerTime(clientY)-it.pointerStartTime;const delta=snap(rawDelta);const gridStart=clamp(it.originalStart+delta,viewStart,viewEnd-duration);const rawStart=clamp(it.originalStart+rawDelta,viewStart,viewEnd-duration);const start=magneticMoveStart(rawStart,gridStart,duration,it.id);return {start,end:start+duration}}
  function updateLabelHover(e:ReactPointerEvent<HTMLDivElement>){
    if(labelEditor||externalDragPayload){setLabelHoverAt(null);return}
    const r=e.currentTarget.getBoundingClientRect(),style=getComputedStyle(e.currentTarget)
    const axis=parseFloat(style.getPropertyValue('--axis-width'))||64
    const x=e.clientX-r.left
    if(x<axis-5||x>axis+38){setLabelHoverAt(null);return}
    const at=clamp(snap(localPointerTime(e.clientY)),viewStart,viewEnd)
    if(labels.some(label=>Math.abs(timeToY(label.at)-timeToY(at))<LABEL_CLEARANCE_PX)){setLabelHoverAt(null);return}
    setLabelHoverAt(at)
  }
  function pointerMove(e:ReactPointerEvent<HTMLDivElement>){const it=interactionRef.current;if(!plannerRef.current)return;if(!it){updateLabelHover(e);return}
    dragPointerYRef.current=e.clientY
    const rawDelta=localPointerTime(e.clientY)-it.pointerStartTime;const delta=snap(rawDelta)
    if(it.kind==='LABEL'){if(Math.abs(e.clientY-it.pointerStartY)>VISIT_DRAG_THRESHOLD_PX)it.moved=true;setLabels(cur=>cur.map(x=>x.id===it.id?{...x,at:clamp(snap(it.originalAt+rawDelta),viewStart,viewEnd)}:x));return}
    if(Math.hypot(e.clientX-it.pointerStartX,e.clientY-it.pointerStartY)>VISIT_DRAG_THRESHOLD_PX)it.moved=true
    if(it.mode==='MOVE'){
      if(it.phase==='ATTACHED'){
        const lateral=e.clientX-it.pointerStartX,pull=Math.abs(lateral),tensionRange=Math.max(1,DETACH_THRESHOLD_PX-TENSION_START_PX),tensionPull=Math.max(0,pull-TENSION_START_PX),tensionProgress=Math.min(1,tensionPull/tensionRange),tensionEaseMax=1-Math.exp(-tensionRange/24),tensionEase=tensionProgress===0?0:(1-Math.exp(-tensionPull/24))/tensionEaseMax,visual=Math.sign(lateral)*MAX_TENSION_OFFSET_PX*Math.min(1,tensionEase)
        setTensionOffset(visual);const placement=movePlacementForPointer(it,e.clientY);visitPlacementRef.current[it.id]=placement;setVisits(cur=>cur.map(v=>v.id===it.id?{...v,...placement}:v))
        if(pull>=DETACH_THRESHOLD_PX){it.phase='FREE';it.returnPlacement={...placement};it.previewPlacement=undefined;it.activeDropTarget='NONE';setTensionOffset(0);setFreeDropTarget('NONE');onFreeDropTargetChange({target:'NONE',visitId:it.id});const m=visitDragMetricsRef.current;if(m)setDragGhost({visit:{...m.visit,...placement},x:e.clientX-m.offsetX,y:e.clientY-m.offsetY,width:m.width,height:m.height,offsetX:m.offsetX,offsetY:m.offsetY,justPopped:true})}
        return
      }
      const target=freeTargetAt(e.clientX,e.clientY,it.activeDropTarget)
      if(target!==it.activeDropTarget){it.activeDropTarget=target;setFreeDropTarget(target);onFreeDropTargetChange({target,visitId:it.id})}
      const m=visitDragMetricsRef.current
      if(m){const geometry={x:e.clientX-m.offsetX,y:e.clientY-m.offsetY,width:m.width,height:m.height};setDragGhost(g=>({visit:g?.visit??m.visit,...geometry,offsetX:m.offsetX,offsetY:m.offsetY,justPopped:false}))}
      let placement=it.returnPlacement??{start:it.originalStart,end:it.originalEnd}
      if(target==='TIMELINE'){placement=movePlacementForPointer(it,e.clientY);it.previewPlacement=placement}else it.previewPlacement=undefined
      visitPlacementRef.current[it.id]=placement;setVisits(cur=>cur.map(v=>v.id===it.id?{...v,...placement}:v));return
    }
    if(it.mode==='START'){const gridStart=clamp(snap(it.originalStart+delta),viewStart,it.originalEnd-MIN_VISIT),rawStart=clamp(it.originalStart+rawDelta,viewStart,it.originalEnd-MIN_VISIT),start=magneticSnap(rawStart,gridStart,it.id,t=>t>=viewStart&&t<=it.originalEnd-MIN_VISIT);visitPlacementRef.current[it.id]={start,end:it.originalEnd};setVisits(cur=>cur.map(v=>v.id===it.id?{...v,start}:v));return}
    const gridEnd=clamp(snap(it.originalEnd+delta),it.originalStart+MIN_VISIT,viewEnd),rawEnd=clamp(it.originalEnd+rawDelta,it.originalStart+MIN_VISIT,viewEnd),end=magneticSnap(rawEnd,gridEnd,it.id,t=>t>=it.originalStart+MIN_VISIT&&t<=viewEnd);visitPlacementRef.current[it.id]={start:it.originalStart,end};setVisits(cur=>cur.map(v=>v.id===it.id?{...v,end}:v))
  }
  function refreshPlacementAfterScroll(){
    const it=interactionRef.current,pointerY=dragPointerYRef.current
    if(!it||it.kind!=='VISIT'||pointerY===null)return
    if(it.mode==='MOVE'){
      if(it.phase==='FREE'&&it.activeDropTarget!=='TIMELINE')return
      const placement=movePlacementForPointer(it,pointerY);visitPlacementRef.current[it.id]=placement;setVisits(cur=>cur.map(v=>v.id===it.id?{...v,...placement}:v));return
    }
    const rawDelta=localPointerTime(pointerY)-it.pointerStartTime,delta=snap(rawDelta)
    if(it.mode==='START'){const gridStart=clamp(snap(it.originalStart+delta),viewStart,it.originalEnd-MIN_VISIT),rawStart=clamp(it.originalStart+rawDelta,viewStart,it.originalEnd-MIN_VISIT),start=magneticSnap(rawStart,gridStart,it.id,t=>t>=viewStart&&t<=it.originalEnd-MIN_VISIT);visitPlacementRef.current[it.id]={start,end:it.originalEnd};setVisits(cur=>cur.map(v=>v.id===it.id?{...v,start}:v));return}
    const gridEnd=clamp(snap(it.originalEnd+delta),it.originalStart+MIN_VISIT,viewEnd),rawEnd=clamp(it.originalEnd+rawDelta,it.originalStart+MIN_VISIT,viewEnd),end=magneticSnap(rawEnd,gridEnd,it.id,t=>t>=it.originalStart+MIN_VISIT&&t<=viewEnd);visitPlacementRef.current[it.id]={start:it.originalStart,end};setVisits(cur=>cur.map(v=>v.id===it.id?{...v,end}:v))
  }
  function dragWheel(e:ReactWheelEvent<HTMLDivElement>){if(!interactionRef.current||!plannerRef.current)return;e.preventDefault();plannerRef.current.scrollTop+=e.deltaY;refreshPlacementAfterScroll()}
  function finishVisitInteraction(it:Extract<Interaction,{kind:'VISIT'}>,cancelled:boolean){const current=visits.find(v=>v.id===it.id);if(cancelled){setVisits(xs=>xs.map(v=>v.id===it.id?{...v,start:it.gestureStartStart,end:it.gestureStartEnd}:v))}else if(current&&it.mode==='MOVE'&&it.phase==='FREE'&&it.activeDropTarget!=='NONE'&&it.activeDropTarget!=='TIMELINE'){const original={...current,start:it.gestureStartStart,end:it.gestureStartEnd};if(it.activeDropTarget==='BUCKET'&&!onVisitPlacementDrop)onVisitUnschedule(original);else onVisitPlacementDrop?.(original,it.activeDropTarget);suppressVisitClick.current=it.id}else{const latest=visitPlacementRef.current[it.id],finalVisit=current&&latest?{...current,...latest}:current;if(finalVisit&&(finalVisit.start!==it.gestureStartStart||finalVisit.end!==it.gestureStartEnd))onVisitCommit({id:it.id,before:{start:it.gestureStartStart,end:it.gestureStartEnd},after:{start:finalVisit.start,end:finalVisit.end}});if(it.moved)suppressVisitClick.current=it.id}delete visitPlacementRef.current[it.id];setDragGhost(null);setTensionOffset(0);setFreeDropTarget('NONE');onFreeDropTargetChange({target:'NONE',visitId:null});visitDragMetricsRef.current=null;dragPointerYRef.current=null}
  function endInteraction(){const it=interactionRef.current;if(!it)return;if(it.kind==='VISIT')finishVisitInteraction(it,false);else{const current=labels.find(x=>x.id===it.id);if(it.moved){suppressLabelClick.current=it.id;if(current&&current.at!==it.originalAt)onLabelMoveCommit({id:it.id,before:it.originalAt,after:current.at})}}interactionRef.current=null;setActiveVisit(null)}
  function cancelInteraction(){const it=interactionRef.current;if(!it)return;if(it.kind==='VISIT')finishVisitInteraction(it,true);else setLabels(xs=>xs.map(x=>x.id===it.id?{...x,at:it.originalAt}:x));interactionRef.current=null;setActiveVisit(null)}
  function visitClick(visit:VisitData){if(suppressVisitClick.current===visit.id){suppressVisitClick.current=null;return}onVisitClick(visit)}
  function labelClick(label:TimelineLabel){if(suppressLabelClick.current===label.id){suppressLabelClick.current=null;return}setLabelHoverAt(null);setLabelEditor({mode:'EDIT',id:label.id,at:label.at,text:label.text})}
  function saveLabelEditor(){if(!labelEditor)return;const text=labelEditor.text.trim();if(!text)return;if(labelEditor.mode==='ADD'){onLabelAdd({id:crypto.randomUUID(),at:labelEditor.at,text})}else{const current=labels.find(x=>x.id===labelEditor.id);if(current&&current.text!==text)onLabelEdit({id:current.id,before:current.text,after:text})}setLabelEditor(null)}
  function deleteInlineLabel(){if(labelEditor?.mode!=='EDIT')return;const current=labels.find(x=>x.id===labelEditor.id);if(current)onLabelDelete(current);setLabelEditor(null)}

  function externalPreviewGeometry(root:HTMLDivElement,start:number,end:number):ExternalTimelinePreview{
    const r=root.getBoundingClientRect(),style=getComputedStyle(root),axis=parseFloat(style.getPropertyValue('--axis-width'))||64,leftInset=parseFloat(style.getPropertyValue('--visit-left-inset'))||31,rightInset=parseFloat(style.getPropertyValue('--visit-right'))||46
    return {left:r.left+axis+leftInset,top:r.top+timeToY(start),width:Math.max(80,r.width-axis-leftInset-rightInset),height:Math.max(rangeHeight(start,end),MIN_VISIT),start,end}
  }
  function externalDragOver(e:ReactDragEvent<HTMLDivElement>){if(!e.dataTransfer.types.includes(TIMELINE_DROP_MIME))return;e.preventDefault();e.dataTransfer.dropEffect=e.dataTransfer.effectAllowed==='copy'?'copy':'move';if(!plannerRef.current)return;const payload=externalDragPayload;const duration=Math.max(MIN_VISIT,payload?.duration??DEFAULT_NEW_VISIT_DURATION);const pointerStart=clamp(snap(localPointerTime(e.clientY)),viewStart,viewEnd-duration);const start=payload?.constraints?.fixedStart??pointerStart,end=start+duration;setExternalPreview({start,end});onExternalPreviewChange(externalPreviewGeometry(e.currentTarget,start,end))}
  function externalDragLeave(e:ReactDragEvent<HTMLDivElement>){const related=e.relatedTarget as globalThis.Node|null;if(related&&e.currentTarget.contains(related))return;setExternalPreview(null);onExternalPreviewChange(null)}
  function externalDrop(e:ReactDragEvent<HTMLDivElement>){const payload=readTimelineDropPayload(e.dataTransfer)??externalDragPayload;if(!payload||payload.kind!=='PLACE'||!plannerRef.current)return;e.preventDefault();const duration=Math.max(MIN_VISIT,payload.duration??DEFAULT_NEW_VISIT_DURATION);const start=payload.constraints?.fixedStart??clamp(snap(localPointerTime(e.clientY)),viewStart,viewEnd-duration);const candidate:VisitData={id:payload.visitId??crypto.randomUUID(),placeId:payload.placeId,start,end:start+duration,title:payload.title,detail:payload.detail,notes:payload.notes,planningKind:payload.planningKind,visitIcon:payload.visitIcon,expectedCost:payload.expectedCost,checklist:payload.checklist,attachments:payload.attachments,constraints:payload.constraints};setExternalPreview(null);onExternalPreviewChange(null);onVisitCreate(candidate,payload)}

  return <div className="timeline-viewport">
    <div className="timeline-axis-toolbar"><button type="button" onClick={openAxisEditor} title={ui.timeline.settings}><span className="material-symbols-rounded">tune</span>{ui.timeline.axisButton}</button><button className="day-palette-toggle" type="button" aria-expanded={dayColorsOpen} onClick={onToggleDayColors}><span className="material-symbols-rounded">palette</span>{ui.timeline.dayColors}</button></div>
    {axisEditorOpen&&<AxisSettingsPopover draft={axisDraft} setDraft={setAxisDraft} error={axisError} onCancel={()=>setAxisEditorOpen(false)} onSave={saveAxisSettings}/>} 
    <section ref={plannerRef} className="planner"><div className="timeline" data-timeline-drop-zone="true" style={{height:timelineHeight}} onDragOver={externalDragOver} onDragLeave={externalDragLeave} onDrop={externalDrop} onPointerMove={pointerMove} onWheel={dragWheel} onPointerLeave={()=>{if(!interactionRef.current)setLabelHoverAt(null)}} onPointerUp={endInteraction} onPointerCancel={cancelInteraction} onLostPointerCapture={cancelInteraction}>
      <div className="canvas-layer"><div className="timeline-canvas"/>{Array.from({length:Math.ceil(viewEnd/1440)-Math.floor(viewStart/1440)},(_,i)=>Math.floor(viewStart/1440)+i).map(day=>{const start=Math.max(viewStart,day*1440),end=Math.min(viewEnd,(day+1)*1440);return <div key={day} className="day-color-band" style={{top:timeToY(start),height:Math.max(0,rangeHeight(start,end)),backgroundColor:dayColor(day*1440,dayColors)}}/>})}</div><div className="grid-layer">{hourLines.map(x=><HourLine key={x} time={x} map={mapper}/>)}<DateBoundaries times={dateBoundaries} map={mapper} dayColors={dayColors}/></div>
      {constraintOverlayRanges.length>0&&<div className="constraint-layer">{constraintOverlayRanges.map((range,index)=><ConstraintOverlay key={`${range.start}-${range.end}-${index}`} start={range.start} end={range.end} map={mapper}/>)}</div>}
      <div className="memo-layer">
        {labels.map(x=><TimelineLabelView key={x.id} label={x} map={mapper} onStart={startLabel} onClick={()=>labelClick(x)}/>) }
        {labelHoverAt!==null&&!labelEditor&&<button type="button" className="label-add-affordance" style={{top:timeToY(labelHoverAt)}} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setLabelEditor({mode:'ADD',at:labelHoverAt,text:''});setLabelHoverAt(null)}} aria-label={ui.timeline.addLabelHere}><span className="material-symbols-rounded">add</span></button>}
        {labelEditor&&<div className="label-inline-editor" style={{top:timeToY(labelEditor.at)}} onPointerDown={e=>e.stopPropagation()}><input autoFocus value={labelEditor.text} onChange={e=>setLabelEditor({...labelEditor,text:e.target.value})} onKeyDown={e=>{if(e.key==='Enter')saveLabelEditor();if(e.key==='Escape')setLabelEditor(null)}} placeholder={ui.timeline.labelInput}/>{labelEditor.mode==='EDIT'&&<button type="button" className="label-inline-delete" onClick={deleteInlineLabel} title={ui.timeline.deleteLabel}><span className="material-symbols-rounded">delete</span></button>}<button type="button" className="label-inline-save" disabled={!labelEditor.text.trim()} onClick={saveLabelEditor}><span className="material-symbols-rounded">check</span></button></div>}
      </div>
      <div className="connection-layer">{pairs.map(p=><Connection key={p.key} from={p.from} to={p.to} plan={plans[p.key]} runtime={validRouteRuntime[p.key]} map={mapper} dayColors={dayColors} onEdit={()=>onConnectionClick(p.from,p.to)}/>)}</div>
      <div className="event-layer">{externalPreview&&<div className="external-drop-slot" style={{top:timeToY(externalPreview.start),height:Math.max(rangeHeight(externalPreview.start,externalPreview.end),MIN_VISIT)}}/>}{visits.map(v=><Visit key={v.id} visit={v} title={scheduleTitle(v,places)} map={mapper} dayColors={dayColors} active={activeVisit===v.id} free={activeVisit===v.id&&interactionRef.current?.kind==='VISIT'&&interactionRef.current.phase==='FREE'} tensionOffset={activeVisit===v.id?tensionOffset:0} onStart={startVisit} onClick={()=>visitClick(v)} highlighted={highlightedPlaceId===v.placeId} onPlaceHover={onPlaceHover}/>)}{transports.map(x=><MajorTransport key={x.id} transport={x} map={mapper} dayColors={dayColors} onClick={()=>onTransportClick(x)} onHover={onTransportHover}/>)}</div>
      <div className="warning-layer">{conflicts.map((conflict,index)=><ConflictWarning key={`${conflict.kind}-${conflict.start}-${conflict.end}-${index}`} conflict={conflict} map={mapper}/>)}{constraintViolations.map((violation,index)=><ConstraintViolationWarning key={`${violation.visitId}-${violation.start}-${violation.end}-${index}`} start={violation.start} end={violation.end} map={mapper}/>)}</div>
    </div></section>{dragGhost&&<div className={`visit-drag-ghost ${dragGhost.justPopped?'just-popped':''} target-${freeDropTarget.toLowerCase()}`} style={{left:dragGhost.x,top:dragGhost.y,width:dragGhost.width,height:dragGhost.height} as CSSProperties}><strong>{scheduleTitle(dragGhost.visit,places)}</strong>{dragGhost.visit.detail&&<small>{dragGhost.visit.detail}</small>}</div>}</div>
}

function AxisSettingsPopover({draft,setDraft,error,onCancel,onSave}:{draft:AxisDraft;setDraft:Dispatch<SetStateAction<AxisDraft>>;error:string;onCancel:()=>void;onSave:()=>void}){
  const set=<K extends keyof AxisDraft>(key:K,value:AxisDraft[K])=>setDraft(current=>({...current,[key]:value}))
  return <div className="timeline-axis-popover" onPointerDown={e=>e.stopPropagation()}>
    <header><div><strong>{ui.timeline.axisTitle}</strong><small>{ui.timeline.axisHelp}</small></div><button type="button" onClick={onCancel}><span className="material-symbols-rounded">close</span></button></header>
    <section><strong>{ui.timeline.displayRange}</strong><div className="timeline-axis-grid"><label><span>{ui.common.start}</span><DateTextInput value={draft.viewStartDate} onChange={v=>set('viewStartDate',v)}/><TimeTextInput value={draft.viewStartTime} onChange={v=>set('viewStartTime',v)}/></label><label><span>{ui.common.end}</span><DateTextInput value={draft.viewEndDate} onChange={v=>set('viewEndDate',v)}/><TimeTextInput value={draft.viewEndTime} onChange={v=>set('viewEndTime',v)}/></label></div></section>
    {error&&<p>{error}</p>}
    <footer><button type="button" onClick={onCancel}>{ui.common.cancel}</button><button type="button" className="primary" onClick={onSave}>{ui.common.apply}</button></footer>
  </div>
}

function HourLine({time,map}:{time:number;map:TimelineMapper}){const h=Math.floor(time/60)%24,label=h===0?'12 AM':h<12?`${h} AM`:h===12?'12 PM':`${h-12} PM`;return <div className="hour-line" style={{top:map.timeToY(time)}}><span>{label}</span><div/></div>}
function TimelineLabelView({label,map,onStart,onClick}:{label:TimelineLabel;map:TimelineMapper;onStart:(e:ReactPointerEvent<HTMLElement>,x:TimelineLabel)=>void;onClick:()=>void}){return <button type="button" className="region-memo" style={{top:map.timeToY(label.at)} as CSSProperties} onPointerDown={e=>onStart(e,label)} onClick={onClick}><strong>{label.text}</strong></button>}
function Visit({visit,title,map,dayColors,active,free,tensionOffset,onStart,onClick,highlighted,onPlaceHover}:{visit:VisitData;title:string;map:TimelineMapper;dayColors:TripDayColors;active:boolean;free:boolean;tensionOffset:number;onStart:(e:ReactPointerEvent<HTMLElement>,v:VisitData,m:'MOVE'|'START'|'END')=>void;onClick:()=>void;highlighted:boolean;onPlaceHover:(placeId:string|null)=>void}){const h=map.rangeHeight(visit.start,visit.end),compact=h<30,condensed=h>=30&&h<58,duration=durationText(visit.end-visit.start),icon=visitIconSymbol(visit.visitIcon);return <article className={['visit',compact&&'compact',condensed&&'condensed',active&&'dragging',free&&'free-placeholder',highlighted&&'map-related'].filter(Boolean).join(' ')} style={{top:map.timeToY(visit.start),height:h,'--day-accent':visualColor(visit.visualColor,visit.start,dayColors),transform:active&&!free?`translateX(${tensionOffset}px)`:undefined} as CSSProperties} onMouseEnter={()=>onPlaceHover(visit.placeId??null)} onMouseLeave={()=>onPlaceHover(null)} onPointerDown={e=>onStart(e,visit,'MOVE')} onClick={onClick}><div className="resize-zone top" onPointerDown={e=>onStart(e,visit,'START')}/>{compact?<div className="visit-compact-content"><span className="material-symbols-rounded visit-property-accent">{icon}</span><strong>{title}</strong></div>:condensed?<div className="visit-condensed-content"><span>{shortClock(visit.start)}</span><span className="material-symbols-rounded visit-property-accent">{icon}</span><strong>{title}</strong><em>{duration}</em></div>:<div className="visit-content"><div className="visit-time-row"><span className="visit-time">{clock(visit.start)} — {clock(visit.end)}</span><span className="visit-duration">{duration}</span></div><div className="visit-title-row"><span className="material-symbols-rounded visit-property-accent">{icon}</span><strong>{title}</strong></div>{visit.detail&&<small>{visit.detail}</small>}</div>}<div className="resize-zone bottom" onPointerDown={e=>onStart(e,visit,'END')}/></article>}
function Connection({from,to,plan,runtime,map,dayColors,onEdit}:{from:Node;to:Node;plan?:ConnectionPlan;runtime?:RouteRuntimeResult;map:TimelineMapper;dayColors:TripDayColors;onEdit:()=>void}){
  const start=from.end,end=to.start
  if(end<=start)return null
  const available=end-start
  const auto=plan?.source==='ROUTE_API'
  const runtimeMinutes=auto?runtime?.route.durationMinutes:undefined
  const segments=auto?[]:plan?.segments??[]
  const manualExpected=!auto&&Number.isFinite(plan?.user?.expectedDurationMinutes)?plan?.user?.expectedDurationMinutes:undefined
  const total=runtimeMinutes??manualExpected??segments.reduce((sum,segment)=>sum+segment.minutes,0)
  const hasTravel=runtimeMinutes!==undefined||manualExpected!==undefined||segments.length>0
  const slack=hasTravel?available-total:undefined
  const slackLabel=slack===undefined?null:slack<0?ui.timeline.shortage(durationText(Math.abs(slack))):slack===0?ui.timeline.noSlack:ui.timeline.slack(durationText(slack))
  const shortage=slack!==undefined&&slack<0
  const weight=segments.reduce((sum,segment)=>sum+(segment.memo?.length??0)+String(segment.minutes).length+4,0)
  const summary=segments.length>=3||weight>28
  const name=plan?.user?.name
  return <div className="route-connection connection-overlay" style={{top:map.timeToY(start),height:Math.max(map.rangeHeight(start,end),1),'--day-accent':visualColor(plan?.visualColor,from.end,dayColors)} as CSSProperties}><span className="connection-rail"/><button className="connection-pill" data-shortage={shortage||undefined} type="button" onPointerDown={e=>e.stopPropagation()} onClick={onEdit}>{name&&<strong className="connection-user-name">{name}</strong>}{auto?runtimeMinutes!==undefined?<><span className="segment-chip"><span className="material-symbols-rounded">{routeModeIcon(plan?.routeIntent?.mode ?? runtime?.route.mode ?? 'CAR')}</span><span>{runtimeMinutes}{ui.common.minutes}</span></span>{slackLabel&&<span className={shortage?'connection-shortage':'connection-free'}>{slackLabel}</span>}</>:<><span>{ui.timeline.autoRouteUnmeasured}</span><span className="connection-free">{ui.timeline.untilNext(durationText(available))}</span></>:manualExpected!==undefined?<><span className="connection-summary-part">{ui.connection.expectedDuration} {durationText(manualExpected)}</span>{segments.length>0&&<span className="connection-mode-icons">{segments.map(segment=><span className="material-symbols-rounded" key={segment.id}>{modeIcon(segment.mode)}</span>)}</span>}{slackLabel&&<span className={shortage?'connection-shortage':'connection-free'}>{slackLabel}</span>}</>:segments.length===0?<span>{ui.timeline.untilNext(durationText(available))}</span>:summary?<><span className="connection-mode-icons">{segments.map(segment=><span className="material-symbols-rounded" key={segment.id}>{modeIcon(segment.mode)}</span>)}</span><span className="connection-summary-part">{ui.timeline.total(durationText(total))}</span>{slackLabel&&<span className={shortage?'connection-shortage':'connection-free'}>{slackLabel}</span>}</>:<>{segments.map((segment,index)=><span className="segment-flow" key={segment.id}><span className="segment-chip"><span className="material-symbols-rounded">{modeIcon(segment.mode)}</span>{segment.memo&&<em>{segment.memo}</em>}<span>{segment.minutes}{ui.common.minutes}</span></span>{index<segments.length-1&&<span className="material-symbols-rounded segment-arrow">keyboard_arrow_right</span>}</span>)}{slackLabel&&<span className={shortage?'connection-shortage':'connection-free'}>{slackLabel}</span>}</>}</button></div>
}
function ConflictWarning({conflict,map}:{conflict:ReturnType<typeof findScheduleConflicts>[number];map:TimelineMapper}){const transport=conflict.kind==='MAJOR_TRANSPORT_OVERLAP';return <div className={`overlap-warning ${transport?'transport-conflict':'visit-conflict'}`} style={{top:map.timeToY(conflict.start),height:Math.max(map.rangeHeight(conflict.start,conflict.end),22)}}><span className="material-symbols-rounded">warning</span><span>{transport?ui.timeline.fixedConflict:ui.timeline.overlap}</span></div>}
function ConstraintViolationWarning({start,end,map}:{start:number;end:number;map:TimelineMapper}){return <div className="overlap-warning constraint-conflict" style={{top:map.timeToY(start),height:Math.max(map.rangeHeight(start,end),22)}}><span className="material-symbols-rounded">schedule</span><span>{ui.timeline.outsideAvailability}</span></div>}
function ConstraintOverlay({start,end,map}:{start:number;end:number;map:TimelineMapper}){const height=Math.max(map.rangeHeight(start,end),1);return <div className="constraint-unavailable" style={{top:map.timeToY(start),height}}>{height>=34&&<span>{ui.timeline.placementWarning}</span>}</div>}
function MajorTransport({transport,map,dayColors,onClick,onHover}:{transport:MajorTransportData;map:TimelineMapper;dayColors:TripDayColors;onClick:()=>void;onHover:(transportId:string|null)=>void}){const visualHeight=Math.max(map.rangeHeight(transport.occupiedFrom,transport.occupiedUntil),1),compact=visualHeight<120,micro=visualHeight<36;return <article onMouseEnter={()=>onHover(transport.id)} onMouseLeave={()=>onHover(null)} className={`major-transport ${compact?'transport-compact':''} ${micro?'transport-micro':''}`} onClick={onClick} style={{top:map.timeToY(transport.occupiedFrom),height:visualHeight,'--day-accent':visualColor(transport.visualColor,transport.occupiedFrom,dayColors)} as CSSProperties}>{compact?<div className="transport-compact-content"><span className="material-symbols-rounded transport-icon">{transport.onboard.icon}</span><strong>{transport.onboard.title}</strong><span className="transport-compact-time">{clock(transport.departure.departureAt)} → {clock(transport.arrival.arrivalAt)}</span></div>:<><div className="transport-zone departure-zone"><strong>{transport.departure.place}</strong><small>{transport.departure.detail}</small></div><div className="transport-zone onboard-zone"><span className="transport-operation-time">{ui.timeline.departureAt(clock(transport.departure.departureAt))}</span><span className="material-symbols-rounded transport-icon">{transport.onboard.icon}</span><strong>{transport.onboard.title}</strong><span className="transport-route">{transport.onboard.route}</span><span className="transport-operation-time arrival">{ui.timeline.arrivalAt(clock(transport.arrival.arrivalAt))}</span></div><div className="transport-zone arrival-zone"><strong>{transport.arrival.place}</strong><small>{transport.arrival.detail}</small></div></>}</article>}
function DateBoundaries({times,map,dayColors}:{times:number[];map:TimelineMapper;dayColors:TripDayColors}){return <>{times.map(time=>{const label=timelineDateLabel(time);return <div className="date-boundary" key={time} style={{top:map.timeToY(time),'--day-accent':dayColor(time,dayColors)} as CSSProperties}><div className="date-marker"><strong>{label.date}</strong><span>{label.weekday.toUpperCase()}</span></div><div className="date-boundary-rule"/></div>})}</>}
