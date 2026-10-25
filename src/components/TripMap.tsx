import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import type { BucketItem, TripBase, TripPlace } from '../domain/place'
import { clock, durationText, timelineDateLabel } from '../model'
import type { ConnectionPlan, MajorTransportData, VisitData } from '../model'
import { buildMapPathProjection, type MapPathTarget } from '../map/mapConnectionPrimitives'
import type { MapMarkerPrimitive, MapPoiSelection, MapRenderer, PlaceCandidate, RouteCandidate } from '../map/provider/contract'
import type { RouteRuntimeResult } from '../connectionRuntime'
import { routeRuntimeMatches, savedConnectionRouteRequest } from '../connectionRuntime'
import { connectionWaypointPlaceIds } from '../connectionWaypoints'
import { appearanceForMarker, appearanceForPath } from '../map/appearanceConfig'
import { visualColor, type TripAppearanceSettings, type TripDayColors } from '../visual/appearance'
import { collectActiveWaypointPlaceIds, collectStrongPlaceIds, collectVisiblePlaceIds } from '../map/placeProjection'
import type { TripMapSettings } from '../map/tripMapSettings'
import { text } from '../i18n/catalog'
import { visitIconSymbol } from '../visitProperties'
import { readTimelineDropPayload } from '../timelineDrop'
import type { TimelineDropPayload } from '../timelineDrop'
import type { GeoPoint } from '../domain/place'

const SEARCH_PREVIEW_MARKER_ID='__tripplanner_place_search_preview__'

