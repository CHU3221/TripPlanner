import type { PlacementConstraints } from './place'
import { DAY, timelineMinuteFromDateTime } from '../model'
import type { TimeRange, VisitData } from '../model'

function clip(range:TimeRange,start:number,end:number):TimeRange|null{
  const a=Math.max(range.start,start),b=Math.min(range.end,end)
  return b>a?{start:a,end:b}:null
}

function mergeRanges(ranges:TimeRange[]):TimeRange[]{
  const sorted=ranges.filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start||a.end-b.end)
  const merged:TimeRange[]=[]
  for(const range of sorted){
    const last=merged.at(-1)
    if(last&&range.start<=last.end){last.end=Math.max(last.end,range.end)}
    else merged.push({...range})
  }
  return merged
}

/**
 * Returns the portions of [viewStart, viewEnd) that should be visually treated
 * as unavailable for this schedule. This is domain-time only; rendering must
 * map the returned ranges through the Timeline coordinate mapper (timeToY /
 * rangeHeight) so collapsed/time-skip regions remain aligned.
 */
export function constraintUnavailableRanges(
  constraints:PlacementConstraints|undefined,
  viewStart:number,
  viewEnd:number,
):TimeRange[]{
  if(!constraints?.dateRange&&!constraints?.dailyAvailability)return []

  const allowed:TimeRange[]=[]
  const firstDay=Math.floor(viewStart/DAY)
  const lastDay=Math.floor((Math.max(viewStart,viewEnd-1))/DAY)
  const dateStart=constraints.dateRange
    ? timelineMinuteFromDateTime(constraints.dateRange.startDate,'00:00')
    : Number.NEGATIVE_INFINITY
  const dateEndExclusive=constraints.dateRange
    ? timelineMinuteFromDateTime(constraints.dateRange.endDate,'00:00')+DAY
    : Number.POSITIVE_INFINITY

  for(let day=firstDay;day<=lastDay;day+=1){
    const dayStart=day*DAY
    const dayEnd=dayStart+DAY
    if(dayEnd<=dateStart||dayStart>=dateEndExclusive)continue

    const range=constraints.dailyAvailability
      ? {start:dayStart+constraints.dailyAvailability.startMinute,end:dayStart+constraints.dailyAvailability.endMinute}
      : {start:dayStart,end:dayEnd}
    const withinDate={start:Math.max(range.start,dateStart),end:Math.min(range.end,dateEndExclusive)}
    const visible=clip(withinDate,viewStart,viewEnd)
    if(visible)allowed.push(visible)
  }

  const merged=mergeRanges(allowed)
  if(!merged.length)return [{start:viewStart,end:viewEnd}]

  const unavailable:TimeRange[]=[]
  let cursor=viewStart
  for(const range of merged){
    if(range.start>cursor)unavailable.push({start:cursor,end:range.start})
    cursor=Math.max(cursor,range.end)
  }
  if(cursor<viewEnd)unavailable.push({start:cursor,end:viewEnd})
  return unavailable
}

export type ConstraintViolation={
  kind:'PLACEMENT_CONSTRAINT'
  visitId:string
  start:number
  end:number
}

export function findConstraintViolations(visits:VisitData[]):ConstraintViolation[]{
  const result:ConstraintViolation[]=[]
  for(const visit of visits){
    const unavailable=constraintUnavailableRanges(visit.constraints,visit.start,visit.end)
    for(const range of unavailable){
      const start=Math.max(visit.start,range.start),end=Math.min(visit.end,range.end)
      if(end>start)result.push({kind:'PLACEMENT_CONSTRAINT',visitId:visit.id,start,end})
    }
  }
  return result
}
