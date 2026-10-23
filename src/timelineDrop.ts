import type { PlacementConstraints, PlanningKind, VisitPropertyIcon, ExpectedCost, ScheduleAttachment } from './domain/place'

export const TIMELINE_DROP_MIME = 'application/x-tripplanner-timeline-drop'

export type TimelineDropPayload = {
  kind: 'PLACE'
  placeId?: string
  title: string
  detail?: string
  notes?: string
  source: 'BUCKET' | 'BASE' | 'MAP'
  sourceId?: string
  duration?: number
  visitId?: string
  planningKind?: PlanningKind
  visitIcon?: VisitPropertyIcon
  expectedCost?: ExpectedCost
  checklist?: string[]
  attachments?: ScheduleAttachment[]
  constraints?: PlacementConstraints
}

export function writeTimelineDropPayload(dataTransfer: DataTransfer, payload: TimelineDropPayload) {
  dataTransfer.effectAllowed = payload.source === 'BASE' ? 'copyMove' : 'move'
  dataTransfer.setData(TIMELINE_DROP_MIME, JSON.stringify(payload))
}

function parseConstraints(value:unknown):PlacementConstraints|undefined{
  if(!value||typeof value!=='object')return undefined
  const raw=value as Record<string,unknown>
  const constraints:PlacementConstraints={}
  if(raw.dateRange&&typeof raw.dateRange==='object'){
    const r=raw.dateRange as Record<string,unknown>
    if(typeof r.startDate==='string'&&typeof r.endDate==='string')constraints.dateRange={startDate:r.startDate,endDate:r.endDate}
  }
  if(raw.dailyAvailability&&typeof raw.dailyAvailability==='object'){
    const r=raw.dailyAvailability as Record<string,unknown>
    if(typeof r.startMinute==='number'&&Number.isFinite(r.startMinute)&&typeof r.endMinute==='number'&&Number.isFinite(r.endMinute))constraints.dailyAvailability={startMinute:r.startMinute,endMinute:r.endMinute}
  }
  if(typeof raw.fixedStart==='number'&&Number.isFinite(raw.fixedStart))constraints.fixedStart=raw.fixedStart
  return Object.keys(constraints).length?constraints:undefined
}


function parseVisitIcon(value:unknown):VisitPropertyIcon|undefined{
  return ['PLACE','ATTRACTION','FOOD','CAFE','SHOPPING','HOTEL','TRANSIT','EVENT','NATURE','OTHER'].includes(String(value)) ? value as VisitPropertyIcon : undefined
}
function parseExpectedCost(value:unknown):ExpectedCost|undefined{
  if(!value||typeof value!=='object')return undefined
  const raw=value as Record<string,unknown>
  if(typeof raw.amount!=='number'||!Number.isFinite(raw.amount)||raw.amount<0||typeof raw.currency!=='string'||!/^[A-Z]{3}$/.test(raw.currency.toUpperCase()))return undefined
  return {amount:raw.amount,currency:raw.currency.toUpperCase()}
}
function parseAttachments(value:unknown):ScheduleAttachment[]|undefined{
  if(!Array.isArray(value))return undefined
  const out:ScheduleAttachment[]=[]
  for(const item of value){
    if(!item||typeof item!=='object')continue
    const raw=item as Record<string,unknown>
    if(typeof raw.id!=='string'||typeof raw.fileName!=='string'||!['image/jpeg','image/png','image/webp'].includes(String(raw.mimeType))||typeof raw.sizeBytes!=='number'||!Number.isFinite(raw.sizeBytes)||raw.sizeBytes<=0)continue
    out.push({id:raw.id,fileName:raw.fileName,mimeType:raw.mimeType as ScheduleAttachment['mimeType'],sizeBytes:Math.round(raw.sizeBytes)})
  }
  return out.length?out.slice(0,12):undefined
}
function parseChecklist(value:unknown):string[]|undefined{
  if(!Array.isArray(value))return undefined
  const items=value.filter((item):item is string=>typeof item==='string').map(item=>item.trim()).filter(Boolean).slice(0,40)
  return items.length?items:undefined
}

export function readTimelineDropPayload(dataTransfer: DataTransfer): TimelineDropPayload | null {
  const raw = dataTransfer.getData(TIMELINE_DROP_MIME)
  if (!raw) return null

  try {
    const value = JSON.parse(raw) as Partial<TimelineDropPayload>
    if (
      value.kind !== 'PLACE' ||
      typeof value.title !== 'string' ||
      (value.source !== 'BUCKET' && value.source !== 'BASE' && value.source !== 'MAP') ||
      ((value.source === 'BUCKET' || value.source === 'BASE') && typeof value.sourceId !== 'string')
    ) return null

    return {
      kind: 'PLACE',
      placeId: typeof value.placeId === 'string' ? value.placeId : undefined,
      title: value.title,
      detail: typeof value.detail === 'string' ? value.detail : undefined,
      notes: typeof value.notes === 'string' ? value.notes : undefined,
      source: value.source,
      sourceId: typeof value.sourceId === 'string' ? value.sourceId : undefined,
      duration: typeof value.duration === 'number' && Number.isFinite(value.duration) ? value.duration : undefined,
      visitId: typeof value.visitId === 'string' ? value.visitId : undefined,
      planningKind: value.planningKind === 'VISIT' || value.planningKind === 'NEARBY' ? value.planningKind : undefined,
      visitIcon: parseVisitIcon(value.visitIcon),
      expectedCost: parseExpectedCost(value.expectedCost),
      checklist: parseChecklist(value.checklist),
      attachments: parseAttachments(value.attachments),
      constraints: parseConstraints(value.constraints),
    }
  } catch {
    return null
  }
}
