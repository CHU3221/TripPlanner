import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent as ReactDragEvent, ReactNode } from 'react'
import type { BucketItem, TripBase, TripPlace } from '../domain/place'
import type { ConnectionPlan, MajorTransportData, VisitData } from '../model'
import type { TripAppearanceSettings, TripDayColors } from '../visual/appearance'
import { TripMap } from './TripMap'
import { readTimelineDropPayload, writeTimelineDropPayload } from '../timelineDrop'
import type { TimelineDropPayload } from '../timelineDrop'
import type { MapPoiSelection, MapRenderer, PlaceCandidate, RouteCandidate } from '../map/provider/contract'
import type { RouteRuntimeResult } from '../connectionRuntime'
import type { MapPathTarget } from '../map/mapConnectionPrimitives'
import type { TripMapSettings } from '../map/tripMapSettings'
import { text as ui } from '../i18n/catalog'
import { visitIconSymbol } from '../visitProperties'

export type PlacementDropTarget='BUCKET'|'PLAN_B'|'BASE'
export type BucketReturnPreview={target:PlacementDropTarget;index?:number;baseId?:string;title:string;detail?:string;planningKind?:'VISIT'|'NEARBY'}

export function MapPanel({ renderer, appearanceSettings, places, bucketItems, bases, visits, transports, plans, routePreview, routeRuntime, dayColors, mapSettings, hoveredPlaceId, hoveredTransportId, selectedPlaceId, focusRequest, previewCandidate, presentationNumbers, autoFitPoints, autoFitKey, trashVisible, trashActive, onTrashDrop, onPlaceHover, onPlaceSelect, onPathSelect, onEditBucketItem, onEditVisit, onEditBase, onEditTransport, onAddPoi }: {
  renderer: MapRenderer
  appearanceSettings:TripAppearanceSettings
  places: TripPlace[]; bucketItems: BucketItem[]; bases: TripBase[]; visits: VisitData[]; transports: MajorTransportData[]
  plans: Record<string,ConnectionPlan>
  routePreview:{pairId:string;route:RouteCandidate}|null
  routeRuntime:Record<string,RouteRuntimeResult>; dayColors:TripDayColors; mapSettings:TripMapSettings
  hoveredPlaceId: string | null; hoveredTransportId:string|null; selectedPlaceId: string | null
  focusRequest: {placeId:string;requestId:number}|null
  previewCandidate: PlaceCandidate|null
  presentationNumbers?: Record<string,number>
  autoFitPoints?:readonly {lat:number;lng:number}[]; autoFitKey?:string; trashVisible?:boolean; trashActive?:boolean; onTrashDrop?:(payload:TimelineDropPayload)=>void
  onPlaceHover: (placeId:string|null)=>void; onPlaceSelect:(placeId:string|null)=>void; onPathSelect:(target:MapPathTarget)=>void
  onEditBucketItem:(id:string)=>void; onEditVisit:(id:string)=>void; onEditBase:(id:string)=>void; onEditTransport:(id:string)=>void
  onAddPoi?:(poi:MapPoiSelection,target:'VISIT'|'NEARBY')=>Promise<void>
}) {
  return <section className="map-panel"><TripMap renderer={renderer} appearanceSettings={appearanceSettings} places={places} bucketItems={bucketItems} bases={bases} visits={visits} transports={transports} plans={plans} routePreview={routePreview} routeRuntime={routeRuntime} dayColors={dayColors} mapSettings={mapSettings} hoveredPlaceId={hoveredPlaceId} hoveredTransportId={hoveredTransportId} selectedPlaceId={selectedPlaceId} focusRequest={focusRequest} previewCandidate={previewCandidate} presentationNumbers={presentationNumbers} autoFitPoints={autoFitPoints} autoFitKey={autoFitKey} trashVisible={trashVisible} trashActive={trashActive} onTrashDrop={onTrashDrop} onPlaceHover={onPlaceHover} onPlaceSelect={onPlaceSelect} onPathSelect={onPathSelect} onEditBucketItem={onEditBucketItem} onEditVisit={onEditVisit} onEditBase={onEditBase} onEditTransport={onEditTransport} onAddPoi={onAddPoi}/></section>
}

function transparentDragImage(){
  const canvas=document.createElement('canvas')
  canvas.width=1;canvas.height=1
  return canvas
}

