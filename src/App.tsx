import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, SetStateAction } from 'react'
import './App.css'
import { Bucket, MapPanel } from './components/Sidebar'
import type { BucketReturnPreview } from './components/Sidebar'
import { ConnectionModal, RoutePicker } from './components/ConnectionModal'
import { Timeline } from './components/Timeline'
import { CaptureTimeline } from './components/CaptureTimeline'
import type { ExternalTimelinePreview, FreeDropState } from './components/Timeline'
import { VisitModal } from './components/VisitModal'
import { BucketItemModal } from './components/BucketItemModal'
import { AddScheduleModal } from './components/AddScheduleModal'
import type { ConnectionSegmentDraft, PlaceChoice, PlacePlanDraft, TransportDraft } from './components/editorTypes'
import { MajorTransportModal } from './components/MajorTransportModal'
import { BaseModal } from './components/BaseModal'
import { DAY, DEFAULT_TIMELINE_VIEW, MIN_VISIT, pairKey, timelineDateFromMinute, type TimelineViewSettings } from './model'
import type { ConnectionPlan, MajorTransportData, Node, Segment, TimelineLabel, VisitData } from './model'
import type { BucketItem, TripBase, TripPlace } from './domain/place'
import type { Region } from './domain/region'
import type { TimelineDropPayload } from './timelineDrop'
import { createTripMapProvider, parseTripMapRoute, resolveTripPlaceRef } from './map/provider/composition'
import type { TripMapRoute } from './map/provider/composition'
import type { MapPoiSelection, PlaceCandidate, RouteCandidate, RouteMode, RouteRequest } from './map/provider/contract'
import type { MapPathTarget } from './map/mapConnectionPrimitives'
import type { RouteRuntimeResult } from './connectionRuntime'
import { routeRequestKey, routeRuntimeMatches, savedConnectionRouteRequest, savedRouteCacheRequests } from './connectionRuntime'
import { connectionDraftFromSegments, normalizeConnectionDraft, normalizeConnectionSegments } from './connectionWaypoints'
import { materializeNewPlaceChoice } from './placeDraft'
import { DEFAULT_TRIP_APPEARANCE, dayColor, updateDayColor, type TripAppearanceSettings, type TripDayColors } from './visual/appearance'
import { preferredRouteMode, routeModeSupported, routeSearchErrorMessage, RouteRequestGate, searchRouteCandidates } from './routeSearchUi'
import { HttpTripSnapshotRepository, TripRevisionConflictError } from './persistence/httpTripRepository'
import type { TripSummary } from './persistence/httpTripRepository'
import { createTripSnapshot, refreshMajorTransportPlaceProjection, restoreTripSnapshot } from './persistence/snapshotCodec'
import { hydrateProviderPlaces, refreshProviderPlacePositions } from './persistence/providerHydration'
import { primeGooglePlacePositionCache, readRouteCandidatesCache, writeRouteCandidatesCache } from './providerData/httpProviderCache'
import { DEFAULT_TRIP_MAP_SETTINGS, MAX_CONNECTION_WIDTH_PX, MIN_CONNECTION_WIDTH_PX, normalizeConnectionWidthPx, type TripMapSettings } from './map/tripMapSettings'
import { authApi, type AuthStatus, type ManagedUser, type RuntimeConfig, type TripAccessConfig } from './authApi'
import { text } from './i18n/catalog'
import { AdminBootstrapPage, ForcedPasswordChangePage, LoginPage, ManagementPage } from './components/AuthPages'
import { recordTelemetry, setTelemetryTrip } from './telemetry'

type CreatedBundle={place?:TripPlace;places?:TripPlace[];bucketItem?:BucketItem;base?:TripBase;visit?:VisitData;transport?:MajorTransportData}
type HistoryAction =
 | {kind:'VISIT';id:string;before:{start:number;end:number};after:{start:number;end:number}}
 | {kind:'VISIT_SCHEDULE';visit:VisitData;bucketItem?:BucketItem;bucketIndex?:number}
 | {kind:'VISIT_UNSCHEDULE';visit:VisitData;bucketItem?:BucketItem;bucketIndex?:number}
 | {kind:'VISIT_EDIT';before:VisitData;after:VisitData;createdPlace?:TripPlace}
 | {kind:'BUCKET_EDIT';before:BucketItem;after:BucketItem;createdPlace?:TripPlace}
 | {kind:'TRANSPORT_EDIT';before:MajorTransportData;after:MajorTransportData;createdPlaces?:TripPlace[]}
 | {kind:'BASE_EDIT';before:TripBase;after:TripBase;createdPlace?:TripPlace}
 | {kind:'CONNECTION_EDIT';id:string;before?:ConnectionPlan;after?:ConnectionPlan;createdPlaces?:TripPlace[]}
 | {kind:'CREATE';bundle:CreatedBundle}
 | {kind:'VISIT_DELETE';visit:VisitData}
 | {kind:'BUCKET_DELETE';item:BucketItem;index:number}
 | {kind:'BASE_DELETE';base:TripBase;index:number}
 | {kind:'TRANSPORT_DELETE';transport:MajorTransportData}
 | {kind:'LABEL_MOVE';id:string;before:number;after:number}
 | {kind:'LABEL_EDIT';id:string;before:string;after:string}
 | {kind:'LABEL_DELETE';label:TimelineLabel}
 | {kind:'LABEL_ADD';label:TimelineLabel}
 | {kind:'DAY_COLOR';date:string;before?:string;after?:string}
 | {kind:'PLACEMENT_CONVERT';before:{bucketItems:BucketItem[];bases:TripBase[];visits:VisitData[]};after:{bucketItems:BucketItem[];bases:TripBase[];visits:VisitData[]}}
type HistoryState={undo:HistoryAction[];redo:HistoryAction[]}
type ExternalDragVisual={payload:TimelineDropPayload;clientX:number;clientY:number;preview:ExternalTimelinePreview}

const insertBucketItem=(items:BucketItem[],item:BucketItem,index?:number)=>items.some(x=>x.id===item.id)?items:[...items.slice(0,Math.max(0,Math.min(index??items.length,items.length))),item,...items.slice(Math.max(0,Math.min(index??items.length,items.length)))]
const insertBase=(items:TripBase[],base:TripBase,index:number)=>items.some(x=>x.id===base.id)?items:[...items.slice(0,Math.max(0,Math.min(index,items.length))),base,...items.slice(Math.max(0,Math.min(index,items.length)))]
const iconFor=(mode:MajorTransportData['mode'])=>mode==='TRAIN'?'train':mode==='FLIGHT'?'flight':mode==='SHIP'?'directions_boat':mode==='BUS'?'directions_bus':'directions_car'
const tripRepository=new HttpTripSnapshotRepository()

