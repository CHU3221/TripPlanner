import { useEffect, useState, type WheelEvent } from 'react'
import { text as ui } from '../i18n/catalog'

export function isValidDateText(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value}

export function DateTextInput({value,onChange,disabled=false,title}:{value:string;onChange:(value:string)=>void;disabled?:boolean;title?:string}){
  return <input type="text" inputMode="numeric" autoComplete="off" value={value} disabled={disabled} title={title} placeholder="YYYY-MM-DD" maxLength={10} onChange={e=>onChange(e.target.value)}/>
}

const TIME_RE=/^(\d{1,2}):(\d{1,2})$/
export function parseTimeText(value:string){const m=TIME_RE.exec(value.trim());if(!m)return null;const h=Number(m[1]),min=Number(m[2]);if(h<0||h>23||min<0||min>59)return null;return h*60+min}
function formatMinutes(total:number){const m=((total%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
function digits(v:string,max:number){const s=v.replace(/\D/g,'').slice(0,2);if(s==='')return '';return String(Math.min(max,Number(s)))}

type Period='AM'|'PM'

export function TimeTextInput({value,onChange,disabled=false,title,wheelStep=5}:{value:string;onChange:(value:string)=>void;disabled?:boolean;title?:string;wheelStep?:number}){
  const parsed=parseTimeText(value)
  const [format,setFormat]=useState<'12H'|'24H'>('12H')
  const [draftHour,setDraftHour]=useState<string|null>(null)
  const [draftMinute,setDraftMinute]=useState<string|null>(null)
  // When the field is empty, period is still a real part of the draft. This lets
  // the user choose 오후 first and then type 7:30 instead of having to enter a
  // time, flip AM/PM, and correct it afterwards.
  const [draftPeriod,setDraftPeriod]=useState<Period|null>(null)

  useEffect(()=>{
    if(parsed!==null)setDraftPeriod(null)
  },[parsed])

  const base=parsed??0
  const hour24=Math.floor(base/60), minute=base%60
  const parsedPeriod:Period=hour24>=12?'PM':'AM'
  const period=draftPeriod??parsedPeriod
  const displayHour=format==='12H'?(hour24%12||12):hour24
  const hourText=draftHour??(parsed===null?'':String(displayHour))
  const minuteText=draftMinute??(parsed===null?'':String(minute))

  const commit=(h:number,m:number,p:Period=period)=>{
    let hh=h
    if(format==='12H')hh=(h%12)+(p==='PM'?12:0)
    onChange(formatMinutes(hh*60+m))
  }

  const changeHour=(raw:string)=>{
    const max=format==='12H'?12:23
    const next=digits(raw,max)
    setDraftHour(next)
    if(next==='')return
    let h=Number(next)
    if(format==='12H'&&h===0)h=12
    const m=draftMinute!==null&&draftMinute!==''?Number(draftMinute):minute
    commit(h,m)
  }

  const changeMinute=(raw:string)=>{
    const next=digits(raw,59)
    setDraftMinute(next)
    if(next==='')return
    const fallbackHour=format==='12H'?12:0
    const h=draftHour!==null&&draftHour!==''?Number(draftHour):(parsed===null?fallbackHour:displayHour)
    commit(h,Number(next))
  }

  const wheel=(part:'hour'|'minute')=>(e:WheelEvent<HTMLInputElement>)=>{
    if(disabled||parsed===null)return
    e.preventDefault()
    const delta=e.deltaY<0?1:-1
    onChange(formatMinutes(parsed+delta*(part==='hour'?60:wheelStep)))
    setDraftHour(null);setDraftMinute(null);setDraftPeriod(null)
  }

  const togglePeriod=()=>{
    if(disabled)return
    if(parsed===null){setDraftPeriod(p=>(p??'AM')==='AM'?'PM':'AM');return}
    onChange(formatMinutes(parsed+(parsedPeriod==='AM'?720:-720)))
    setDraftHour(null);setDraftMinute(null);setDraftPeriod(null)
  }

  const switchFormat=()=>{
    setFormat(f=>f==='12H'?'24H':'12H')
    setDraftHour(null);setDraftMinute(null);setDraftPeriod(null)
  }

  return <div className="segmented-time-input" title={title}>
    <button type="button" className="time-format-toggle" disabled={disabled} onClick={switchFormat}>{format}</button>
    {format==='12H'&&<button type="button" className="time-period-toggle" disabled={disabled} onClick={togglePeriod}>{period==='AM'?ui.dateTime.am:ui.dateTime.pm}</button>}
    <input aria-label={ui.dateTime.hour} type="text" inputMode="numeric" autoComplete="off" disabled={disabled} placeholder={ui.dateTime.hour} value={hourText} onFocus={()=>{if(parsed!==null)setDraftHour(String(displayHour))}} onBlur={()=>setDraftHour(null)} onChange={e=>changeHour(e.target.value)} onWheel={wheel('hour')}/>
    <span>:</span>
    <input aria-label={ui.dateTime.minute} type="text" inputMode="numeric" autoComplete="off" disabled={disabled} placeholder={ui.dateTime.minute} value={minuteText} onFocus={()=>{if(parsed!==null)setDraftMinute(String(minute))}} onBlur={()=>setDraftMinute(null)} onChange={e=>changeMinute(e.target.value)} onWheel={wheel('minute')}/>
  </div>
}