export function TripMap({renderer,appearanceSettings,places,bucketItems,bases,visits,transports,plans,routePreview,routeRuntime,dayColors,mapSettings,hoveredPlaceId,hoveredTransportId,selectedPlaceId,focusRequest,previewCandidate,presentationNumbers,autoFitPoints,autoFitKey,trashVisible=false,trashActive=false,onTrashDrop,onPlaceHover,onPlaceSelect,onPathSelect,onEditBucketItem,onEditVisit,onEditBase,onEditTransport,onAddPoi}:{
  renderer:MapRenderer
  appearanceSettings:TripAppearanceSettings
  places:TripPlace[]; bucketItems:BucketItem[]; bases:TripBase[]; visits:VisitData[]; transports:MajorTransportData[]; plans:Record<string,ConnectionPlan>
  routePreview:{pairId:string;route:RouteCandidate}|null; routeRuntime:Record<string,RouteRuntimeResult>; dayColors:TripDayColors; mapSettings:TripMapSettings; hoveredPlaceId:string|null; hoveredTransportId:string|null; selectedPlaceId:string|null
  focusRequest:{placeId:string;requestId:number}|null
  previewCandidate:PlaceCandidate|null
  presentationNumbers?:Record<string,number>
  autoFitPoints?:readonly GeoPoint[]; autoFitKey?:string
  trashVisible?:boolean; trashActive?:boolean; onTrashDrop?:(payload:TimelineDropPayload)=>void
  onPlaceHover:(placeId:string|null)=>void; onPlaceSelect:(placeId:string|null)=>void; onPathSelect:(target:MapPathTarget)=>void
  onEditBucketItem:(id:string)=>void; onEditVisit:(id:string)=>void; onEditBase:(id:string)=>void; onEditTransport:(id:string)=>void
  onAddPoi?:(poi:MapPoiSelection,target:'VISIT'|'NEARBY')=>Promise<void>
}){
  const shellRef=useRef<HTMLDivElement|null>(null)
  const hostRef=useRef<HTMLDivElement|null>(null)
  const hoverHandlerRef=useRef(onPlaceHover)
  const selectHandlerRef=useRef(onPlaceSelect)
  const pathSelectHandlerRef=useRef(onPathSelect)
  const pathTargetsRef=useRef(new Map<string,MapPathTarget>())
  const [mounted,setMounted]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [poiSelection,setPoiSelection]=useState<MapPoiSelection|null>(null)
  const [poiBusy,setPoiBusy]=useState(false)
  const [poiError,setPoiError]=useState('')
  const [trashOver,setTrashOver]=useState(false)
  const lastAutoFitKey=useRef<string|null>(null)

  hoverHandlerRef.current=onPlaceHover
  selectHandlerRef.current=onPlaceSelect
  pathSelectHandlerRef.current=onPathSelect

  const pathProjection=useMemo(()=>buildMapPathProjection(places,visits,transports,plans,dayColors),[places,visits,transports,plans,dayColors])
  const activeConnectionPairIds=useMemo(()=>new Set(pathProjection.flatMap(item=>item.target.kind==='CONNECTION'?[item.target.pairId]:[])),[pathProjection])
  const visiblePlaceIds=useMemo(()=>collectVisiblePlaceIds(bucketItems,bases,visits,transports,plans,activeConnectionPairIds),[bucketItems,bases,visits,transports,plans,activeConnectionPairIds])
  const positionedPlaces=useMemo(()=>places.filter(p=>visiblePlaceIds.has(p.id)&&p.position&&Number.isFinite(p.position.lat)&&Number.isFinite(p.position.lng)),[places,visiblePlaceIds])
  const bucketCounts=useMemo(()=>{const m=new Map<string,number>();for(const x of bucketItems)if(x.placeId)m.set(x.placeId,(m.get(x.placeId)??0)+1);return m},[bucketItems])
  const waypointPlaceIds=useMemo(()=>collectActiveWaypointPlaceIds(plans,activeConnectionPairIds),[plans,activeConnectionPairIds])
  const strongPlaceIds=useMemo(()=>collectStrongPlaceIds(bucketItems,bases,visits,transports),[bucketItems,bases,visits,transports])
  const hoveredTransportPlaces=useMemo(()=>{const transport=hoveredTransportId?transports.find(item=>item.id===hoveredTransportId):undefined;return transport?new Set([transport.departure.placeId,transport.arrival.placeId]):new Set<string>()},[hoveredTransportId,transports])

  const selectedPlace=selectedPlaceId&&visiblePlaceIds.has(selectedPlaceId)?places.find(p=>p.id===selectedPlaceId)??null:null
  const relatedBucket=selectedPlace?bucketItems.filter(x=>x.placeId===selectedPlace.id):[]
  const relatedVisits=selectedPlace?visits.filter(x=>x.placeId===selectedPlace.id):[]
  const relatedBases=selectedPlace?bases.filter(x=>x.placeId===selectedPlace.id):[]
  const relatedTransports=selectedPlace?transports.filter(x=>x.departure.placeId===selectedPlace.id||x.arrival.placeId===selectedPlace.id):[]
  const relatedConnections=useMemo(()=>{
    if(!selectedPlace)return[] as Extract<MapPathTarget,{kind:'CONNECTION'}>[]
    return pathProjection.flatMap(item=>{
      if(item.target.kind!=='CONNECTION')return[]
      return connectionWaypointPlaceIds(plans[item.target.pairId]).includes(selectedPlace.id)?[item.target]:[]
    })
  },[selectedPlace,pathProjection,plans])

  pathTargetsRef.current=new Map(pathProjection.map(item=>[item.primitive.id,item.target]))
  const pathPrimitives=useMemo(()=>pathProjection.map(({primitive,target})=>{
    const sized={...primitive,strokeWidthPx:mapSettings.connectionWidthPx}
    if(target.kind!=='CONNECTION')return sized
    const preview=routePreview?.pairId===target.pairId?routePreview.route:null
    const runtimeResult=routeRuntime[target.pairId]
    const request=savedConnectionRouteRequest(target,places,plans[target.pairId])
    const runtime=plans[target.pairId]?.source==='ROUTE_API'&&runtimeResult&&request&&routeRuntimeMatches(runtimeResult,request,plans[target.pairId]?.routeIntent?.option)?runtimeResult.route:null
    const route=preview??runtime
    if(!route?.geometry?.length)return sized
    return appearanceForPath({
      ...sized,
      points:route.geometry,
      stroke:'SOLID' as const,
      direction:'FORWARD' as const,
      state:preview?'SELECTED' as const:primitive.state,
      color:primitive.color,
    }, 'autoRoute')
  }),[pathProjection,routePreview,routeRuntime,plans,places,mapSettings.connectionWidthPx])

  const markerPrimitives=useMemo<MapMarkerPrimitive[]>(()=>{
    const markers:MapMarkerPrimitive[]=positionedPlaces.map(place=>{
      const waypointOnly=waypointPlaceIds.has(place.id)&&!strongPlaceIds.has(place.id)
      const visitsHere=visits.filter(visit=>visit.placeId===place.id).sort((a,b)=>a.start-b.start)
      const bucketHere=bucketItems.filter(item=>item.placeId===place.id)
      const visibleColors=[...new Set(visitsHere.map(visit=>visualColor(visit.visualColor, visit.start, dayColors)))]
      // Reused physical Place spanning several differently colored days stays neutral.
      const planBOnly=visitsHere.length===0&&bucketHere.length>0&&bucketHere.every(item=>item.planningKind==='NEARBY')
      const markerDayColor=visibleColors.length===1?visibleColors[0]:planBOnly?appearanceSettings.planBColor:undefined
      const primarySchedule=visitsHere[0]??bucketHere[0]
      return appearanceForMarker({
        id:place.id,
        position:place.position!,
        label:waypointOnly?undefined:place.name,
        badge:waypointOnly?undefined:(presentationNumbers?.[place.id]??bucketCounts.get(place.id)??0),
        icon:waypointOnly?undefined:visitIconSymbol(primarySchedule?.visitIcon),
        size:waypointOnly?'SMALL':'NORMAL',
        color:markerDayColor,
        state:(selectedPlaceId===place.id?'SELECTED':hoveredPlaceId===place.id||hoveredTransportPlaces.has(place.id)?'HOVERED':'NORMAL') as MapMarkerPrimitive['state'],
      }, waypointOnly ? 'waypoint' : 'regular')
    })
    if(previewCandidate)markers.push(appearanceForMarker({id:SEARCH_PREVIEW_MARKER_ID,position:previewCandidate.position,label:previewCandidate.name,size:'NORMAL',state:'SELECTED'}, 'searchPreview'))
    return markers
  },[positionedPlaces,bucketCounts,waypointPlaceIds,strongPlaceIds,visits,dayColors,hoveredPlaceId,hoveredTransportPlaces,selectedPlaceId,previewCandidate,presentationNumbers,appearanceSettings.planBColor])

  const initialMarkersRef=useRef(markerPrimitives)
  initialMarkersRef.current=markerPrimitives

  useEffect(()=>{
    const host=hostRef.current
    if(!host)return
    let cancelled=false
    setMounted(false)
    setError(null)
    lastAutoFitKey.current=null
    renderer.setMarkers(initialMarkersRef.current)
    renderer.mount(host,{
      onMarkerHover:id=>hoverHandlerRef.current(id===SEARCH_PREVIEW_MARKER_ID?null:id),
      onMarkerClick:id=>{if(id!==SEARCH_PREVIEW_MARKER_ID)selectHandlerRef.current(id)},
      onPathClick:id=>{const target=pathTargetsRef.current.get(id);if(target)pathSelectHandlerRef.current(target)},
      onMapClick:()=>{setPoiSelection(null);selectHandlerRef.current(null)},
      onPoiClick:poi=>{selectHandlerRef.current(null);setPoiError('');setPoiSelection(poi)},
    }).then(()=>{if(!cancelled)setMounted(true)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:text.map.initFailed)})
    return()=>{cancelled=true;renderer.unmount()}
  },[renderer])

  useEffect(()=>{if(mounted)renderer.setMarkers(markerPrimitives)},[renderer,mounted,markerPrimitives])
  useEffect(()=>{if(mounted)renderer.setPaths(pathPrimitives)},[renderer,mounted,pathPrimitives])
  useEffect(()=>{if(!mounted||!autoFitPoints?.length||!autoFitKey||lastAutoFitKey.current===autoFitKey)return;lastAutoFitKey.current=autoFitKey;renderer.fit?.(autoFitPoints)},[renderer,mounted,autoFitPoints,autoFitKey])
  useEffect(()=>{if(mounted&&previewCandidate)renderer.focus(previewCandidate.position)},[renderer,mounted,previewCandidate])
  useEffect(()=>{
    if(!mounted||!focusRequest)return
    if(!visiblePlaceIds.has(focusRequest.placeId))return
    const place=places.find(p=>p.id===focusRequest.placeId)
    if(place?.position)renderer.focus(place.position)
  },[renderer,mounted,focusRequest,places,visiblePlaceIds])

  function focusSelected(){if(selectedPlace?.position)renderer.focus(selectedPlace.position)}

  async function addPoi(target:'VISIT'|'NEARBY'){
    if(!poiSelection||!onAddPoi||poiBusy)return
    setPoiBusy(true);setPoiError('')
    try{await onAddPoi(poiSelection,target);setPoiSelection(null)}
    catch(error){setPoiError(error instanceof Error?error.message:text.mapPoi.addFailed)}
    finally{setPoiBusy(false)}
  }


  function trashDragOver(e:ReactDragEvent<HTMLDivElement>){if(!trashVisible||!onTrashDrop||!e.dataTransfer.types.includes('application/x-tripplanner-timeline-drop'))return;e.preventDefault();e.dataTransfer.dropEffect='move';setTrashOver(true)}
  function trashDrop(e:ReactDragEvent<HTMLDivElement>){const payload=readTimelineDropPayload(e.dataTransfer);setTrashOver(false);if(!payload||!onTrashDrop)return;e.preventDefault();onTrashDrop(payload)}

  return <div ref={shellRef} className="trip-map-shell">
    <div ref={hostRef} className="trip-map-canvas"/>
    {trashVisible&&onTrashDrop&&<div className={['map-trash-zone',(trashActive||trashOver)&&'is-active'].filter(Boolean).join(' ')} data-trash-drop="true" onDragOver={trashDragOver} onDragLeave={e=>{const related=e.relatedTarget as Node|null;if(!related||!e.currentTarget.contains(related))setTrashOver(false)}} onDrop={trashDrop}><span className="material-symbols-rounded">delete</span><div><strong>{text.sidebar.trash}</strong><small>{text.sidebar.trashHelp}</small></div></div>}
    {error&&<div className="trip-map-error"><strong>{text.map.displayFailed}</strong><span>{error}</span></div>}
    {!error&&mounted&&positionedPlaces.length===0&&!previewCandidate&&<div className="trip-map-empty">{text.map.noPositionedPlaces}</div>}
    {poiSelection&&onAddPoi&&<aside className="trip-map-poi-card" onClick={event=>event.stopPropagation()}>
      <button className="trip-map-popup-close" type="button" onClick={()=>setPoiSelection(null)} aria-label={text.common.close}><span className="material-symbols-rounded">close</span></button>
      <div className="trip-map-popup-heading"><span className="material-symbols-rounded">place</span><div><strong>{text.mapPoi.title}</strong><small>{text.mapPoi.help}</small></div></div>
      {poiError&&<small className="place-search-error">{poiError}</small>}
      <div className="trip-map-poi-actions"><button type="button" disabled={poiBusy} onClick={()=>void addPoi('VISIT')}>{text.mapPoi.addVisit}</button><button type="button" disabled={poiBusy} onClick={()=>void addPoi('NEARBY')}>{text.mapPoi.addPlanB}</button></div>
    </aside>}
    {selectedPlace&&<aside className="trip-map-popup" onClick={event=>event.stopPropagation()} onMouseEnter={()=>onPlaceHover(selectedPlace.id)} onMouseLeave={()=>onPlaceHover(null)}>
      <button className="trip-map-popup-close" type="button" onClick={()=>onPlaceSelect(null)} aria-label={text.common.close}><span className="material-symbols-rounded">close</span></button>
      <div className="trip-map-popup-heading"><span className="material-symbols-rounded">location_on</span><div><strong>{selectedPlace.name}</strong>{selectedPlace.category&&<small>{selectedPlace.category}</small>}{selectedPlace.address&&<small className="trip-map-popup-address">{selectedPlace.address}</small>}</div></div>
      {selectedPlace.memo&&<p>{selectedPlace.memo}</p>}
      <div className="trip-map-popup-stats"><span>{text.mapPopup.waiting} {relatedBucket.length}</span><span>{text.mapPopup.schedule} {relatedVisits.length}</span>{relatedBases.length>0&&<span>{text.mapPopup.base} {relatedBases.length}</span>}{relatedTransports.length>0&&<span>{text.mapPopup.transport} {relatedTransports.length}</span>}{relatedConnections.length>0&&<span>{text.mapPopup.waypoint} {relatedConnections.length}</span>}</div>
      {(relatedBucket.length>0||relatedVisits.length>0||relatedBases.length>0||relatedTransports.length>0||relatedConnections.length>0)?<div className="trip-map-popup-related">
        {relatedVisits.slice().sort((a,b)=>a.start-b.start).map(x=>{const date=timelineDateLabel(x.start);return <div className="trip-map-related-card" key={x.id}><div><span className="trip-map-related-kicker">{date.date} · {clock(x.start)}–{clock(x.end)} · {durationText(x.end-x.start)}</span><strong>{x.title??selectedPlace.name}</strong>{x.detail&&<small>{x.detail}</small>}</div><button type="button" onClick={()=>onEditVisit(x.id)}>{text.common.edit}</button></div>})}
        {relatedBucket.map(x=><div className="trip-map-related-card" key={x.id}><div><span className="trip-map-related-kicker">{x.planningKind==='NEARBY'?text.sidebar.planB:text.sidebar.bucketSection}{x.duration?` · ${durationText(x.duration)}`:''}</span><strong>{x.title??selectedPlace.name}</strong>{x.detail&&<small>{x.detail}</small>}</div><button type="button" onClick={()=>onEditBucketItem(x.id)}>{text.common.edit}</button></div>)}
        {relatedBases.map(x=><div className="trip-map-related-card" key={x.id}><div><span className="trip-map-related-kicker">{text.sidebar.base}{x.duration?` · ${durationText(x.duration)}`:''}</span><strong>{x.title??selectedPlace.name}</strong>{x.detail&&<small>{x.detail}</small>}</div><button type="button" onClick={()=>onEditBase(x.id)}>{text.common.edit}</button></div>)}
        {relatedTransports.map(x=>{const endpoint=x.departure.placeId===selectedPlace.id?text.map.departure:text.map.arrival;return <div className="trip-map-related-card" key={x.id}><div><span className="trip-map-related-kicker">{text.mapPopup.majorTransport} · {endpoint} · {durationText(x.occupiedUntil-x.occupiedFrom)}</span><strong>{x.onboard.title}</strong><small>{x.onboard.route}</small></div><button type="button" onClick={()=>onEditTransport(x.id)}>{text.common.edit}</button></div>})}
        {relatedConnections.map(target=><div className="trip-map-related-card" key={target.pairId}><div><span className="trip-map-related-kicker">{text.mapPopup.connectionWaypoint}</span><strong>{target.from.title} → {target.to.title}</strong></div><button type="button" onClick={()=>onPathSelect(target)}>{text.common.edit}</button></div>)}
      </div>:<div className="trip-map-popup-empty">{text.mapPopup.empty}</div>}
      {selectedPlace.position&&<button type="button" className="trip-map-focus" onClick={focusSelected}><span className="material-symbols-rounded">my_location</span>{text.mapPopup.focus}</button>}
    </aside>}
  </div>
}
