export type TelemetryEventType=
  |'GOOGLE_DYNAMIC_MAP'
  |'GOOGLE_AUTOCOMPLETE_REQUEST'|'GOOGLE_AUTOCOMPLETE_SESSION_START'|'GOOGLE_AUTOCOMPLETE_SESSION_SELECTED'|'GOOGLE_AUTOCOMPLETE_SESSION_ABANDONED'
  |'GOOGLE_PLACE_DETAILS_ESSENTIALS'
  |'GOOGLE_PLACE_DETAILS_PRO'
  |'GOOGLE_TEXT_SEARCH_PRO'
  |'GOOGLE_GEOCODING'
  |'GOOGLE_COMPUTE_ROUTES_ESSENTIALS'
  |'UX_TRIP_OPEN'|'UX_SAVE'|'UX_UNDO'|'UX_REDO'|'UX_CAPTURE_ENTER'|'UX_CAPTURE_EXIT'|'UX_PIN_REFRESH'

let currentTripId:string|null=null
export function setTelemetryTrip(tripId:string|null){currentTripId=tripId}
export function recordTelemetry(eventType:TelemetryEventType,provider:'GOOGLE'|'NAVER'|null=null,outcome='ATTEMPT'){
  if(typeof window==='undefined')return
  const body=JSON.stringify({eventType,provider,tripId:currentTripId,outcome})
  void fetch('/api/telemetry',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',Accept:'application/json'},body,keepalive:true}).catch(()=>{})
}