function TripEditor({tripRoute,runtimeConfig,auth}:{tripRoute:TripMapRoute;runtimeConfig:RuntimeConfig;auth:Extract<AuthStatus,{authenticated:true}>}){
 setTelemetryTrip(tripRoute.tripId)
 const {naverClientId,googleApiKey,googleMapId,providerCache={googlePlacesPositionTtlHours:0,googleRoutesResultTtlHours:0,naverDirectionsResultTtlHours:0}}=runtimeConfig
 const routeCacheTtlHours=tripRoute.mapProvider==='GOOGLE'?(providerCache.googleRoutesResultTtlHours??0):(providerCache.naverDirectionsResultTtlHours??0)
 const requestedMapProvider=tripRoute.mapProvider
 const mapProvider=useMemo(()=>createTripMapProvider(requestedMapProvider,{naverClientId,googleApiKey,googleMapId}),[requestedMapProvider,naverClientId,googleApiKey,googleMapId])
 const [tripName,setTripName]=useState('')
 const [revision,setRevision]=useState<number|null>(null)
 const [loadState,setLoadState]=useState<'LOADING'|'READY'|'ERROR'>('LOADING')
 const [storageError,setStorageError]=useState<string|null>(null)
 const [saving,setSaving]=useState(false)
 const [lastSavedFingerprint,setLastSavedFingerprint]=useState('')
 const [hydrationWarning,setHydrationWarning]=useState<string|null>(null)
 const [remoteRevisionAvailable,setRemoteRevisionAvailable]=useState<number|null>(null)
 const [pinRefreshBusy,setPinRefreshBusy]=useState(false)
 const [pinRefreshMessage,setPinRefreshMessage]=useState<string|null>(null)
 const placesRef=useRef<TripPlace[]>([])
 const [places,setPlaces]=useState<TripPlace[]>([])
 const [regions,setRegions]=useState<Region[]>([])
 const [bucketItems,setBucketItems]=useState<BucketItem[]>([])
 const [bases,setBases]=useState<TripBase[]>([])
 const [visits,setVisits]=useState<VisitData[]>([])
 const [transports,setTransports]=useState<MajorTransportData[]>([])
 const [labels,setLabels]=useState<TimelineLabel[]>([])
 const [plans,setPlans]=useState<Record<string,ConnectionPlan>>({})
 const [dayColors,setDayColors]=useState<TripDayColors>({})
 const [timelineView,setTimelineView]=useState<TimelineViewSettings>({...DEFAULT_TIMELINE_VIEW})
 const [mapSettings,setMapSettings]=useState<TripMapSettings>({...DEFAULT_TRIP_MAP_SETTINGS})
 const [appearanceSettings,setAppearanceSettings]=useState<TripAppearanceSettings>({...DEFAULT_TRIP_APPEARANCE})
 const [mapSettingsOpen,setMapSettingsOpen]=useState(false)
 const [captureMode,setCaptureMode]=useState(false)
 const [captureDayStart,setCaptureDayStart]=useState<number|null>(null)
 const [colorEditorOpen,setColorEditorOpen]=useState(false)
 const [editingPair,setEditingPair]=useState<{from:Node;to:Node}|null>(null)
 const [draftSegments,setDraftSegments]=useState<ConnectionSegmentDraft[]>([])
 const [draftRouteWaypoints,setDraftRouteWaypoints]=useState<PlaceChoice[]>([])
 const [pendingRouteRequest,setPendingRouteRequest]=useState<RouteRequest|null>(null)
 const routeRequestGate=useRef(new RouteRequestGate()).current
 const [draftRouteMode,setDraftRouteMode]=useState<RouteMode>('CAR')
 const [initialRouteDraftKey,setInitialRouteDraftKey]=useState<string|null>(null)
 const [draftConnectionSource,setDraftConnectionSource]=useState<ConnectionPlan['source']>('MANUAL')
 const [draftConnectionName,setDraftConnectionName]=useState('')
 const [draftConnectionMemo,setDraftConnectionMemo]=useState('')
 const [draftConnectionExpectedDuration,setDraftConnectionExpectedDuration]=useState<number|undefined>(undefined)
 const [draftConnectionColor,setDraftConnectionColor]=useState('')
 const [routePickerOpen,setRoutePickerOpen]=useState(false)
 const [routeCandidates,setRouteCandidates]=useState<RouteCandidate[]>([])
 const [routeLoading,setRouteLoading]=useState(false)
 const [routeError,setRouteError]=useState<string|null>(null)
 const [routePreview,setRoutePreview]=useState<{pairId:string;route:RouteCandidate}|null>(null)
 const [routeRuntime,setRouteRuntime]=useState<Record<string,RouteRuntimeResult>>({})
 const [draftRouteResult,setDraftRouteResult]=useState<RouteRuntimeResult|null>(null)
 const [editingVisitId,setEditingVisitId]=useState<string|null>(null)
 const [editingBucketItemId,setEditingBucketItemId]=useState<string|null>(null)
 const [editingBaseId,setEditingBaseId]=useState<string|null>(null)
 const [editingTransportId,setEditingTransportId]=useState<string|null>(null)
 const [addOpen,setAddOpen]=useState(false)
 const [freeDropState,setFreeDropState]=useState<FreeDropState>({target:'NONE',visitId:null})
 const [externalDrag,setExternalDrag]=useState<ExternalDragVisual|null>(null)
 const [history,setHistory]=useState<HistoryState>({undo:[],redo:[]})
 const [hoveredPlaceId,setHoveredPlaceId]=useState<string|null>(null)
 const [hoveredTransportId,setHoveredTransportId]=useState<string|null>(null)
 const [selectedPlaceId,setSelectedPlaceId]=useState<string|null>(null)
 const [mapFocusRequest,setMapFocusRequest]=useState<{placeId:string;requestId:number}|null>(null)
 const [placeSearchPreview,setPlaceSearchPreview]=useState<PlaceCandidate|null>(null)

 async function restoreSavedRoutes(savedPlans:Record<string,ConnectionPlan>,savedVisits:VisitData[],savedTransports:MajorTransportData[],savedPlaces:TripPlace[]){
   if(routeCacheTtlHours===0)return {}
   const requests=savedRouteCacheRequests(savedPlans,savedVisits,savedTransports,savedPlaces,tripRoute.mapProvider)
   const entries=await Promise.all(requests.map(async ({pairId,request,option})=>{
     try{
       const cached=await readRouteCandidatesCache(tripRoute.tripId,tripRoute.mapProvider,request)
       if(!cached.hit||!Array.isArray(cached.value))return null
       const route=option?cached.value.find(candidate=>candidate.id===option):cached.value[0]
       return route&&route.mode===request.mode?{pairId,result:{requestKey:routeRequestKey(request),request,route}}:null
     }catch{return null} // Cache failures may not block opening the Trip.
   }))
   return Object.fromEntries(entries.filter((entry):entry is NonNullable<typeof entry>=>!!entry).map(({pairId,result})=>[pairId,result]))
 }


 useEffect(()=>{placesRef.current=places},[places])
 useEffect(()=>{setTelemetryTrip(tripRoute.tripId);return()=>setTelemetryTrip(null)},[tripRoute.tripId])
 useEffect(()=>{document.body.classList.toggle('capture-document-mode',captureMode);return()=>document.body.classList.remove('capture-document-mode')},[captureMode])
 useEffect(()=>{const active=!!externalDrag||!!freeDropState.visitId;document.body.classList.toggle('tripplanner-dragging',active);return()=>document.body.classList.remove('tripplanner-dragging')},[externalDrag,freeDropState.visitId])

 useEffect(()=>{
   let cancelled=false
   setLoadState('LOADING');setStorageError(null);setHydrationWarning(null)
   void tripRepository.load(tripRoute.tripId).then(async loaded=>{
     if(cancelled)return
     if(!loaded){setStorageError(text.errors.tripNotFound);setLoadState('ERROR');return}
     if(loaded.snapshot.mapProvider!==tripRoute.mapProvider){
       const ns=loaded.snapshot.mapProvider==='GOOGLE'?'goo':'nav'
       window.location.replace(`/${ns}/${encodeURIComponent(tripRoute.tripId)}`);return
     }
     const restored=restoreTripSnapshot(loaded.snapshot)
     setTripName(loaded.snapshot.name);setRevision(loaded.revision)
     setPlaces(restored.places);setRegions(restored.regions);setVisits(restored.visits);setBucketItems(restored.bucketItems);setBases(restored.bases);setTransports(restored.transports);setLabels(restored.labels);setPlans(restored.plans);setTimelineView(restored.timelineView);setDayColors(restored.dayColors);setMapSettings(restored.mapSettings??{...DEFAULT_TRIP_MAP_SETTINGS});setAppearanceSettings(restored.appearanceSettings??{...DEFAULT_TRIP_APPEARANCE})
     setRouteRuntime({});setDraftRouteResult(null);setRoutePreview(null);setRouteCandidates([]);setHistory({undo:[],redo:[]})
     setLastSavedFingerprint(JSON.stringify(loaded.snapshot));setLoadState('READY');recordTelemetry('UX_TRIP_OPEN',tripRoute.mapProvider)
     const hydrated=await hydrateProviderPlaces(loaded.snapshot.mapProvider,restored.places,{googleApiKey,tripId:tripRoute.tripId,googlePlacesPositionCacheTtlHours:providerCache.googlePlacesPositionTtlHours,mode:'CACHE_ONLY'})
     if(cancelled)return
     if(hydrated.requestCount||hydrated.cacheHitCount){
       setPlaces(hydrated.places)
       setTransports(current=>current.map(transport=>refreshMajorTransportPlaceProjection(transport,hydrated.places)))
     }
     if(hydrated.failedPlaceIds.length)setHydrationWarning(text.errors.providerMetadataPartial(hydrated.failedPlaceIds.length))
     const restoredRoutes=await restoreSavedRoutes(restored.plans,restored.visits,restored.transports,hydrated.places)
     if(!cancelled)setRouteRuntime(restoredRoutes)
   }).catch(error=>{if(cancelled)return;setStorageError(error instanceof Error?error.message:text.errors.tripLoadFailed);setLoadState('ERROR')})
   return()=>{cancelled=true}
 },[tripRoute.tripId,tripRoute.mapProvider,googleApiKey,providerCache.googlePlacesPositionTtlHours,routeCacheTtlHours])

 const currentSnapshot=useMemo(()=>createTripSnapshot({tripId:tripRoute.tripId,name:tripName||text.tripHome.untitled,mapProvider:tripRoute.mapProvider,places,regions,visits,bucketItems,bases,transports,labels,plans,timelineView,dayColors,mapSettings,appearanceSettings}),[tripRoute.tripId,tripRoute.mapProvider,tripName,places,regions,visits,bucketItems,bases,transports,labels,plans,timelineView,dayColors,mapSettings,appearanceSettings])
 const currentFingerprint=useMemo(()=>JSON.stringify(currentSnapshot),[currentSnapshot])
 const dirty=loadState==='READY'&&currentFingerprint!==lastSavedFingerprint

 useEffect(()=>{
   if(loadState!=='READY'||revision===null)return
   let cancelled=false,busy=false
   const check=async()=>{
     if(cancelled||busy)return;busy=true
     try{
       const remote=await tripRepository.revision(tripRoute.tripId)
       if(cancelled||remote===null||remote<=revision)return
       if(dirty){setRemoteRevisionAvailable(remote);return}
       const loaded=await tripRepository.load(tripRoute.tripId)
       if(cancelled||!loaded||loaded.revision<=revision)return
       const restored=restoreTripSnapshot(loaded.snapshot)
       const previous=placesRef.current
       const runtimePreserved=restored.places.map(place=>{
         const old=previous.find(item=>item.id===place.id&&item.providerRef?.provider===place.providerRef?.provider&&item.providerRef?.id===place.providerRef?.id)
         if(!old)return place
         return {...place,name:old.name||place.name,...(old.address?{address:old.address}:{}),...(old.position?{position:{...old.position}}:{}),provenance:{...place.provenance,...old.provenance}}
       })
       const hydrated=await hydrateProviderPlaces(loaded.snapshot.mapProvider,runtimePreserved,{googleApiKey,tripId:tripRoute.tripId,googlePlacesPositionCacheTtlHours:providerCache.googlePlacesPositionTtlHours,mode:'CACHE_ONLY'})
       if(cancelled)return
       setTripName(loaded.snapshot.name);setRevision(loaded.revision);setRemoteRevisionAvailable(null)
       setPlaces(hydrated.places);setRegions(restored.regions);setVisits(restored.visits);setBucketItems(restored.bucketItems);setBases(restored.bases);setTransports(restored.transports.map(transport=>refreshMajorTransportPlaceProjection(transport,hydrated.places)));setLabels(restored.labels);setPlans(restored.plans);setTimelineView(restored.timelineView);setDayColors(restored.dayColors);setMapSettings(restored.mapSettings??{...DEFAULT_TRIP_MAP_SETTINGS});setAppearanceSettings(restored.appearanceSettings??{...DEFAULT_TRIP_APPEARANCE})
       setRouteRuntime({});setDraftRouteResult(null);setRoutePreview(null);setRouteCandidates([]);setHistory({undo:[],redo:[]});setLastSavedFingerprint(JSON.stringify(loaded.snapshot))
       const restoredRoutes=await restoreSavedRoutes(restored.plans,restored.visits,restored.transports,hydrated.places)
       if(!cancelled)setRouteRuntime(restoredRoutes)
     }catch{}finally{busy=false}
   }
   const timer=window.setInterval(()=>void check(),10000)
   return()=>{cancelled=true;window.clearInterval(timer)}
 },[loadState,revision,dirty,tripRoute.tripId,googleApiKey,providerCache.googlePlacesPositionTtlHours,routeCacheTtlHours])
 async function saveTrip(){
   if(revision===null||saving||loadState!=='READY')return
   setSaving(true);setStorageError(null)
   try{const next=await tripRepository.save(tripRoute.tripId,currentSnapshot,revision);setRevision(next);setLastSavedFingerprint(currentFingerprint);recordTelemetry('UX_SAVE',tripRoute.mapProvider);void primeGooglePlacePositionCache(tripRoute.tripId,places,tripRoute.mapProvider==='GOOGLE'&&providerCache.googlePlacesPositionTtlHours!==0)}
   catch(error){setStorageError(error instanceof TripRevisionConflictError?error.message:error instanceof Error?error.message:text.errors.saveFailed)}
   finally{setSaving(false)}
 }
 async function refreshPins(){
   if(pinRefreshBusy)return
   const count=places.filter(place=>place.providerRef?.provider===tripRoute.mapProvider&&place.provenance?.position?.source!=='USER').length
   if(!count){setPinRefreshMessage(text.tripSettings.pinRefreshNone);return}
   if(!window.confirm(text.tripSettings.pinRefreshConfirm(count)))return
   setPinRefreshBusy(true);setPinRefreshMessage(null);setHydrationWarning(null)
   try{
     const result=await refreshProviderPlacePositions(tripRoute.mapProvider,places,{googleApiKey,tripId:tripRoute.tripId,googlePlacesPositionCacheTtlHours:providerCache.googlePlacesPositionTtlHours})
     setPlaces(result.places);setTransports(current=>current.map(transport=>refreshMajorTransportPlaceProjection(transport,result.places)))
     setPinRefreshMessage(text.tripSettings.pinRefreshResult(result.requestCount,result.failedPlaceIds.length))
     recordTelemetry('UX_PIN_REFRESH',tripRoute.mapProvider)
   }catch(error){setPinRefreshMessage(error instanceof Error?error.message:text.tripSettings.pinRefreshFailed)}
   finally{setPinRefreshBusy(false)}
 }

 const editingVisit=visits.find(x=>x.id===editingVisitId)??null
 const editingBucketItem=bucketItems.find(x=>x.id===editingBucketItemId)??null
 const editingBase=bases.find(x=>x.id===editingBaseId)??null
 const editingTransport=transports.find(x=>x.id===editingTransportId)??null
 const placeName=(id?:string)=>id?places.find(p=>p.id===id)?.name:undefined
 const scheduleName=(x:{title?:string;placeId?:string})=>x.title??placeName(x.placeId)??text.schedule.generic

 function requestMapFocus(placeId?:string){if(!placeId||!places.find(x=>x.id===placeId)?.position)return;setSelectedPlaceId(placeId);setMapFocusRequest(prev=>({placeId,requestId:(prev?.requestId??0)+1}))}
 const canFocusPlace=(id?:string)=>!!id&&!!places.find(x=>x.id===id)?.position
 function setDayColor(date:string,color?:string){const before=dayColors[date];if(before===color)return;setDayColors(xs=>updateDayColor(xs,date,color));record({kind:'DAY_COLOR',date,before,after:color})}
 const record=(action:HistoryAction)=>setHistory(h=>({undo:[...h.undo,action],redo:[]}))

 function applyBundle(b:CreatedBundle,add:boolean){
   if(b.place)setPlaces(xs=>add?[...xs.filter(x=>x.id!==b.place!.id),b.place!]:xs.filter(x=>x.id!==b.place!.id))
   if(b.places?.length)setPlaces(xs=>add?[...xs.filter(x=>!b.places!.some(p=>p.id===x.id)),...b.places!]:xs.filter(x=>!b.places!.some(p=>p.id===x.id)))
   if(b.bucketItem)setBucketItems(xs=>add?[...xs.filter(x=>x.id!==b.bucketItem!.id),b.bucketItem!]:xs.filter(x=>x.id!==b.bucketItem!.id))
   if(b.base)setBases(xs=>add?[...xs.filter(x=>x.id!==b.base!.id),b.base!]:xs.filter(x=>x.id!==b.base!.id))
   if(b.visit)setVisits(xs=>add?[...xs.filter(x=>x.id!==b.visit!.id),b.visit!]:xs.filter(x=>x.id!==b.visit!.id))
   if(b.transport)setTransports(xs=>add?[...xs.filter(x=>x.id!==b.transport!.id),b.transport!]:xs.filter(x=>x.id!==b.transport!.id))
 }
 function apply(a:HistoryAction,d:'UNDO'|'REDO'){
   const before=d==='UNDO'
   if(a.kind==='CREATE')applyBundle(a.bundle,!before)
   if(a.kind==='VISIT'){const v=before?a.before:a.after;setVisits(xs=>xs.map(x=>x.id===a.id?{...x,...v}:x))}
   if(a.kind==='VISIT_SCHEDULE'){setVisits(xs=>before?xs.filter(x=>x.id!==a.visit.id):[...xs.filter(x=>x.id!==a.visit.id),a.visit]);if(a.bucketItem)setBucketItems(xs=>before?insertBucketItem(xs,a.bucketItem!,a.bucketIndex):xs.filter(x=>x.id!==a.bucketItem!.id))}
   if(a.kind==='VISIT_UNSCHEDULE'){setVisits(xs=>before?[...xs.filter(x=>x.id!==a.visit.id),a.visit]:xs.filter(x=>x.id!==a.visit.id));if(a.bucketItem)setBucketItems(xs=>before?xs.filter(x=>x.id!==a.bucketItem!.id):insertBucketItem(xs,a.bucketItem!,a.bucketIndex))}
   if(a.kind==='VISIT_EDIT'){const v=before?a.before:a.after;setVisits(xs=>xs.map(x=>x.id===v.id?v:x));if(a.createdPlace)setPlaces(xs=>before?xs.filter(x=>x.id!==a.createdPlace!.id):[...xs.filter(x=>x.id!==a.createdPlace!.id),a.createdPlace!])}
   if(a.kind==='BUCKET_EDIT'){const v=before?a.before:a.after;setBucketItems(xs=>xs.map(x=>x.id===v.id?v:x));if(a.createdPlace)setPlaces(xs=>before?xs.filter(x=>x.id!==a.createdPlace!.id):[...xs.filter(x=>x.id!==a.createdPlace!.id),a.createdPlace!])}
   if(a.kind==='TRANSPORT_EDIT'){const v=before?a.before:a.after;setTransports(xs=>xs.map(x=>x.id===v.id?v:x));if(a.createdPlaces?.length)setPlaces(xs=>before?xs.filter(x=>!a.createdPlaces!.some(p=>p.id===x.id)):[...xs.filter(x=>!a.createdPlaces!.some(p=>p.id===x.id)),...a.createdPlaces!])}
   if(a.kind==='BASE_EDIT'){const v=before?a.before:a.after;setBases(xs=>xs.map(x=>x.id===v.id?v:x));if(a.createdPlace)setPlaces(xs=>before?xs.filter(x=>x.id!==a.createdPlace!.id):[...xs.filter(x=>x.id!==a.createdPlace!.id),a.createdPlace!])}
   if(a.kind==='CONNECTION_EDIT'){
     const v=before?a.before:a.after
     setPlans(xs=>{const next={...xs};if(v)next[a.id]=v;else delete next[a.id];return next})
     if(a.createdPlaces?.length)setPlaces(xs=>before
       ? xs.filter(place=>!a.createdPlaces!.some(created=>created.id===place.id))
       : [...xs.filter(place=>!a.createdPlaces!.some(created=>created.id===place.id)),...a.createdPlaces!])
   }
   if(a.kind==='VISIT_DELETE')setVisits(xs=>before?[...xs.filter(x=>x.id!==a.visit.id),a.visit]:xs.filter(x=>x.id!==a.visit.id))
   if(a.kind==='BUCKET_DELETE')setBucketItems(xs=>before?insertBucketItem(xs,a.item,a.index):xs.filter(x=>x.id!==a.item.id))
   if(a.kind==='BASE_DELETE')setBases(xs=>before?insertBase(xs,a.base,a.index):xs.filter(x=>x.id!==a.base.id))
   if(a.kind==='TRANSPORT_DELETE')setTransports(xs=>before?[...xs.filter(x=>x.id!==a.transport.id),a.transport]:xs.filter(x=>x.id!==a.transport.id))
   if(a.kind==='LABEL_MOVE'){const at=before?a.before:a.after;setLabels(xs=>xs.map(x=>x.id===a.id?{...x,at}:x))}
   if(a.kind==='LABEL_EDIT'){const text=before?a.before:a.after;setLabels(xs=>xs.map(x=>x.id===a.id?{...x,text}:x))}
   if(a.kind==='LABEL_DELETE')setLabels(xs=>before?[...xs,a.label].sort((x,y)=>x.at-y.at):xs.filter(x=>x.id!==a.label.id))
   if(a.kind==='DAY_COLOR')setDayColors(xs=>updateDayColor(xs,a.date,before?a.before:a.after))
   if(a.kind==='PLACEMENT_CONVERT'){const state=before?a.before:a.after;setBucketItems(structuredClone(state.bucketItems));setBases(structuredClone(state.bases));setVisits(structuredClone(state.visits))}
   if(a.kind==='LABEL_ADD')setLabels(xs=>before?xs.filter(x=>x.id!==a.label.id):[...xs.filter(x=>x.id!==a.label.id),a.label].sort((x,y)=>x.at-y.at))
 }
 function undo(){setHistory(h=>{const a=h.undo.at(-1);if(!a)return h;apply(a,'UNDO');recordTelemetry('UX_UNDO',tripRoute.mapProvider);return{undo:h.undo.slice(0,-1),redo:[...h.redo,a]}})}
 function redo(){setHistory(h=>{const a=h.redo.at(-1);if(!a)return h;apply(a,'REDO');recordTelemetry('UX_REDO',tripRoute.mapProvider);return{undo:[...h.undo,a],redo:h.redo.slice(0,-1)}})}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)})

 function resolvePlace(choice:PlacePlanDraft['place']):{placeId?:string;created?:TripPlace}{if(choice.mode==='NONE')return{};if(choice.mode==='EXISTING')return{placeId:choice.placeId};const p=materializeNewPlaceChoice(choice,crypto.randomUUID());return{placeId:p.id,created:p}}
 function createPlacePlan(d:PlacePlanDraft){const r=resolvePlace(d.place);const bundle:CreatedBundle={place:r.created};const props={visitIcon:d.visitIcon,expectedCost:d.expectedCost,checklist:d.checklist,attachments:d.attachments,notes:d.notes};if(d.purpose==='BASE'){bundle.base={id:crypto.randomUUID(),placeId:r.placeId!,title:d.title,meta:text.base.meta,detail:d.detail,notes:d.notes,duration:d.duration,visitIcon:d.visitIcon,expectedCost:d.expectedCost,checklist:d.checklist,attachments:d.attachments}}else if(d.constraints?.fixedStart!==undefined){const dur=Math.max(MIN_VISIT,d.duration??60);bundle.visit={id:crypto.randomUUID(),placeId:r.placeId,start:d.constraints.fixedStart,end:d.constraints.fixedStart+dur,title:d.title,detail:d.detail,durationExplicit:d.duration!==undefined,planningKind:d.purpose,constraints:d.constraints,...props}}else{bundle.bucketItem={id:crypto.randomUUID(),placeId:r.placeId,title:d.title,meta:d.purpose==='NEARBY'?text.schedule.nearby:text.schedule.visitIntent,detail:d.detail,duration:d.duration,durationExplicit:d.duration!==undefined,planningKind:d.purpose,constraints:d.constraints,...props}};applyBundle(bundle,true);record({kind:'CREATE',bundle});setPlaceSearchPreview(null);setAddOpen(false);if(r.created?.position)setSelectedPlaceId(r.created.id)}
 function closeAddSchedule(){setPlaceSearchPreview(null);setAddOpen(false)}
 async function addMapPoi(poi:MapPoiSelection,target:'VISIT'|'NEARBY'){
   if(poi.provider!==tripRoute.mapProvider)throw new Error(text.mapPoi.providerMismatch)
   const resolved=await resolveTripPlaceRef(tripRoute.mapProvider,poi.sourceRef,{googleApiKey,requestedFields:{name:true,address:true,position:true},allowGeocodingFallback:false})
   const placeId=crypto.randomUUID()
   const fallback=text.mapPoi.savedFallback
   const place:TripPlace={...resolved,id:placeId,searchLabel:fallback,position:resolved.position??poi.position}
   const item:BucketItem={id:crypto.randomUUID(),placeId,title:undefined,meta:target==='NEARBY'?text.schedule.nearby:text.schedule.visitIntent,planningKind:target,duration:60,durationExplicit:false}
   const bundle:CreatedBundle={place,bucketItem:item}
   applyBundle(bundle,true);record({kind:'CREATE',bundle});setSelectedPlaceId(placeId)
 }
 function createTransport(d:TransportDraft){const resolve=(choice:TransportDraft['departurePlace'])=>{if(choice.mode==='EXISTING')return {place:places.find(p=>p.id===choice.placeId)!,created:undefined as TripPlace|undefined};if(choice.mode==='NEW'){const created=materializeNewPlaceChoice(choice,crypto.randomUUID());return {place:created,created}};throw new Error(text.errors.physicalPlaceRequired)};const dr=resolve(d.departurePlace),ar=resolve(d.arrivalPlace),dp=dr.place,ap=ar.place;const userTitle=d.title.trim()||undefined;const tr:MajorTransportData={id:crypto.randomUUID(),mode:d.mode,serviceNumber:d.serviceNumber,seat:d.seat,memo:d.memo,userTitle,occupiedFrom:d.departureAt,occupiedUntil:d.arrivalAt,departure:{placeId:dp.id,place:dp.name,departureAt:d.departureAt},arrival:{placeId:ap.id,place:ap.name,arrivalAt:d.arrivalAt},onboard:{title:userTitle||d.serviceNumber||`${dp.name} → ${ap.name}`,route:`${dp.name} → ${ap.name}`,icon:iconFor(d.mode)}};const created=[dr.created,ar.created].filter((p):p is TripPlace=>!!p);const bundle:CreatedBundle={places:created.length?created:undefined,transport:tr};applyBundle(bundle,true);record({kind:'CREATE',bundle});setPlaceSearchPreview(null);setAddOpen(false)}

 function closeRoutePicker(){routeRequestGate.cancel();setRouteLoading(false);setPendingRouteRequest(null);setRoutePickerOpen(false);setRouteCandidates([]);setRouteError(null);setRoutePreview(null)}
 function closeConnection(){closeRoutePicker();setDraftRouteResult(null);setInitialRouteDraftKey(null);setPlaceSearchPreview(null);setEditingPair(null)}
 function routeChoiceKey(choice:PlaceChoice){
   if(choice.mode==='NONE')return 'NONE'
   if(choice.mode==='EXISTING')return `P:${choice.placeId}`
   return `N:${choice.sourceRef?.provider??''}:${choice.sourceRef?.id??''}:${choice.lat??''}:${choice.lng??''}:${choice.name}`
 }
 function routeDraftKey(provider:string,mode:RouteMode,choices:readonly PlaceChoice[]){return `${provider}|${mode}|${choices.map(routeChoiceKey).join('>')}`}
 function openConnection(from:Node,to:Node){
   closeRoutePicker()
   setPlaceSearchPreview(null)
   const existing=plans[pairKey(from,to)]
   const routeChoices=(existing?.source==='ROUTE_API'?existing.routeIntent?.waypointPlaceIds:[])?.map(placeId=>({mode:'EXISTING' as const,placeId}))??[]
   const routeMode=preferredRouteMode(mapProvider.capabilities,existing?.source==='ROUTE_API'?existing.routeIntent?.mode:undefined)
   setDraftRouteResult(null)
   setEditingPair({from,to})
   setDraftSegments(existing?.source==='ROUTE_API'?[]:connectionDraftFromSegments(existing?.segments??[],places))
   setDraftRouteWaypoints(routeChoices)
   setDraftRouteMode(routeMode)
   setInitialRouteDraftKey(existing?.source==='ROUTE_API'&&existing.routeIntent?routeDraftKey(existing.routeIntent.provider,existing.routeIntent.mode,routeChoices):null)
   setDraftConnectionSource(existing?.source??'MANUAL')
   setDraftConnectionName(existing?.user?.name??'')
   setDraftConnectionMemo(existing?.user?.memo??'')
   setDraftConnectionExpectedDuration(existing?.user?.expectedDurationMinutes)
   setDraftConnectionColor(existing?.visualColor??'')
 }
 function materializeConnectionWaypoint(choice:PlaceChoice):{placeId?:string;created?:TripPlace}{
   if(choice.mode==='NONE')return{}
   if(choice.mode==='EXISTING')return{placeId:choice.placeId}
   const name=choice.name.trim()
   if(!name)return{}
   const created=materializeNewPlaceChoice({...choice,name},crypto.randomUUID())
   return {placeId:created.id,created}
 }
 function saveConnection(){
   if(!editingPair)return
   const key=pairKey(editingPair.from,editingPair.to)
   const before=plans[key]
   const auto=draftConnectionSource==='ROUTE_API'
   const currentKey=auto?routeDraftKey(mapProvider.id,draftRouteMode,draftRouteWaypoints):null
   const requiresConfirmation=auto&&currentKey!==initialRouteDraftKey
   const expectedRequest=auto?routeRequestForChoices(editingPair,draftRouteWaypoints,draftRouteMode):null
   const freshResult=!!(draftRouteResult&&expectedRequest&&draftRouteResult.requestKey===routeRequestKey(expectedRequest))
   if(requiresConfirmation&&!freshResult)return
   const expectedDuration=!auto&&Number.isFinite(draftConnectionExpectedDuration)?Math.max(0,Math.min(10080,Math.round(draftConnectionExpectedDuration!))):undefined
   const user={name:draftConnectionName.trim()||undefined,memo:draftConnectionMemo.trim()||undefined,expectedDurationMinutes:expectedDuration}
   const createdPlaces:TripPlace[]=[]
   const resolveWaypoint=(choice:PlaceChoice)=>{
     const resolved=materializeConnectionWaypoint(choice)
     if(resolved.created)createdPlaces.push(resolved.created)
     return resolved.placeId
   }
   const segments:Segment[]=auto?[]:normalizeConnectionSegments(draftSegments.map((draft,index)=>{
     const {waypoint,...segment}=draft
     if(index===draftSegments.length-1)return segment
     const placeId=resolveWaypoint(waypoint)
     return placeId?{...segment,waypointPlaceId:placeId}:segment
   }))
   const autoPlaceIds=auto?draftRouteWaypoints.map(resolveWaypoint).filter((id):id is string=>!!id):[]
   const after:ConnectionPlan={
     id:key,
     fromNodeKey:editingPair.from.key,
     toNodeKey:editingPair.to.key,
     source:draftConnectionSource,
     user:user.name||user.memo||user.expectedDurationMinutes!==undefined?user:undefined,
     visualColor:draftConnectionColor||undefined,
     segments,
     routeIntent:auto?{provider:mapProvider.id,mode:draftRouteMode,...(freshResult&&draftRouteResult?{option:draftRouteResult.route.id}:currentKey===initialRouteDraftKey&&before?.routeIntent?.option?{option:before.routeIntent.option}:{}),...(autoPlaceIds.length?{waypointPlaceIds:autoPlaceIds}:{})}:undefined,
   }
   // Provider response is committed to SPA runtime only on Save; Cancel must not change an applied route.
   const expectedAutoRequest=expectedRequest
   if(auto&&draftRouteResult&&expectedAutoRequest&&draftRouteResult.requestKey===routeRequestKey(expectedAutoRequest)){
     setRouteRuntime(x=>({...x,[key]:draftRouteResult}))
   }
   if(JSON.stringify(before)!==JSON.stringify(after)||createdPlaces.length){
     if(createdPlaces.length)setPlaces(xs=>[...xs,...createdPlaces])
     setPlans(x=>({...x,[key]:after}))
     record({kind:'CONNECTION_EDIT',id:key,before,after,createdPlaces:createdPlaces.length?createdPlaces:undefined})
   }
   closeConnection()
 }
 function editDraftSegments(action:SetStateAction<ConnectionSegmentDraft[]>){
   setDraftConnectionSource('MANUAL')
   setDraftSegments(current=>normalizeConnectionDraft(typeof action==='function'?action(current):action))
 }
 function routeRequestForChoices(pair:{from:Node;to:Node},choices:readonly PlaceChoice[],mode:RouteMode=draftRouteMode):RouteRequest|null{
   const origin=places.find(p=>p.id===pair.from.exitPlaceId)?.position
   const destination=places.find(p=>p.id===pair.to.entryPlaceId)?.position
   if(!origin||!destination)return null
   const waypoints=[] as NonNullable<RouteRequest['waypoints']>[number][]
   for(const choice of choices){
     const point=choice.mode==='EXISTING'?places.find(p=>p.id===choice.placeId)?.position
       :choice.mode==='NEW'&&Number.isFinite(choice.lat)&&Number.isFinite(choice.lng)?{lat:choice.lat!,lng:choice.lng!}:undefined
     if(!point)return null
     waypoints.push(point)
   }
   return {origin,destination,mode,...(waypoints.length?{waypoints}:{})}
 }
 function currentRouteWaypointChoices():PlaceChoice[]{
   return draftConnectionSource==='ROUTE_API'?draftRouteWaypoints:
     draftSegments.slice(0,-1).map(segment=>segment.waypoint).filter(choice=>choice.mode!=='NONE')
 }
 function changeRouteMode(mode:RouteMode){
   if(mode===draftRouteMode||routeLoading)return
   closeRoutePicker()
   setDraftRouteMode(mode)
   setDraftRouteResult(null)
 }
 function editAutoWaypoints(action:SetStateAction<PlaceChoice[]>){
   closeRoutePicker()
   setDraftRouteResult(null)
   setDraftRouteWaypoints(current=>typeof action==='function'?action(current):action)
 }
 async function requestAutoRoute(){
   if(!editingPair||routeRequestGate.busy)return
   if(!routeModeSupported(mapProvider.capabilities,draftRouteMode)){
     setRouteError(text.errors.routeUnsupported);setRoutePickerOpen(true);return
   }
   const choices=currentRouteWaypointChoices()
   const request=routeRequestForChoices(editingPair,choices,draftRouteMode)
   setPendingRouteRequest(request)
   setPlaceSearchPreview(null)
   setRouteCandidates([]);setRoutePreview(null);setRouteError(null);setRoutePickerOpen(true)
   if(!request){setRouteError(text.errors.routeCoordinatesRequired);return}
   setRouteLoading(true)
   const result=await routeRequestGate.run(async ()=>{
     if(routeCacheTtlHours!==0){
       try{
         const cached=await readRouteCandidatesCache(tripRoute.tripId,tripRoute.mapProvider,request)
         if(cached.hit&&Array.isArray(cached.value)&&cached.value.every(route=>route.mode===request.mode))return cached.value
       }catch(error){console.warn('Route cache lookup failed; requesting provider route instead.',error)}
     }
     const routes=await searchRouteCandidates(mapProvider,request)
     if(routeCacheTtlHours!==0){
       try{await writeRouteCandidatesCache(tripRoute.tripId,tripRoute.mapProvider,request,routes)}
       catch(error){console.warn('Route cache write failed; preserving current session route.',error)}
     }
     return routes
   })
   if(result.status==='BUSY'||result.status==='CANCELLED')return
   setRouteLoading(false)
   if(result.status==='FAILED'){setRouteError(routeSearchErrorMessage(result.error));return}
   setRouteCandidates(result.value)
 }
 function previewAutoRoute(id:string){if(!editingPair)return;const route=routeCandidates.find(x=>x.id===id);if(route)setRoutePreview({pairId:pairKey(editingPair.from,editingPair.to),route})}

 function applyAutoRoute(){
   if(!routePreview||!editingPair||!pendingRouteRequest)return
   const request=pendingRouteRequest
   const choices=currentRouteWaypointChoices()
   const {pairId,route}=routePreview
   setDraftRouteResult({requestKey:routeRequestKey(request),request,route})
   setDraftRouteWaypoints(choices)
   setDraftSegments([])
   setDraftConnectionSource('ROUTE_API')
   routeRequestGate.cancel()
   setPendingRouteRequest(null)
   setRoutePickerOpen(false)
   setRouteCandidates([])
   setRouteError(null)
   setRoutePreview(null)
 }
 function deleteAutoRoute(){
   if(!editingPair)return
   setDraftConnectionSource('MANUAL')
   setDraftRouteResult(null)
   setDraftRouteWaypoints([])
   setDraftSegments([])
 }
 function openMapPath(target:MapPathTarget){
   if(target.kind==='MAJOR_TRANSPORT'){setEditingTransportId(target.transportId);return}
   openConnection(target.from,target.to)
 }


 function scheduleVisit(visit:VisitData,payload:TimelineDropPayload){
   setExternalDrag(null)
   if(payload.source==='BUCKET'){
     const bucketIndex=bucketItems.findIndex(x=>x.id===payload.sourceId),item=bucketItems[bucketIndex]
     if(!item)return
     const fixed=item.constraints?.fixedStart,duration=Math.max(MIN_VISIT,item.duration??visit.end-visit.start),start=fixed??visit.start
     const placed={...visit,start,end:start+duration,placeId:item.placeId,title:item.title,detail:item.detail,notes:item.notes,durationExplicit:item.durationExplicit,visualColor:item.visualColor,visitIcon:item.visitIcon,expectedCost:item.expectedCost,checklist:item.checklist,attachments:item.attachments,planningKind:item.planningKind,constraints:item.constraints,source:{kind:'BUCKET' as const,bucketItemId:item.id,bucketIndex,meta:item.meta}}
     setVisits(x=>[...x,placed]);setBucketItems(x=>x.filter(v=>v.id!==item.id));record({kind:'VISIT_SCHEDULE',visit:placed,bucketItem:item,bucketIndex});return
   }
   if(payload.source==='BASE'){
     const base=bases.find(x=>x.id===payload.sourceId);if(!base)return
     const placed={...visit,placeId:base.placeId,title:base.title,detail:base.detail,notes:base.notes,visitIcon:base.visitIcon,expectedCost:base.expectedCost,checklist:base.checklist,attachments:base.attachments,source:{kind:'BASE' as const,baseId:base.id}}
     setVisits(x=>[...x,placed]);record({kind:'VISIT_SCHEDULE',visit:placed});return
   }
   setVisits(x=>[...x,visit]);record({kind:'VISIT_SCHEDULE',visit})
 }
 function unscheduleVisit(visit:VisitData){moveVisitToPlacement(visit,'BUCKET')}
 function placementSnapshot(){return {bucketItems:structuredClone(bucketItems),bases:structuredClone(bases),visits:structuredClone(visits)}}
 function commitPlacement(after:{bucketItems:BucketItem[];bases:TripBase[];visits:VisitData[]}){
   const before=placementSnapshot()
   if(JSON.stringify(before)===JSON.stringify(after))return
   setBucketItems(after.bucketItems);setBases(after.bases);setVisits(after.visits);record({kind:'PLACEMENT_CONVERT',before,after:structuredClone(after)})
 }
 function bucketFromVisit(visit:VisitData,target:'BUCKET'|'PLAN_B'):BucketItem{
   const planningKind=target==='PLAN_B'?'NEARBY':'VISIT'
   return {id:visit.source?.kind==='BUCKET'?visit.source.bucketItemId:crypto.randomUUID(),placeId:visit.placeId,title:visit.title,meta:planningKind==='NEARBY'?text.schedule.nearby:text.schedule.visitIntent,detail:visit.detail,notes:visit.notes,duration:Math.max(MIN_VISIT,visit.end-visit.start),durationExplicit:visit.durationExplicit,visualColor:visit.visualColor,visitIcon:visit.visitIcon,expectedCost:visit.expectedCost,checklist:visit.checklist,attachments:visit.attachments,visitId:visit.id,planningKind,constraints:visit.constraints}
 }
 function baseFromSchedule(source:{placeId?:string;title?:string;detail?:string;notes?:string;visitIcon?:VisitData['visitIcon'];expectedCost?:VisitData['expectedCost'];checklist?:VisitData['checklist'];attachments?:VisitData['attachments']},duration?:number,id?:string):TripBase|null{
   if(!source.placeId)return null
   return {id:id??crypto.randomUUID(),placeId:source.placeId,title:source.title,meta:text.base.meta,detail:source.detail,notes:source.notes,duration,visitIcon:source.visitIcon,expectedCost:source.expectedCost,checklist:source.checklist,attachments:source.attachments}
 }
 function moveVisitToPlacement(visit:VisitData,target:'BUCKET'|'PLAN_B'|'BASE'|'DELETE'){
   setFreeDropState({target:'NONE',visitId:null})
   if(target==='DELETE'){record({kind:'VISIT_DELETE',visit});setVisits(xs=>xs.filter(v=>v.id!==visit.id));return}
   const nextVisits=visits.filter(v=>v.id!==visit.id),nextBuckets=[...bucketItems],nextBases=[...bases]
   if(target==='BASE'){
     if(visit.source?.kind==='BASE'){const sourceBaseId=visit.source.baseId;if(bases.some(base=>base.id===sourceBaseId)){commitPlacement({bucketItems:nextBuckets,bases:nextBases,visits:nextVisits});return}}
     const base=baseFromSchedule(visit,Math.max(MIN_VISIT,visit.end-visit.start));if(!base)return
     nextBases.push(base);commitPlacement({bucketItems:nextBuckets,bases:nextBases,visits:nextVisits});return
   }
   const item=bucketFromVisit(visit,target),index=visit.source?.kind==='BUCKET'?visit.source.bucketIndex:nextBuckets.length
   commitPlacement({bucketItems:insertBucketItem(nextBuckets,item,index),bases:nextBases,visits:nextVisits})
 }
 function trashPayload(payload:TimelineDropPayload){
   setExternalDrag(null);setFreeDropState({target:'NONE',visitId:null})
   if(payload.source==='BUCKET'){const index=bucketItems.findIndex(x=>x.id===payload.sourceId),item=bucketItems[index];if(!item)return;record({kind:'BUCKET_DELETE',item,index});setBucketItems(xs=>xs.filter(x=>x.id!==item.id));return}
   if(payload.source==='BASE'){const index=bases.findIndex(x=>x.id===payload.sourceId),base=bases[index];if(!base)return;record({kind:'BASE_DELETE',base,index});setBases(xs=>xs.filter(x=>x.id!==base.id))}
 }

 function movePayloadToPlacement(payload:TimelineDropPayload,target:'BUCKET'|'PLAN_B'|'BASE'){
   setExternalDrag(null)
   if(payload.source==='BUCKET'){
     const item=bucketItems.find(x=>x.id===payload.sourceId);if(!item)return
     if(target==='BASE'){
       const base=baseFromSchedule(item,item.duration,item.id);if(!base)return
       commitPlacement({bucketItems:bucketItems.filter(x=>x.id!==item.id),bases:[...bases.filter(x=>x.id!==base.id),base],visits:[...visits]});return
     }
     const planningKind:BucketItem['planningKind']=target==='PLAN_B'?'NEARBY':'VISIT',after:BucketItem={...item,planningKind,meta:planningKind==='NEARBY'?text.schedule.nearby:text.schedule.visitIntent}
     commitPlacement({bucketItems:bucketItems.map(x=>x.id===item.id?after:x),bases:[...bases],visits:[...visits]});return
   }
   if(payload.source==='BASE'){
     const base=bases.find(x=>x.id===payload.sourceId);if(!base||target==='BASE')return
     const planningKind=target==='PLAN_B'?'NEARBY':'VISIT'
     const item:BucketItem={id:base.id,placeId:base.placeId,title:base.title,detail:base.detail,notes:base.notes,duration:base.duration,durationExplicit:base.duration!==undefined,visitIcon:base.visitIcon,expectedCost:base.expectedCost,checklist:base.checklist,attachments:base.attachments,meta:planningKind==='NEARBY'?text.schedule.nearby:text.schedule.visitIntent,planningKind}
     commitPlacement({bucketItems:[...bucketItems.filter(x=>x.id!==item.id),item],bases:bases.filter(x=>x.id!==base.id),visits:[...visits]})
   }
 }

 function resolveEditedPlace(choice:PlaceChoice){const r=resolvePlace(choice);return {placeId:r.placeId,createdPlace:r.created}}
 function saveBucketItem(after:BucketItem,choice:PlaceChoice){if(!editingBucketItem)return;const before=editingBucketItem,r=resolveEditedPlace(choice),normalized={...after,placeId:r.placeId};if(JSON.stringify(before)!==JSON.stringify(normalized)||r.createdPlace){if(r.createdPlace)setPlaces(xs=>[...xs,r.createdPlace!]);record({kind:'BUCKET_EDIT',before,after:normalized,createdPlace:r.createdPlace});setBucketItems(xs=>xs.map(x=>x.id===normalized.id?normalized:x))}setPlaceSearchPreview(null);setEditingBucketItemId(null)}
 function saveBase(after:TripBase,choice:PlaceChoice){if(!editingBase)return;const before=editingBase,r=resolveEditedPlace(choice);if(!r.placeId)return;const normalized={...after,placeId:r.placeId};if(JSON.stringify(before)!==JSON.stringify(normalized)||r.createdPlace){if(r.createdPlace)setPlaces(xs=>[...xs,r.createdPlace!]);record({kind:'BASE_EDIT',before,after:normalized,createdPlace:r.createdPlace});setBases(xs=>xs.map(x=>x.id===normalized.id?normalized:x))}setPlaceSearchPreview(null);setEditingBaseId(null)}
 function saveVisit(after:VisitData,choice:PlaceChoice){if(!editingVisit)return;const before=editingVisit,r=resolveEditedPlace(choice),withPlace={...after,placeId:r.placeId};const normalized=withPlace.constraints?.fixedStart!==undefined?{...withPlace,constraints:{...withPlace.constraints,fixedStart:withPlace.start}}:withPlace;if(JSON.stringify(before)!==JSON.stringify(normalized)||r.createdPlace){if(r.createdPlace)setPlaces(xs=>[...xs,r.createdPlace!]);record({kind:'VISIT_EDIT',before,after:normalized,createdPlace:r.createdPlace});setVisits(xs=>xs.map(x=>x.id===normalized.id?normalized:x))}setPlaceSearchPreview(null);setEditingVisitId(null)}
 function saveTransportDraft(d:TransportDraft){
   if(!editingTransport)return
   const resolve=(choice:TransportDraft['departurePlace'])=>{
     if(choice.mode==='EXISTING')return {place:places.find(p=>p.id===choice.placeId)!,created:undefined as TripPlace|undefined}
     if(choice.mode==='NEW'){
       const created=materializeNewPlaceChoice(choice,crypto.randomUUID())
       return {place:created,created}
     }
     throw new Error(text.errors.physicalPlaceRequired)
   }
   const before=editingTransport,dr=resolve(d.departurePlace),ar=resolve(d.arrivalPlace),dp=dr.place,ap=ar.place
   const userTitle=d.title.trim()||undefined;const after:MajorTransportData={...before,mode:d.mode,serviceNumber:d.serviceNumber,seat:d.seat,memo:d.memo,userTitle,visualColor:d.visualColor,collapsedRange:d.collapsedRange,occupiedFrom:d.departureAt,occupiedUntil:d.arrivalAt,departure:{...before.departure,placeId:dp.id,place:dp.name,departureAt:d.departureAt},arrival:{...before.arrival,placeId:ap.id,place:ap.name,arrivalAt:d.arrivalAt},onboard:{...before.onboard,title:userTitle||d.serviceNumber||`${dp.name} → ${ap.name}`,route:`${dp.name} → ${ap.name}`,icon:iconFor(d.mode)}}
   const createdPlaces=[dr.created,ar.created].filter((place):place is TripPlace=>!!place)
   if(JSON.stringify(before)!==JSON.stringify(after)||createdPlaces.length){
     if(createdPlaces.length)setPlaces(xs=>[...xs,...createdPlaces])
     setTransports(xs=>xs.map(x=>x.id===after.id?after:x))
     record({kind:'TRANSPORT_EDIT',before,after,createdPlaces:createdPlaces.length?createdPlaces:undefined})
   }
   setPlaceSearchPreview(null)
   setEditingTransportId(null)
 }

 function deleteBucketItem(){if(!editingBucketItem)return;const index=bucketItems.findIndex(x=>x.id===editingBucketItem.id);record({kind:'BUCKET_DELETE',item:editingBucketItem,index});setBucketItems(xs=>xs.filter(x=>x.id!==editingBucketItem.id));setEditingBucketItemId(null)}
 function deleteVisit(){if(!editingVisit)return;record({kind:'VISIT_DELETE',visit:editingVisit});setVisits(xs=>xs.filter(x=>x.id!==editingVisit.id));setEditingVisitId(null)}
 function deleteBase(){if(!editingBase)return;const index=bases.findIndex(x=>x.id===editingBase.id);record({kind:'BASE_DELETE',base:editingBase,index});setBases(xs=>xs.filter(x=>x.id!==editingBase.id));setEditingBaseId(null)}
 function deleteTransport(){if(!editingTransport)return;record({kind:'TRANSPORT_DELETE',transport:editingTransport});setTransports(xs=>xs.filter(x=>x.id!==editingTransport.id));setPlaceSearchPreview(null);setEditingTransportId(null)}

 function addLabel(label:TimelineLabel){setLabels(xs=>[...xs.filter(x=>x.id!==label.id),label].sort((a,b)=>a.at-b.at));record({kind:'LABEL_ADD',label})}
 function editLabel(x:{id:string;before:string;after:string}){setLabels(xs=>xs.map(label=>label.id===x.id?{...label,text:x.after}:label));record({kind:'LABEL_EDIT',...x})}
 function deleteLabel(label:TimelineLabel){setLabels(xs=>xs.filter(x=>x.id!==label.id));record({kind:'LABEL_DELETE',label})}

 function externalDragStart(payload:TimelineDropPayload,e:ReactDragEvent<HTMLElement>){setExternalDrag({payload,clientX:e.clientX,clientY:e.clientY,preview:null})}
 function externalDragMove(e:ReactDragEvent<HTMLElement>){if(!e.clientX&&!e.clientY)return;setExternalDrag(current=>current?{...current,clientX:e.clientX,clientY:e.clientY}:current)}
 function externalDragEnd(){setExternalDrag(null)}
 function externalPreviewChange(preview:ExternalTimelinePreview){setExternalDrag(current=>current?{...current,preview}:current)}

 const placementTarget=freeDropState.target==='BUCKET'||freeDropState.target==='PLAN_B'||freeDropState.target==='BASE'?freeDropState.target:null
 const freeVisit=placementTarget&&freeDropState.visitId?visits.find(v=>v.id===freeDropState.visitId):undefined
 let bucketReturnPreview:BucketReturnPreview|null=null
 if(freeVisit&&placementTarget){
   bucketReturnPreview={target:placementTarget,title:scheduleName(freeVisit),detail:placementTarget==='BASE'?text.base.returnDetail:freeVisit.detail,planningKind:placementTarget==='PLAN_B'?'NEARBY':'VISIT',...(freeVisit.source?.kind==='BASE'?{baseId:freeVisit.source.baseId}:{}),...(freeVisit.source?.kind==='BUCKET'?{index:freeVisit.source.bucketIndex}:{})}
 }
 const editingRuntimeRoute=editingPair?(()=>{const key=pairKey(editingPair.from,editingPair.to),runtime=draftRouteResult??routeRuntime[key],request=draftConnectionSource==='ROUTE_API'?routeRequestForChoices(editingPair,draftRouteWaypoints,draftRouteMode):savedConnectionRouteRequest(editingPair,places,plans[key]);return runtime&&request&&routeRuntimeMatches(runtime,request,plans[key]?.routeIntent?.option)?runtime.route:null})():null
 const currentRouteDraftKey=draftConnectionSource==='ROUTE_API'?routeDraftKey(mapProvider.id,draftRouteMode,draftRouteWaypoints):null
 const routeIntentNeedsConfirmation=draftConnectionSource==='ROUTE_API'&&currentRouteDraftKey!==initialRouteDraftKey
 const currentDraftRequest=editingPair&&draftConnectionSource==='ROUTE_API'?routeRequestForChoices(editingPair,draftRouteWaypoints,draftRouteMode):null
 const hasFreshDraftRoute=!!(draftRouteResult&&currentDraftRequest&&draftRouteResult.requestKey===routeRequestKey(currentDraftRequest))
 const routeSaveBlockedReason=routeIntentNeedsConfirmation&&!hasFreshDraftRoute?text.errors.routeRefreshRequired:null
 const captureVisits=captureMode&&captureDayStart!==null?visits.filter(visit=>visit.end>captureDayStart&&visit.start<captureDayStart+DAY):visits
 const captureTransports=captureMode&&captureDayStart!==null?transports.filter(transport=>transport.occupiedUntil>captureDayStart&&transport.occupiedFrom<captureDayStart+DAY):transports
 const timelineLocationCandidates=[...visits.flatMap(visit=>{const point=visit.placeId?places.find(place=>place.id===visit.placeId)?.position:undefined;return point?[{at:visit.start,point,id:visit.placeId!}]:[]}),...transports.flatMap(transport=>{const out=[] as {at:number;point:{lat:number;lng:number};id:string}[];const dep=places.find(place=>place.id===transport.departure.placeId)?.position,arr=places.find(place=>place.id===transport.arrival.placeId)?.position;if(dep)out.push({at:transport.occupiedFrom,point:dep,id:transport.departure.placeId});if(arr)out.push({at:transport.occupiedUntil,point:arr,id:transport.arrival.placeId});return out})].sort((a,b)=>a.at-b.at)
 const defaultMapPoint={lat:37.5665,lng:126.978}
 const initialMapCandidate=timelineLocationCandidates[0]
 const normalAutoFitPoints=[initialMapCandidate?.point??defaultMapPoint]
 const normalAutoFitKey=`initial:${tripRoute.tripId}:${initialMapCandidate?.id??'SEOUL'}:${normalAutoFitPoints[0].lat.toFixed(5)},${normalAutoFitPoints[0].lng.toFixed(5)}`
 const captureMapPoints=[...new Map([...captureVisits.flatMap(visit=>{const point=visit.placeId?places.find(place=>place.id===visit.placeId)?.position:undefined;return point?[[`${point.lat},${point.lng}`,point] as const]:[]}),...captureTransports.flatMap(transport=>[transport.departure.placeId,transport.arrival.placeId].flatMap(id=>{const point=places.find(place=>place.id===id)?.position;return point?[[`${point.lat},${point.lng}`,point] as const]:[]}))]).values()]
 const mapAutoFitPoints=captureMode?(captureMapPoints.length?captureMapPoints:normalAutoFitPoints):normalAutoFitPoints
 const mapAutoFitKey=captureMode?`capture:${captureDayStart??'none'}:${captureMapPoints.map(p=>`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|')}`:normalAutoFitKey
 const dragTrashVisible=!captureMode&&(!!externalDrag||!!freeDropState.visitId)
 const presentationNumbers=useMemo(()=>{const result:Record<string,number>={};captureVisits.slice().sort((a,b)=>a.start-b.start).forEach((visit,index)=>{if(visit.placeId&&result[visit.placeId]===undefined)result[visit.placeId]=index+1});return result},[captureVisits])


 if(loadState==='LOADING')return <div className="trip-storage-state"><strong>{text.appName}</strong><p>{text.errors.tripOpening}</p></div>
 if(loadState==='ERROR')return <div className="trip-storage-state error"><strong>{text.errors.tripOpenFailed}</strong><p>{storageError}</p><a href="/">{text.tripHome.back}</a></div>
 return <div className={`app${captureMode?' capture-mode':''}`} data-place-count={places.length}>
   {captureMode?<header className="topbar capture-topbar"><div className="presentation-heading"><span>{text.capture.subtitle}</span><strong>{tripName}</strong><small>{text.provider.label(tripRoute.mapProvider)} · {text.capture.summary(visits.length,places.length,transports.length)}</small></div><button className="toolbar-button capture-exit-button" type="button" onClick={()=>{setCaptureMode(false);setCaptureDayStart(null);recordTelemetry('UX_CAPTURE_EXIT',tripRoute.mapProvider)}}><span className="material-symbols-rounded">close_fullscreen</span>{text.capture.exit}</button></header>:<header className="topbar"><div className="brand"><strong>{text.appName}</strong><span>{text.provider.label(tripRoute.mapProvider)}</span></div><span className="trip-title">{tripName}</span><div className="history-controls"><a className="trip-list-link toolbar-button" href="/"><span className="material-symbols-rounded">arrow_back</span><span>{text.topbar.backToList}</span></a><button className="save-trip-button" type="button" disabled={!dirty||saving} onClick={()=>void saveTrip()}>{saving?text.topbar.saving:dirty?text.topbar.save:text.topbar.saved}</button><button disabled={!history.undo.length} onClick={undo} title={text.common.undo}><span className="material-symbols-rounded">undo</span></button><button disabled={!history.redo.length} onClick={redo} title={text.common.redo}><span className="material-symbols-rounded">redo</span></button><button className="add-schedule-button" onClick={()=>{setPlaceSearchPreview(null);setAddOpen(true)}}>＋ {text.topbar.addSchedule}</button><button className="toolbar-button icon-toolbar-button" type="button" title={text.capture.enter} aria-label={text.capture.enter} onClick={()=>{setCaptureMode(true);setCaptureDayStart(null);setMapSettingsOpen(false);setColorEditorOpen(false);recordTelemetry('UX_CAPTURE_ENTER',tripRoute.mapProvider)}}><span className="material-symbols-rounded">photo_camera</span></button><button className="toolbar-button icon-toolbar-button" type="button" title={text.topbar.tripSettings} aria-label={text.topbar.tripSettings} onClick={()=>setMapSettingsOpen(true)}><span className="material-symbols-rounded">settings</span></button></div></header>}
   {(storageError||hydrationWarning)&&<div className="trip-storage-banner">{storageError??hydrationWarning}</div>}
   {remoteRevisionAvailable!==null&&<div className="trip-storage-banner collaboration-banner"><span>{text.collaboration.remoteChanges}</span><button type="button" onClick={()=>window.location.reload()}>{text.collaboration.reload}</button></div>}
   {colorEditorOpen&&<DayPaletteEditor days={dayColors} visits={visits} transports={transports} onChange={setDayColor} onClose={()=>setColorEditorOpen(false)}/>}
   <main className={`workspace${captureMode?' capture-workspace':''}`}>
     {captureMode?<CaptureTimeline tripId={tripRoute.tripId} visits={visits} transports={transports} places={places} plans={plans} labels={labels} dayColors={dayColors} onDayChange={setCaptureDayStart}/>:<Timeline transports={transports} places={places} highlightedPlaceId={hoveredPlaceId??selectedPlaceId} onPlaceHover={setHoveredPlaceId} visits={visits} setVisits={setVisits} labels={labels} setLabels={setLabels} plans={plans} routeRuntime={routeRuntime} dayColors={dayColors} viewSettings={timelineView} onViewSettingsChange={setTimelineView} dayColorsOpen={colorEditorOpen} onToggleDayColors={()=>setColorEditorOpen(x=>!x)} onConnectionClick={openConnection} onVisitCommit={x=>record({kind:'VISIT',...x})} onVisitCreate={scheduleVisit} onVisitUnschedule={unscheduleVisit} onVisitPlacementDrop={moveVisitToPlacement} onVisitClick={x=>setEditingVisitId(x.id)} onTransportClick={x=>setEditingTransportId(x.id)} onTransportHover={setHoveredTransportId} onLabelMoveCommit={x=>record({kind:'LABEL_MOVE',...x})} onLabelAdd={addLabel} onLabelEdit={editLabel} onLabelDelete={deleteLabel} onFreeDropTargetChange={setFreeDropState} externalDragPayload={externalDrag?.payload??null} onExternalPreviewChange={externalPreviewChange}/>}
     <MapPanel renderer={mapProvider.renderer} appearanceSettings={appearanceSettings} places={places} bucketItems={captureMode?[]:bucketItems} bases={captureMode?[]:bases} visits={captureVisits} transports={captureTransports} plans={plans} routePreview={routePreview} routeRuntime={routeRuntime} dayColors={dayColors} mapSettings={mapSettings} hoveredPlaceId={hoveredPlaceId} hoveredTransportId={hoveredTransportId} selectedPlaceId={selectedPlaceId} focusRequest={mapFocusRequest} previewCandidate={placeSearchPreview} presentationNumbers={captureMode?presentationNumbers:undefined} autoFitPoints={mapAutoFitPoints} autoFitKey={mapAutoFitKey} trashVisible={dragTrashVisible} trashActive={freeDropState.target==='DELETE'} onTrashDrop={trashPayload} onAddPoi={captureMode?undefined:addMapPoi} onPlaceHover={setHoveredPlaceId} onPlaceSelect={setSelectedPlaceId} onPathSelect={openMapPath} onEditBucketItem={setEditingBucketItemId} onEditVisit={setEditingVisitId} onEditBase={setEditingBaseId} onEditTransport={setEditingTransportId}/>
     {!captureMode&&<Bucket places={places} planBColor={appearanceSettings.planBColor} bucketItems={bucketItems} bases={bases} onBucketItemClick={x=>setEditingBucketItemId(x.id)} onBaseClick={x=>setEditingBaseId(x.id)} returnPreview={bucketReturnPreview} activeDropTarget={freeDropState.target} activeExternalDragSourceId={externalDrag?.payload.sourceId??null} dragActive={!!externalDrag||!!freeDropState.visitId} highlightedPlaceId={hoveredPlaceId??selectedPlaceId} onPlaceHover={setHoveredPlaceId} onExternalDragStart={externalDragStart} onExternalDragMove={externalDragMove} onExternalDragEnd={externalDragEnd} onPlacementDrop={movePayloadToPlacement}/>}
   </main>

   {mapSettingsOpen&&<TripSettingsModal tripId={tripRoute.tripId} auth={auth} value={mapSettings} onChange={setMapSettings} appearance={appearanceSettings} onAppearanceChange={setAppearanceSettings} pinRefreshBusy={pinRefreshBusy} pinRefreshMessage={pinRefreshMessage} onRefreshPins={()=>void refreshPins()} onClose={()=>setMapSettingsOpen(false)}/>}
   {externalDrag&&<ExternalDragGhost drag={externalDrag}/>} 
   {addOpen&&<AddScheduleModal tripId={tripRoute.tripId} places={places} placeSearch={mapProvider.capabilities.placeSearch?mapProvider.places:undefined} onPreviewPlaceCandidate={setPlaceSearchPreview} onClose={closeAddSchedule} onCreatePlacePlan={createPlacePlan} onCreateTransport={createTransport}/>} 
   {editingTransport&&<MajorTransportModal transport={editingTransport} places={places} placeSearch={mapProvider.capabilities.placeSearch?mapProvider.places:undefined} onPreviewPlaceCandidate={setPlaceSearchPreview} onClose={()=>{setPlaceSearchPreview(null);setEditingTransportId(null)}} onSave={saveTransportDraft} onDelete={deleteTransport}/>} 
   {editingPair&&<ConnectionModal pair={editingPair} draft={draftSegments} setDraft={editDraftSegments} source={draftConnectionSource} autoWaypoints={draftRouteWaypoints} setAutoWaypoints={editAutoWaypoints} runtimeRoute={editingRuntimeRoute} routeMode={draftRouteMode} routeCapabilities={mapProvider.capabilities} routeLoading={routeLoading} saveBlockedReason={routeSaveBlockedReason} onRouteModeChange={changeRouteMode} connectionName={draftConnectionName} setConnectionName={setDraftConnectionName} connectionMemo={draftConnectionMemo} setConnectionMemo={setDraftConnectionMemo} expectedDurationMinutes={draftConnectionExpectedDuration} setExpectedDurationMinutes={setDraftConnectionExpectedDuration} visualColor={draftConnectionColor} setVisualColor={setDraftConnectionColor} places={places} placeSearch={mapProvider.capabilities.placeSearch?mapProvider.places:undefined} onPreviewPlaceCandidate={setPlaceSearchPreview} onDeleteAutoRoute={deleteAutoRoute} onClose={closeConnection} onSave={saveConnection} onAuto={requestAutoRoute}/>} 
   {routePickerOpen&&editingPair&&<RoutePicker pair={editingPair} mode={draftRouteMode} routes={routeCandidates} loading={routeLoading} error={routeError} selectedId={routePreview?.route.id??null} onPreview={previewAutoRoute} onApply={applyAutoRoute} onClose={closeRoutePicker}/>} 
   {editingBucketItem&&<BucketItemModal tripId={tripRoute.tripId} item={editingBucketItem} places={places} placeSearch={mapProvider.capabilities.placeSearch?mapProvider.places:undefined} onPreviewPlaceCandidate={setPlaceSearchPreview} onClose={()=>{setPlaceSearchPreview(null);setEditingBucketItemId(null)}} onSave={saveBucketItem} onDelete={deleteBucketItem} onFocusPlace={requestMapFocus} canFocusPlace={canFocusPlace}/>} 
   {editingBase&&<BaseModal tripId={tripRoute.tripId} base={editingBase} places={places} placeSearch={mapProvider.capabilities.placeSearch?mapProvider.places:undefined} onPreviewPlaceCandidate={setPlaceSearchPreview} onClose={()=>{setPlaceSearchPreview(null);setEditingBaseId(null)}} onSave={saveBase} onDelete={deleteBase} onFocusPlace={requestMapFocus} canFocusPlace={canFocusPlace}/>} 
   {editingVisit&&<VisitModal tripId={tripRoute.tripId} visit={editingVisit} places={places} placeSearch={mapProvider.capabilities.placeSearch?mapProvider.places:undefined} onPreviewPlaceCandidate={setPlaceSearchPreview} onClose={()=>{setPlaceSearchPreview(null);setEditingVisitId(null)}} onSave={saveVisit} onDelete={deleteVisit} onFocusPlace={requestMapFocus} canFocusPlace={canFocusPlace}/>} 
 </div>
}

