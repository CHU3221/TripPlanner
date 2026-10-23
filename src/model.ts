export const HOUR_HEIGHT = 80
export const PX_PER_MINUTE = HOUR_HEIGHT / 60
export const TOP = 100
export const BOTTOM = 120
export const DAY = 24 * 60
export const SNAP = 5
export const MIN_VISIT = 15
export const DEFAULT_VIEW_START = 10 * 60
export const DEFAULT_VIEW_END = DAY + 12 * 60
export type TimelineViewSettings = { viewStart:number; viewEnd:number }
export const DEFAULT_TIMELINE_VIEW:TimelineViewSettings = { viewStart:DEFAULT_VIEW_START, viewEnd:DEFAULT_VIEW_END }
// Kept for compatibility with older imports; interactive Timeline uses its own view settings.
export const VIEW_START = DEFAULT_VIEW_START
export const VIEW_END = DEFAULT_VIEW_END
// Overnight compression must still leave enough physical room for MajorTransport
// zones, date labels, and boundary stamps to remain legible.
export const COLLAPSED_HEIGHT = 224

export const TIMELINE_EPOCH_DATE = '2026-10-20'
const TIMELINE_EPOCH_UTC = Date.parse(`${TIMELINE_EPOCH_DATE}T00:00:00Z`)

export function timelineMinuteFromDateTime(date:string,time:string){
  const [h,m]=time.split(':').map(Number)
  const day=Math.round((Date.parse(`${date}T00:00:00Z`)-TIMELINE_EPOCH_UTC)/86400000)
  return day*DAY+h*60+m
}

export function timelineDateFromMinute(time:number){
  const day=Math.floor(time/DAY)
  return new Date(TIMELINE_EPOCH_UTC+day*86400000).toISOString().slice(0,10)
}

export function timelineDateLabel(time:number){
  const date=new Date(`${timelineDateFromMinute(time)}T00:00:00Z`)
  const month=date.toLocaleString('en-US',{month:'short',timeZone:'UTC'}).toUpperCase()
  const weekday=date.toLocaleString('en-US',{weekday:'short',timeZone:'UTC'}).toLowerCase()
  return {date:`${month} ${date.getUTCDate()}`,weekday}
}

export const t = {
  oct20: (h: number, m = 0) => h * 60 + m,
  oct21: (h: number, m = 0) => DAY + h * 60 + m,
}

export type TimeRange = { start: number; end: number }
export type VisitSource =
  | { kind: 'BUCKET'; bucketItemId: string; bucketIndex: number; meta: string }
  | { kind: 'BASE'; baseId: string }

// Canonical interactive Visit shape. domain/schedule.ts is compatibility-only.
export type VisitData = import('./domain/place').ScheduleDefinition & { id:string; start:number; end:number; source?:VisitSource; durationExplicit?:boolean }
export type TimelineLabel = { id: string; at: number; text: string }
export type TravelMode = 'WALK' | 'SUBWAY' | 'BUS' | 'CAR'
export type Segment = {
  id: string
  mode: TravelMode
  minutes: number
  memo?: string
  /** Optional physical waypoint reached after this segment. The final segment must omit this. */
  waypointPlaceId?: import('./domain/place').PlaceId
}
export type RouteIntent = {
  provider: import('./domain/place').PlaceProviderId
  mode: import('./map/provider/contract').RouteMode
  /** Opaque provider-specific route preference selected by the user/application. */
  option?: string
  /** User-owned ordered TripPlace IDs. Provider geometry/metrics must not be stored. */
  waypointPlaceIds?: import('./domain/place').PlaceId[]
}
export type ConnectionUserMetadata = { name?: string; memo?: string; expectedDurationMinutes?: number }
/**
 * Persistent user-owned Connection state. Provider route geometry/metrics/summary
 * must never be stored here; they live in RouteRuntimeResult only.
 */
