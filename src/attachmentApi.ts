import type { ScheduleAttachment } from './domain/place'
import { text as ui } from './i18n/catalog'

const MAX_IMAGE_BYTES=8*1024*1024
const ALLOWED=new Set(['image/jpeg','image/png','image/webp'])

export function attachmentUrl(tripId:string,attachmentId:string){return `/api/trips/${encodeURIComponent(tripId)}/attachments/${encodeURIComponent(attachmentId)}`}

export async function uploadTripAttachment(tripId:string,file:File):Promise<ScheduleAttachment>{
  if(!ALLOWED.has(file.type))throw new Error(ui.attachments.invalidType)
  if(file.size<=0||file.size>MAX_IMAGE_BYTES)throw new Error(ui.attachments.sizeLimit)
  const response=await fetch(`/api/trips/${encodeURIComponent(tripId)}/attachments`,{
    method:'POST',credentials:'same-origin',headers:{'content-type':file.type,'x-tripplanner-file-name':encodeURIComponent(file.name)},body:file,
  })
  const body=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(body?.message??ui.attachments.uploadFailed)
  return body.attachment as ScheduleAttachment
}