function TripHome({auth,onLogout}:{auth:Extract<AuthStatus,{authenticated:true}>;onLogout:()=>void}){
  const canCreateTrips=auth.role==='ADMIN'||auth.permissions?.canCreateTrips!==false
  const [trips,setTrips]=useState<TripSummary[]>([])
  const [name,setName]=useState('')
  const [loading,setLoading]=useState(true)
  const [creating,setCreating]=useState(false)
  const [deletingId,setDeletingId]=useState<string|null>(null)
  const [error,setError]=useState<string|null>(null)
  useEffect(()=>{let cancelled=false;void tripRepository.list().then(items=>{if(!cancelled)setTrips(items)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:text.errors.tripListFailed)}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[])
  async function createTrip(){
    const trimmed=name.trim();if(!trimmed||creating||!canCreateTrips)return
    setCreating(true);setError(null)
    try{const created=await tripRepository.create(trimmed,'GOOGLE');window.location.assign(`/goo/${encodeURIComponent(created.snapshot.tripId)}`)}
    catch(e){setError(e instanceof Error?e.message:text.errors.tripCreateFailed);setCreating(false)}
  }
  async function deleteTrip(trip:TripSummary){
    if(auth.role!=='ADMIN'||deletingId)return
    if(!window.confirm(text.tripHome.deleteConfirm(trip.name)))return
    setDeletingId(trip.tripId);setError(null)
    try{await tripRepository.delete(trip.tripId);setTrips(items=>items.filter(item=>item.tripId!==trip.tripId))}
    catch(e){setError(e instanceof Error?e.message:text.tripHome.deleteFailed)}
    finally{setDeletingId(null)}
  }
  return <main className="trip-home">
    <section className="trip-home-card"><div className="trip-home-account"><div className="brand"><strong>{text.appName}</strong><span>{auth.username}</span></div><div>{auth.role==='ADMIN'&&<a className="toolbar-button" href="/man"><span className="material-symbols-rounded">admin_panel_settings</span>{text.topbar.management}</a>}<button className="toolbar-button" type="button" onClick={onLogout}><span className="material-symbols-rounded">logout</span>{text.common.logout}</button></div></div><h1>{text.tripHome.title}</h1><p>{text.tripHome.description}</p>
      <form onSubmit={e=>{e.preventDefault();void createTrip()}}><input value={name} onChange={e=>setName(e.target.value)} maxLength={120} placeholder={text.tripHome.newTripPlaceholder} disabled={!canCreateTrips}/><button disabled={!canCreateTrips||!name.trim()||creating}>{creating?text.tripHome.creating:text.tripHome.createGoogle}</button></form>{!canCreateTrips&&<div className="trip-home-error">{text.tripHome.createDenied}</div>}{error&&<div className="trip-home-error">{error}</div>}
    </section>
    <section className="trip-home-list"><h2>{text.tripHome.listTitle}</h2>{loading?<p>{text.common.loading}</p>:trips.length===0?<p>{text.tripHome.empty}</p>:trips.map(trip=><article className="trip-home-list-item" key={trip.tripId}><a href={`/${trip.mapProvider==='GOOGLE'?'goo':'nav'}/${encodeURIComponent(trip.tripId)}`}><strong>{trip.name}</strong><span>{text.provider.label(trip.mapProvider)} · {text.tripHome.revision(trip.revision)}</span></a>{auth.role==='ADMIN'&&<button className="trip-delete-button" type="button" disabled={deletingId===trip.tripId} onClick={()=>void deleteTrip(trip)} title={text.tripHome.delete}><span className="material-symbols-rounded">delete</span>{deletingId===trip.tripId?text.tripHome.deleting:text.tripHome.delete}</button>}</article>)}</section>
  </main>
}

function AuthenticatedApp({auth,onAuthChange}:{auth:Extract<AuthStatus,{authenticated:true}>;onAuthChange:(status:AuthStatus)=>void}){
  const [runtimeConfig,setRuntimeConfig]=useState<RuntimeConfig|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{let cancelled=false;void authApi.runtimeConfig().then(config=>{if(!cancelled)setRuntimeConfig(config)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:text.errors.runtimeMapConfigFailed)});return()=>{cancelled=true}},[])
  async function logout(){try{await authApi.logout()}finally{onAuthChange({authenticated:false})}}
  if(window.location.pathname==='/man')return auth.role==='ADMIN'?<ManagementPage auth={auth} onAuthChange={onAuthChange}/>:<main className="trip-storage-state error"><strong>{text.errors.adminRequired}</strong><a href="/">{text.tripHome.back}</a></main>
  if(error)return <main className="trip-storage-state error"><strong>{text.errors.runtimeConfigUnavailable}</strong><p>{error}</p><button onClick={()=>void logout()}>{text.common.logout}</button></main>
  if(!runtimeConfig)return <main className="trip-storage-state"><strong>{text.appName}</strong><p>{text.tripHome.checkingAccess}</p></main>
  const tripRoute=parseTripMapRoute(window.location.pathname)
  return tripRoute?<TripEditor tripRoute={tripRoute} runtimeConfig={runtimeConfig} auth={auth}/>:<TripHome auth={auth} onLogout={()=>void logout()}/>
}

