const TOP_LEVEL_KEYS = new Set(['schemaVersion','tripId','name','mapProvider','places','regions','visits','bucketItems','bases','transports','labels','plans','timelineView','dayColors','mapSettings','appearanceSettings'])
const STORED_PLACE_KEYS = new Set(['id','providerRef','userData'])
const PLACE_USER_DATA_KEYS = new Set(['name','address','position','category','memo','searchLabel'])
const PLAN_KEYS = new Set(['id','fromNodeKey','toNodeKey','source','user','visualColor','segments','routeIntent'])
const CONNECTION_USER_KEYS = new Set(['name','memo','expectedDurationMinutes'])
const SEGMENT_KEYS = new Set(['id','mode','minutes','memo','waypointPlaceId'])
const ROUTE_INTENT_KEYS = new Set(['provider','mode','option','waypointPlaceIds'])
const TRANSPORT_KEYS = new Set(['id','occupiedFrom','occupiedUntil','mode','serviceNumber','seat','memo','userTitle','collapsedRange','visualColor','departure','arrival'])

function isObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value) }
function assertKeys(obj, allowed, label){ for(const key of Object.keys(obj)) if(!allowed.has(key)) throw new Error(`${label}: unsupported field ${key}`) }
function assertString(value,label){ if(typeof value!=='string'||!value.trim()) throw new Error(`${label} must be a non-empty string`) }
function assertProvider(value,label){ if(value!=='GOOGLE'&&value!=='NAVER') throw new Error(`${label} must be GOOGLE or NAVER`) }
function assertArray(value,label){ if(!Array.isArray(value)) throw new Error(`${label} must be an array`) }

const VISIT_PROPERTY_ICONS = new Set(['PLACE','ATTRACTION','FOOD','CAFE','SHOPPING','HOTEL','TRANSIT','EVENT','NATURE','OTHER'])
function validateVisitProperties(item,label){
  if(!isObject(item)) throw new Error(`${label} must be an object`)
  if(item.visitIcon!==undefined && !VISIT_PROPERTY_ICONS.has(item.visitIcon)) throw new Error(`${label}.visitIcon is invalid`)
  if(item.expectedCost!==undefined){
    if(!isObject(item.expectedCost)||!Number.isFinite(item.expectedCost.amount)||item.expectedCost.amount<0) throw new Error(`${label}.expectedCost.amount must be a non-negative number`)
    if(typeof item.expectedCost.currency!=='string'||!/^[A-Z]{3}$/.test(item.expectedCost.currency)) throw new Error(`${label}.expectedCost.currency must be a 3-letter uppercase code`)
  }
  if(item.notes!==undefined&&(typeof item.notes!=='string'||item.notes.length>20000)) throw new Error(`${label}.notes is invalid`)
  if(item.attachments!==undefined){
    assertArray(item.attachments,`${label}.attachments`)
    if(item.attachments.length>12) throw new Error(`${label}.attachments is too large`)
    for(const attachment of item.attachments){
      if(!isObject(attachment)||typeof attachment.id!=='string'||!attachment.id.trim()||attachment.id.length>160||typeof attachment.fileName!=='string'||!attachment.fileName.trim()||attachment.fileName.length>180||!['image/jpeg','image/png','image/webp'].includes(attachment.mimeType)||!Number.isInteger(attachment.sizeBytes)||attachment.sizeBytes<=0||attachment.sizeBytes>8*1024*1024)throw new Error(`${label}.attachments is invalid`)
    }
  }
  if(item.checklist!==undefined){
    assertArray(item.checklist,`${label}.checklist`)
    if(item.checklist.length>40||item.checklist.some(value=>typeof value!=='string'||!value.trim()||value.length>160)) throw new Error(`${label}.checklist is invalid`)
  }
}

