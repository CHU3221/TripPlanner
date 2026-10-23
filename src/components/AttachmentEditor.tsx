import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { ScheduleAttachment } from '../domain/place'
import { attachmentUrl, uploadTripAttachment } from '../attachmentApi'
import { text as ui } from '../i18n/catalog'

export function AttachmentEditor({tripId,value,onChange}:{tripId:string;value:ScheduleAttachment[];onChange:(next:ScheduleAttachment[])=>void}){
  const inputRef=useRef<HTMLInputElement|null>(null)
  const [dragOver,setDragOver]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function addFiles(files:FileList|File[]){
    const images=[...files].filter(file=>file.type.startsWith('image/'))
    if(!images.length)return
    setBusy(true);setError('')
    try{
      const uploaded=[] as ScheduleAttachment[]
      for(const file of images.slice(0,12-value.length))uploaded.push(await uploadTripAttachment(tripId,file))
      onChange([...value,...uploaded])
    }catch(e){setError(e instanceof Error?e.message:ui.attachments.uploadFailed)}finally{setBusy(false)}
  }
  function drop(e:DragEvent<HTMLDivElement>){e.preventDefault();setDragOver(false);void addFiles(e.dataTransfer.files)}
  return <section className="attachment-editor">
    <div className={['attachment-drop-zone',dragOver&&'is-over',busy&&'is-busy'].filter(Boolean).join(' ')} onDragEnter={e=>{e.preventDefault();setDragOver(true)}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';setDragOver(true)}} onDragLeave={e=>{const related=e.relatedTarget as Node|null;if(!related||!e.currentTarget.contains(related))setDragOver(false)}} onDrop={drop} onClick={()=>!busy&&inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!busy)inputRef.current?.click()}}>
      <span className="material-symbols-rounded">add_photo_alternate</span><div><strong>{busy?ui.attachments.uploading:ui.attachments.dropTitle}</strong><small>{ui.attachments.dropHelp}</small></div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e=>{if(e.currentTarget.files)void addFiles(e.currentTarget.files);e.currentTarget.value=''}}/>
    </div>
    {error&&<small className="place-search-error">{error}</small>}
    {value.length>0&&<div className="attachment-grid">{value.map(item=><figure key={item.id} className="attachment-tile"><img src={attachmentUrl(tripId,item.id)} alt={item.fileName}/><figcaption><span title={item.fileName}>{item.fileName}</span><button type="button" onClick={()=>onChange(value.filter(x=>x.id!==item.id))} aria-label={ui.attachments.remove}><span className="material-symbols-rounded">close</span></button></figcaption></figure>)}</div>}
  </section>
}