function App(){
  const [auth,setAuth]=useState<AuthStatus|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{let cancelled=false;void authApi.status().then(status=>{if(!cancelled)setAuth(status)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:text.errors.authServerFailed)});return()=>{cancelled=true}},[])
  if(error)return <main className="auth-page"><section className="auth-card"><h1>{text.errors.serverConnection}</h1><div className="auth-error">{error}</div></section></main>
  if(auth===null)return <main className="auth-page"><section className="auth-card"><div className="brand"><strong>{text.appName}</strong><span>{text.auth.checkingAccess}</span></div></section></main>
  if(!auth.authenticated)return <LoginPage onAuthenticated={setAuth}/>
  if(auth.role==='ADMIN'&&auth.mustChangeAdminPassword)return <AdminBootstrapPage status={auth} onUpdated={setAuth}/>
  if(auth.role==='USER'&&auth.mustChangePassword)return <ForcedPasswordChangePage onUpdated={setAuth}/>
  return <AuthenticatedApp auth={auth} onAuthChange={setAuth}/>
}

function TripSettingsModal({tripId,auth,value,onChange,appearance,onAppearanceChange,pinRefreshBusy,pinRefreshMessage,onRefreshPins,onClose}:{tripId:string;auth:Extract<AuthStatus,{authenticated:true}>;value:TripMapSettings;onChange:(value:TripMapSettings)=>void;appearance:TripAppearanceSettings;onAppearanceChange:(value:TripAppearanceSettings)=>void;pinRefreshBusy:boolean;pinRefreshMessage:string|null;onRefreshPins:()=>void;onClose:()=>void}){
  const [users,setUsers]=useState<ManagedUser[]>([])
  const [access,setAccess]=useState<TripAccessConfig|null>(null)
  const [draftAccess,setDraftAccess]=useState<TripAccessConfig|null>(null)
  const [accessError,setAccessError]=useState('')
  const [accessBusy,setAccessBusy]=useState(false)
  useEffect(()=>{
    if(auth.role!=='ADMIN')return
    let cancelled=false
    void Promise.all([authApi.users(),authApi.tripAccess(tripId)]).then(([u,a])=>{if(cancelled)return;setUsers(u.users);setAccess(a);setDraftAccess({accessMode:a.accessMode,allowedUserIds:[...a.allowedUserIds]})}).catch(e=>{if(!cancelled)setAccessError(e instanceof Error?e.message:text.errors.tripAccessLoadFailed)})
    return()=>{cancelled=true}
  },[auth.role,tripId])
  const activeUsers=users.filter(user=>user.status==='ACTIVE')
  const accessDirty=!!(access&&draftAccess&&(access.accessMode!==draftAccess.accessMode||JSON.stringify([...access.allowedUserIds].sort())!==JSON.stringify([...draftAccess.allowedUserIds].sort())))
  function toggleUser(userId:string){setDraftAccess(current=>current?{...current,accessMode:'RESTRICTED',allowedUserIds:current.allowedUserIds.includes(userId)?current.allowedUserIds.filter(id=>id!==userId):[...current.allowedUserIds,userId]}:current)}
  async function saveAccess(){if(!draftAccess||accessBusy)return;setAccessBusy(true);setAccessError('');try{const saved=await authApi.setTripAccess(tripId,draftAccess);setAccess(saved);setDraftAccess({accessMode:saved.accessMode,allowedUserIds:[...saved.allowedUserIds]})}catch(e){setAccessError(e instanceof Error?e.message:text.errors.tripAccessSaveFailed)}finally{setAccessBusy(false)}}
  return <div className="modal-backdrop" onPointerDown={onClose}><section className="map-settings-modal trip-settings-modal" onPointerDown={e=>e.stopPropagation()}><header><div><small>{text.tripSettings.eyebrow}</small><strong>{text.tripSettings.title}</strong></div><button type="button" onClick={onClose} aria-label={text.common.close}><span className="material-symbols-rounded">close</span></button></header><div className="map-settings-body">
    <section className="trip-settings-section"><h3>{text.tripSettings.mapSection}</h3><label><span>{text.tripSettings.pathThickness}</span><small>{text.tripSettings.pathThicknessHelp}</small></label><label className="map-width-input"><input aria-label={text.tripSettings.pathThickness} type="number" inputMode="numeric" min={MIN_CONNECTION_WIDTH_PX} max={MAX_CONNECTION_WIDTH_PX} step="1" value={value.connectionWidthPx} onChange={e=>onChange({...value,connectionWidthPx:normalizeConnectionWidthPx(e.target.value)})}/><span>px</span><small>{MIN_CONNECTION_WIDTH_PX}–{MAX_CONNECTION_WIDTH_PX}px</small></label><p>{text.tripSettings.zoomNote}</p><div className="pin-refresh-setting"><div><strong>{text.tripSettings.pinRefreshTitle}</strong><small>{text.tripSettings.pinRefreshHelp}</small></div><button type="button" disabled={pinRefreshBusy} onClick={onRefreshPins}><span className="material-symbols-rounded">refresh</span>{pinRefreshBusy?text.tripSettings.pinRefreshing:text.tripSettings.pinRefresh}</button>{pinRefreshMessage&&<small className="pin-refresh-result">{pinRefreshMessage}</small>}</div></section>
    <section className="trip-settings-section"><h3>{text.tripSettings.appearanceSection}</h3><label><span>{text.tripSettings.planBColor}</span><small>{text.tripSettings.planBColorHelp}</small></label><div className="plan-b-color-setting"><input type="color" aria-label={text.tripSettings.planBColor} value={appearance.planBColor} onChange={e=>onAppearanceChange({...appearance,planBColor:e.target.value.toUpperCase()})}/><code>{appearance.planBColor}</code><button type="button" onClick={()=>onAppearanceChange({...DEFAULT_TRIP_APPEARANCE})}>{text.tripSettings.planBColorReset}</button></div></section>
    <section className="trip-settings-section"><h3>{text.tripSettings.accessSection}</h3><p>{text.tripSettings.accessHelp}</p>{auth.role!=='ADMIN'?<small>{text.tripSettings.adminOnly}</small>:!draftAccess?<small>{text.common.loading}</small>:<><div className="trip-access-mode"><label><input type="radio" name="trip-access-mode" checked={draftAccess.accessMode==='OPEN'} onChange={()=>setDraftAccess({...draftAccess,accessMode:'OPEN'})}/><span>{text.tripSettings.open}</span></label><label><input type="radio" name="trip-access-mode" checked={draftAccess.accessMode==='RESTRICTED'} onChange={()=>setDraftAccess({...draftAccess,accessMode:'RESTRICTED'})}/><span>{text.tripSettings.restricted}</span></label></div>{draftAccess.accessMode==='RESTRICTED'&&<div className="trip-access-users">{activeUsers.length?activeUsers.map(user=><label key={user.id}><input type="checkbox" checked={draftAccess.allowedUserIds.includes(user.id)} onChange={()=>toggleUser(user.id)}/><span>{user.username}</span></label>):<small>{text.tripSettings.restrictedEmpty}</small>}</div>}<button type="button" disabled={!accessDirty||accessBusy} onClick={()=>void saveAccess()}>{accessBusy?text.tripSettings.savingAccess:text.tripSettings.saveAccess}</button></>}{accessError&&<div className="auth-error">{accessError}</div>}</section>
  </div><footer><button type="button" className="primary" onClick={onClose}>{text.common.complete}</button></footer></section></div>
}