export type ConnectionPlan = {
  id: string
  fromNodeKey: string
  toNodeKey: string
  source: 'MANUAL' | 'ROUTE_API'
  user?: ConnectionUserMetadata
  /** User override; not the provider's route styling or route response. */
  visualColor?: string
  segments: Segment[]
  routeIntent?: RouteIntent
}
export type Node = { type:'VISIT'|'TRANSPORT'; id:string; key:string; start:number; end:number; entryPlaceId?:string; exitPlaceId?:string; title:string }
// Canonical interactive MajorTransport shape. domain/transport.ts is compatibility-only.
// Semantic invariant: occupiedFrom === departure.departureAt and occupiedUntil === arrival.arrivalAt.
// collapsedRange is visual compression metadata, not extra occupied time.
export type MajorTransportData = {
  id:string; occupiedFrom:number; occupiedUntil:number; mode?:'TRAIN'|'FLIGHT'|'SHIP'|'BUS'|'OTHER'; serviceNumber?:string; seat?:string; memo?:string
  /** Explicit user-authored display title only. Derived fallback strings stay in onboard.title. */
  userTitle?:string
  visualColor?:string
  departure: { placeId: string; place: string; departureAt: number; detail?: string }
  onboard: { title: string; route: string; icon: string }
  arrival: { placeId: string; place: string; arrivalAt: number; detail?: string }
  collapsedRange?: TimeRange
}

export const collapsedRanges: TimeRange[] = [{ start: t.oct20(22, 30), end: t.oct21(7, 30) }]

export function createTimelineMapper(viewStart:number,viewEnd:number,ranges:TimeRange[]=collapsedRanges){
  const visibleRanges=ranges
    .map(range=>({start:Math.max(range.start,viewStart),end:Math.min(range.end,viewEnd)}))
    .filter(range=>range.end>range.start)
    .sort((a,b)=>a.start-b.start)

  function timeToY(time:number){
    let y=TOP
    let cursor=viewStart
    for(const range of visibleRanges){
      if(time<=range.start)return y+(time-cursor)*PX_PER_MINUTE
      y+=(range.start-cursor)*PX_PER_MINUTE
      if(time<=range.end)return y+((time-range.start)/(range.end-range.start))*COLLAPSED_HEIGHT
      y+=COLLAPSED_HEIGHT
      cursor=range.end
    }
    return y+(time-cursor)*PX_PER_MINUTE
  }

  function yToTime(y:number){
    let cy=TOP
    let cursor=viewStart
    for(const range of visibleRanges){
      const normal=(range.start-cursor)*PX_PER_MINUTE
      if(y<=cy+normal)return cursor+(y-cy)/PX_PER_MINUTE
      cy+=normal
      if(y<=cy+COLLAPSED_HEIGHT)return range.start+((y-cy)/COLLAPSED_HEIGHT)*(range.end-range.start)
      cy+=COLLAPSED_HEIGHT
      cursor=range.end
    }
    return cursor+(y-cy)/PX_PER_MINUTE
  }

  const rangeHeight=(a:number,b:number)=>timeToY(b)-timeToY(a)
  return {viewStart,viewEnd,collapsedRanges:visibleRanges,timeToY,yToTime,rangeHeight}
}

const defaultMapper=createTimelineMapper(DEFAULT_VIEW_START,DEFAULT_VIEW_END,collapsedRanges)
export const timeToY=(time:number)=>defaultMapper.timeToY(time)
export const yToTime=(y:number)=>defaultMapper.yToTime(y)

export const snap = (v: number) => Math.round(v / SNAP) * SNAP
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const rangeHeight = (a: number, b: number) => defaultMapper.rangeHeight(a,b)

export function clock(time: number) {
  const m = ((Math.round(time) % DAY) + DAY) % DAY
  const h24 = Math.floor(m / 60)
  const mm = m % 60
  const h = h24 % 12 || 12
  return `${h}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`
}
export function shortClock(time: number) {
  const m = ((Math.round(time) % DAY) + DAY) % DAY
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')}`
}
export function durationText(minutes: number) {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}시간 ${m}분` : `${h}시간`
}
export const pairKey = (a: Node, b: Node) => `${a.key}__${b.key}`
export function modeIcon(mode: TravelMode) {
  return ({ WALK: 'directions_walk', SUBWAY: 'subway', BUS: 'directions_bus', CAR: 'directions_car' } as const)[mode]
}