export function validateTripSnapshot(snapshot,{expectedTripId,expectedProvider}={}){
  if(!isObject(snapshot)) throw new Error('snapshot must be an object')
  assertKeys(snapshot,TOP_LEVEL_KEYS,'snapshot')
  if(snapshot.schemaVersion!==1&&snapshot.schemaVersion!==2&&snapshot.schemaVersion!==3) throw new Error('snapshot.schemaVersion must be 1, 2 or 3')
  assertString(snapshot.tripId,'snapshot.tripId')
  if(expectedTripId && snapshot.tripId!==expectedTripId) throw new Error('snapshot.tripId does not match request path')
  if(typeof snapshot.name!=='string'||snapshot.name.trim().length<1||snapshot.name.length>120) throw new Error('snapshot.name must be 1..120 chars')
  assertProvider(snapshot.mapProvider,'snapshot.mapProvider')
  if(expectedProvider && snapshot.mapProvider!==expectedProvider) throw new Error('snapshot.mapProvider does not match stored trip provider')
  for(const key of ['places','regions','visits','bucketItems','bases','transports','labels']) assertArray(snapshot[key],`snapshot.${key}`)
  if(!isObject(snapshot.plans)) throw new Error('snapshot.plans must be an object')
  if(snapshot.timelineView!==undefined){
    if(!isObject(snapshot.timelineView)) throw new Error('snapshot.timelineView must be an object when present')
    assertKeys(snapshot.timelineView,new Set(['viewStart','viewEnd']),'snapshot.timelineView')
    const {viewStart,viewEnd}=snapshot.timelineView
    if(!Number.isFinite(viewStart)||!Number.isFinite(viewEnd)||viewEnd-viewStart<60) throw new Error('snapshot.timelineView must contain a finite range of at least 60 minutes')
  }
  if(snapshot.dayColors!==undefined && !isObject(snapshot.dayColors)) throw new Error('snapshot.dayColors must be an object when present')
  if(snapshot.appearanceSettings!==undefined){
    if(!isObject(snapshot.appearanceSettings)) throw new Error('snapshot.appearanceSettings must be an object when present')
    assertKeys(snapshot.appearanceSettings,new Set(['planBColor']),'snapshot.appearanceSettings')
    if(typeof snapshot.appearanceSettings.planBColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(snapshot.appearanceSettings.planBColor)) throw new Error('snapshot.appearanceSettings.planBColor must be a hex color')
  }
  if(snapshot.mapSettings!==undefined){
    if(!isObject(snapshot.mapSettings)) throw new Error('snapshot.mapSettings must be an object when present')
    if(snapshot.schemaVersion===1){
      assertKeys(snapshot.mapSettings,new Set(['connectionSize']),'snapshot.mapSettings')
      if(!['SMALL','MEDIUM','LARGE','XLARGE'].includes(snapshot.mapSettings.connectionSize)) throw new Error('snapshot.mapSettings.connectionSize is invalid')
    }else{
      assertKeys(snapshot.mapSettings,new Set(['connectionWidthPx']),'snapshot.mapSettings')
      if(!Number.isInteger(snapshot.mapSettings.connectionWidthPx)||snapshot.mapSettings.connectionWidthPx<1||snapshot.mapSettings.connectionWidthPx>24) throw new Error('snapshot.mapSettings.connectionWidthPx must be an integer from 1 to 24')
    }
  }

  for(const [index,item] of snapshot.visits.entries()) validateVisitProperties(item,`snapshot.visits[${index}]`)
  for(const [index,item] of snapshot.bucketItems.entries()) validateVisitProperties(item,`snapshot.bucketItems[${index}]`)
  for(const [index,item] of snapshot.bases.entries()) validateVisitProperties(item,`snapshot.bases[${index}]`)

  for(const place of snapshot.places){
    if(!isObject(place)) throw new Error('snapshot.places[] must be objects')
    assertKeys(place,STORED_PLACE_KEYS,'StoredPlace')
    assertString(place.id,'StoredPlace.id')
    if(place.providerRef!==undefined){
      if(!isObject(place.providerRef)) throw new Error('StoredPlace.providerRef must be an object')
      assertProvider(place.providerRef.provider,'StoredPlace.providerRef.provider')
      assertString(place.providerRef.id,'StoredPlace.providerRef.id')
      if(place.providerRef.provider!==snapshot.mapProvider) throw new Error('StoredPlace providerRef must match trip mapProvider')
    }
    if(!isObject(place.userData)) throw new Error('StoredPlace.userData must be an object')
    assertKeys(place.userData,PLACE_USER_DATA_KEYS,'StoredPlace.userData')
  }

  for(const [key,plan] of Object.entries(snapshot.plans)){
    if(!isObject(plan)) throw new Error(`snapshot.plans.${key} must be an object`)
    assertKeys(plan,PLAN_KEYS,'ConnectionPlan')
    if(plan.id!==key) throw new Error(`ConnectionPlan ${key}: id mismatch`)
    if(plan.user!==undefined){
      if(!isObject(plan.user)) throw new Error('ConnectionPlan.user must be an object')
      assertKeys(plan.user,CONNECTION_USER_KEYS,'ConnectionPlan.user')
      if(plan.user.expectedDurationMinutes!==undefined && (!Number.isInteger(plan.user.expectedDurationMinutes)||plan.user.expectedDurationMinutes<0||plan.user.expectedDurationMinutes>10080)) throw new Error('ConnectionPlan.user.expectedDurationMinutes must be an integer from 0 to 10080')
    }
    assertArray(plan.segments,'ConnectionPlan.segments')
    for(const segment of plan.segments){ if(!isObject(segment)) throw new Error('Segment must be an object'); assertKeys(segment,SEGMENT_KEYS,'Segment') }
    if(plan.routeIntent!==undefined){
      if(!isObject(plan.routeIntent)) throw new Error('routeIntent must be an object')
      assertKeys(plan.routeIntent,ROUTE_INTENT_KEYS,'RouteIntent')
      assertProvider(plan.routeIntent.provider,'RouteIntent.provider')
      if(plan.routeIntent.provider!==snapshot.mapProvider) throw new Error('RouteIntent provider must match trip mapProvider')
    }
  }

  for(const transport of snapshot.transports){
    if(!isObject(transport)) throw new Error('StoredMajorTransport must be an object')
    assertKeys(transport,TRANSPORT_KEYS,'StoredMajorTransport')
    if(!isObject(transport.departure)||!isObject(transport.arrival)) throw new Error('StoredMajorTransport endpoints must be objects')
    if('place' in transport.departure || 'place' in transport.arrival || 'onboard' in transport) throw new Error('provider-derived transport display data cannot be persisted')
  }
  return snapshot
}

export function createEmptyTripSnapshot({tripId,name,mapProvider='GOOGLE'}){
  assertString(tripId,'tripId'); assertString(name,'name'); assertProvider(mapProvider,'mapProvider')
  return {schemaVersion:3,tripId,name:name.trim(),mapProvider,places:[],regions:[],visits:[],bucketItems:[],bases:[],transports:[],labels:[],plans:{},timelineView:{viewStart:600,viewEnd:2160}}
}