function DayPaletteEditor({days,visits,transports,onChange,onClose}:{days:TripDayColors;visits:VisitData[];transports:MajorTransportData[];onChange:(date:string,color?:string)=>void;onClose:()=>void}){
  const dates=[...new Set([...visits.map(v=>Math.floor(v.start/1440)),...transports.map(t=>Math.floor(t.occupiedFrom/1440))])].sort((a,b)=>a-b)
  const indices=dates.length?dates:[0]
  const [draft,setDraft]=useState<Record<string,string>>({})
  return <aside className="day-palette-popover" aria-label={text.dayPalette.aria}>
    <header><strong>{text.dayPalette.title}</strong><button type="button" onClick={onClose} aria-label={text.common.close}>×</button></header>
    <p>{text.dayPalette.help}</p>
    {indices.map(index=>{
      const date= timelineDateFromMinute(index*1440)
      const current=draft[date]??days[date]??dayColor(index*1440,days)
      return <div className="day-palette-row" key={date}>
        <span>{date}</span><input type="color" aria-label={text.dayPalette.colorAria(date)} value={current} onChange={e=>setDraft(xs=>({...xs,[date]:e.target.value}))}/>
        <button type="button" onClick={()=>{onChange(date,current);setDraft(xs=>{const n={...xs};delete n[date];return n})}}>{text.common.apply}</button>
        <button type="button" onClick={()=>{onChange(date,undefined);setDraft(xs=>{const n={...xs};delete n[date];return n})}}>{text.common.reset}</button>
      </div>
    })}
    <small>{text.dayPalette.note}</small>
  </aside>
}

function ExternalDragGhost({drag}:{drag:ExternalDragVisual}){
  const timeline=drag.preview
  const width=timeline?.width??220,height=timeline?.height??56
  // Cross-surface drag always carries the canonical Timeline-card visual.
  // Destination-specific feedback belongs to the separate Timeline/Bucket placeholders.
  const left=drag.clientX-width/2,top=drag.clientY-height/2
  return <div className="external-drag-ghost timeline-form" style={{left,top,width,height}}><span className="material-symbols-rounded">schedule</span><div><strong>{drag.payload.title}</strong>{drag.payload.detail&&<small>{drag.payload.detail}</small>}</div></div>
}

export default App