function PlacementSource({ item, source, places, planBColor, onBucketClick, onBaseClick, highlighted, returning, dragActive, onPlaceHover, onExternalDragStart, onExternalDragMove, onExternalDragEnd }: {
  item: BucketItem | TripBase; source: 'BUCKET' | 'BASE'; places:TripPlace[]; planBColor?:string
  onBucketClick?: (item:BucketItem)=>void; onBaseClick?: (item:TripBase)=>void
  highlighted?:boolean; returning?:boolean; dragActive?:boolean; onPlaceHover?:(placeId:string|null)=>void
  onExternalDragStart?:(payload:TimelineDropPayload,event:ReactDragEvent<HTMLElement>)=>void
  onExternalDragMove?:(event:ReactDragEvent<HTMLElement>)=>void
  onExternalDragEnd?:()=>void
}) {
  const suppressClick=useRef(false)
  const [dragging,setDragging]=useState(false)
  useEffect(()=>{if(dragActive===false)setDragging(false)},[dragActive])
  function startDrag(e: ReactDragEvent<HTMLElement>) {
    suppressClick.current=true
    setDragging(true)
    const bucket=source==='BUCKET'?item as BucketItem:undefined
    const payload:TimelineDropPayload={
      kind:'PLACE',
      placeId:item.placeId,
      title:item.title??places.find(p=>p.id===item.placeId)?.name??ui.schedule.generic,
      detail:item.detail,
      notes:item.notes,
      source,
      sourceId:item.id,
      duration:item.duration,
      ...(source==='BASE'?{visitIcon:(item as TripBase).visitIcon,expectedCost:(item as TripBase).expectedCost,checklist:(item as TripBase).checklist,attachments:(item as TripBase).attachments}:{}) ,
      ...(source==='BUCKET'?{visitId:bucket?.visitId,planningKind:bucket?.planningKind,visitIcon:bucket?.visitIcon,expectedCost:bucket?.expectedCost,checklist:bucket?.checklist,attachments:bucket?.attachments,constraints:bucket?.constraints}:{}),
    }
    writeTimelineDropPayload(e.dataTransfer,payload)
    try{e.dataTransfer.setDragImage(transparentDragImage(),0,0)}catch{/* browser fallback keeps native ghost */}
    onExternalDragStart?.(payload,e)
  }
  function endDrag(){
    setDragging(false)
    onExternalDragEnd?.()
    window.setTimeout(()=>{suppressClick.current=false},0)
  }
  const isPlanB=source==='BUCKET'&&(item as BucketItem).planningKind==='NEARBY'
  return <article className={['bucket-place',isPlanB&&'is-plan-b',highlighted&&'map-related',dragging&&'source-dragging',returning&&'return-target'].filter(Boolean).join(' ')} style={isPlanB&&planBColor?{'--plan-b-color':planBColor} as CSSProperties:undefined} onMouseEnter={()=>onPlaceHover?.(item.placeId??null)} onMouseLeave={()=>onPlaceHover?.(null)} draggable onDragStart={startDrag} onDrag={e=>{if(e.clientX||e.clientY)onExternalDragMove?.(e)}} onDragEnd={endDrag} onClick={()=>{if(suppressClick.current)return;if(source==='BUCKET')onBucketClick?.(item as BucketItem);else onBaseClick?.(item as TripBase)}}>
    <span className="material-symbols-rounded bucket-drag-icon">drag_indicator</span>
    {item.visitIcon&&<span className="material-symbols-rounded visit-property-accent">{visitIconSymbol(item.visitIcon)}</span>}
    <div><strong>{item.title??places.find(p=>p.id===item.placeId)?.name??ui.placePicker.anywhere}</strong><small>{item.detail??item.meta}{source==='BUCKET'&&(item as BucketItem).duration ? ui.sidebar.duration((item as BucketItem).duration!) : ''}</small></div>
  </article>
}

function PlacementDropZone({target,label,help,dropLabel,preview,active,children,onDropPayload,planBColor}:{target:PlacementDropTarget;label:string;help?:string;dropLabel:string;preview?:BucketReturnPreview|null;active:boolean;children:ReactNode;onDropPayload:(payload:TimelineDropPayload,target:PlacementDropTarget)=>void;planBColor?:string}){
  const [dragOver,setDragOver]=useState(false)
  function dragOverEvent(e:ReactDragEvent<HTMLElement>){if(!e.dataTransfer.types.includes('application/x-tripplanner-timeline-drop'))return;e.preventDefault();e.dataTransfer.dropEffect='move';setDragOver(true)}
  function drop(e:ReactDragEvent<HTMLElement>){const payload=readTimelineDropPayload(e.dataTransfer);setDragOver(false);if(!payload)return;e.preventDefault();onDropPayload(payload,target)}
  const reacting=active||dragOver
  return <section className={['bucket-drop-zone',target==='PLAN_B'&&'is-plan-b',active&&'drop-target-active',dragOver&&'drop-target-hover'].filter(Boolean).join(' ')} style={target==='PLAN_B'&&planBColor?{'--plan-b-color':planBColor} as CSSProperties:undefined} data-placement-drop={target} data-drop-reacting={reacting?'true':'false'} {...(target==='BUCKET'?{'data-timeline-unschedule-drop':'true'}:{})} onDragOver={dragOverEvent} onDragLeave={e=>{const related=e.relatedTarget as Node|null;if(!related||!e.currentTarget.contains(related))setDragOver(false)}} onDrop={drop}>
    <div className="bucket-drop-glow" aria-hidden="true"/>
    <div className="bucket-section-title"><span>{label}</span>{help&&<small>{help}</small>}</div>
    {children}
    <div className="bucket-drop-reaction" aria-hidden="true"><span className="material-symbols-rounded">move_down</span><div><strong>{dropLabel}</strong>{preview&&<small>{preview.title}</small>}</div></div>
  </section>
}


export function Bucket({ bucketItems, bases, places, planBColor, onBucketItemClick, onBaseClick, returnPreview, activeDropTarget='NONE', activeExternalDragSourceId=null, dragActive=false, highlightedPlaceId, onPlaceHover, onExternalDragStart, onExternalDragMove, onExternalDragEnd, onPlacementDrop }: {
  bucketItems: BucketItem[]; bases: TripBase[]; places:TripPlace[]; planBColor:string; onBucketItemClick:(item:BucketItem)=>void; onBaseClick:(item:TripBase)=>void
  returnPreview?:BucketReturnPreview|null; activeDropTarget?:'NONE'|'TIMELINE'|'DELETE'|PlacementDropTarget; activeExternalDragSourceId?:string|null; dragActive?:boolean; highlightedPlaceId:string|null; onPlaceHover:(placeId:string|null)=>void
  onExternalDragStart:(payload:TimelineDropPayload,event:ReactDragEvent<HTMLElement>)=>void
  onExternalDragMove:(event:ReactDragEvent<HTMLElement>)=>void
  onExternalDragEnd:()=>void
  onPlacementDrop:(payload:TimelineDropPayload,target:PlacementDropTarget)=>void
}) {
  const panelRef=useRef<HTMLElement|null>(null)
  const normal=bucketItems.filter(item=>item.planningKind!=='NEARBY')
  const planB=bucketItems.filter(item=>item.planningKind==='NEARBY')
  const previewFor=(target:PlacementDropTarget)=>returnPreview?.target===target?returnPreview:null
  const cards=(items:BucketItem[])=>items.map(item=><PlacementSource key={item.id} item={item} source="BUCKET" places={places} planBColor={planBColor} onBucketClick={onBucketItemClick} highlighted={highlightedPlaceId===item.placeId} dragActive={activeExternalDragSourceId===item.id} onPlaceHover={onPlaceHover} onExternalDragStart={onExternalDragStart} onExternalDragMove={onExternalDragMove} onExternalDragEnd={onExternalDragEnd}/>)
  return <aside ref={panelRef} className="bucket" onWheel={e=>{if(!dragActive)return;const node=panelRef.current;if(!node)return;e.preventDefault();node.scrollTop+=e.deltaY}}>
    <header><div><strong>{ui.sidebar.bucket}</strong><small>{ui.sidebar.bucketHelp}</small></div></header>
    <PlacementDropZone target="BUCKET" label={ui.sidebar.bucketSection} help={ui.sidebar.bucketSectionHelp} dropLabel={ui.sidebar.dropBucket} preview={previewFor('BUCKET')} active={activeDropTarget==='BUCKET'} onDropPayload={onPlacementDrop}>
      {cards(normal)}
      {normal.length===0&&<div className="bucket-empty-state">{ui.sidebar.empty}</div>}
    </PlacementDropZone>
    <PlacementDropZone target="PLAN_B" planBColor={planBColor} label={ui.sidebar.planB} help={ui.sidebar.planBHelp} dropLabel={ui.sidebar.dropPlanB} preview={previewFor('PLAN_B')} active={activeDropTarget==='PLAN_B'} onDropPayload={onPlacementDrop}>
      {cards(planB)}
      {planB.length===0&&<div className="bucket-empty-state">{ui.sidebar.planBEmpty}</div>}
    </PlacementDropZone>
    <PlacementDropZone target="BASE" label={ui.sidebar.base} help={ui.sidebar.baseHelp} dropLabel={ui.sidebar.dropBase} preview={previewFor('BASE')} active={activeDropTarget==='BASE'} onDropPayload={onPlacementDrop}>
      {bases.map(base=><PlacementSource key={base.id} item={base} source="BASE" places={places} onBaseClick={onBaseClick} highlighted={highlightedPlaceId===base.placeId} returning={previewFor('BASE')?.baseId===base.id} dragActive={activeExternalDragSourceId===base.id} onPlaceHover={onPlaceHover} onExternalDragStart={onExternalDragStart} onExternalDragMove={onExternalDragMove} onExternalDragEnd={onExternalDragEnd}/>)}
      {bases.length===0&&<div className="bucket-empty-state">{ui.sidebar.baseEmpty}</div>}
    </PlacementDropZone>
  </aside>
}
