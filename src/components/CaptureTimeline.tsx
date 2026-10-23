import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { DAY, clock, durationText, pairKey, timelineDateFromMinute } from '../model'
import type { ConnectionPlan, MajorTransportData, Node, TimelineLabel, VisitData } from '../model'
import type { TripPlace } from '../domain/place'
import type { TripDayColors } from '../visual/appearance'
import { visualColor } from '../visual/appearance'
import { text as ui } from '../i18n/catalog'
import { formatExpectedCost, visitIconSymbol } from '../visitProperties'
import { attachmentUrl } from '../attachmentApi'

type DisplayNode={node:Node;kind:'VISIT'|'TRANSPORT'}
function titleForVisit(visit:VisitData,places:TripPlace[]){return visit.title??places.find(p=>p.id===visit.placeId)?.name??ui.schedule.generic}
function compareNodes(a:Node,b:Node){return a.start-b.start||a.end-b.end||a.key.localeCompare(b.key)}
function nodesFor(visits:VisitData[],transports:MajorTransportData[],places:TripPlace[]):DisplayNode[]{return [...visits.map(v=>({kind:'VISIT' as const,node:{type:'VISIT' as const,id:v.id,key:`VISIT:${v.id}`,start:v.start,end:v.end,entryPlaceId:v.placeId,exitPlaceId:v.placeId,title:titleForVisit(v,places)}})),...transports.map(t=>({kind:'TRANSPORT' as const,node:{type:'TRANSPORT' as const,id:t.id,key:`TRANSPORT:${t.id}`,start:t.occupiedFrom,end:t.occupiedUntil,entryPlaceId:t.departure.placeId,exitPlaceId:t.arrival.placeId,title:t.userTitle??t.onboard.title}}))].sort((a,b)=>compareNodes(a.node,b.node))}
function dayLabel(dayStart:number){const iso=timelineDateFromMinute(dayStart);return new Date(`${iso}T00:00:00Z`).toLocaleDateString('ko-KR',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric',weekday:'short'})}
function pct(minute:number,dayStart:number){return Math.max(0,Math.min(100,((minute-dayStart)/DAY)*100))}
function expectedMinutes(plan?:ConnectionPlan){if(!plan||plan.source!=='MANUAL')return undefined;const explicit=plan.user?.expectedDurationMinutes;if(Number.isFinite(explicit))return explicit;const total=plan.segments.reduce((sum,s)=>sum+Math.max(0,s.minutes||0),0);return total||undefined}

export function CaptureTimeline({tripId,visits,transports,places,plans,labels,dayColors,onDayChange}:{tripId:string;visits:VisitData[];transports:MajorTransportData[];places:TripPlace[];plans:Record<string,ConnectionPlan>;labels:TimelineLabel[];dayColors:TripDayColors;onDayChange?:(dayStart:number)=>void}){
  const days=useMemo(()=>{const times=[...visits.flatMap(v=>[v.start,v.end]),...transports.flatMap(t=>[t.occupiedFrom,t.occupiedUntil])];const first=times.length?Math.floor(Math.min(...times)/DAY)*DAY:0,last=times.length?Math.floor(Math.max(...times.map(t=>Math.max(first,t-1)))/DAY)*DAY:first;const out:number[]=[];for(let d=first;d<=last;d+=DAY)out.push(d);return out.length?out:[0]},[visits,transports])
  const [page,setPage]=useState(0)
  const safePage=Math.max(0,Math.min(page,days.length-1)),dayStart=days[safePage],dayEnd=dayStart+DAY
  useEffect(()=>{onDayChange?.(dayStart)},[dayStart,onDayChange])
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='ArrowLeft')setPage(x=>Math.max(0,x-1));if(e.key==='ArrowRight')setPage(x=>Math.min(days.length-1,x+1))};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[days.length])

  const dayVisits=visits.filter(v=>v.end>dayStart&&v.start<dayEnd).sort((a,b)=>a.start-b.start)
  const dayTransports=transports.filter(t=>t.occupiedUntil>dayStart&&t.occupiedFrom<dayEnd).sort((a,b)=>a.occupiedFrom-b.occupiedFrom)
  const dayNodes=nodesFor(dayVisits,dayTransports,places)
  const visitNumber=new Map(dayVisits.map((v,i)=>[v.id,i+1]))
  const ticks=Array.from({length:7},(_,i)=>i*240)
  const dayLabels=labels.filter(l=>l.at>=dayStart&&l.at<dayEnd)
  const connectionFor=(from:Node,to:Node)=>{const plan=plans[pairKey(from,to)],minutes=expectedMinutes(plan);return plan?{name:plan.user?.name??ui.capture.connectionLane,minutes}:null}
  const colorFor=(entry:DisplayNode)=>entry.kind==='VISIT'?visualColor(dayVisits.find(v=>v.id===entry.node.id)?.visualColor,entry.node.start,dayColors):visualColor(dayTransports.find(t=>t.id===entry.node.id)?.visualColor,entry.node.start,dayColors)
  const costs=useMemo(()=>{const totals=new Map<string,number>();for(const visit of dayVisits){if(!visit.expectedCost)continue;const code=visit.expectedCost.currency.toUpperCase();totals.set(code,(totals.get(code)??0)+visit.expectedCost.amount)}return [...totals.entries()]},[dayVisits])
  const preparations=useMemo(()=>[...new Set(dayVisits.flatMap(v=>v.checklist??[]).map(v=>v.trim()).filter(Boolean))],[dayVisits])
  const detailed=dayVisits.filter(v=>v.notes||v.attachments?.length||v.expectedCost||v.checklist?.length)

  return <>
    <header className="capture-page-header">
      <div><small>{ui.capture.fullDay}</small><h1>{dayLabel(dayStart)}</h1><p>{ui.capture.dayPage(safePage+1,days.length)} · {ui.capture.visitCount(dayVisits.length)} · {ui.capture.transportCount(dayTransports.length)}</p></div>
      <div className="capture-page-buttons"><button type="button" disabled={safePage===0} onClick={()=>setPage(x=>Math.max(0,x-1))}><span className="material-symbols-rounded">chevron_left</span>{ui.capture.previousDay}</button><button type="button" disabled={safePage===days.length-1} onClick={()=>setPage(x=>Math.min(days.length-1,x+1))}>{ui.capture.nextDay}<span className="material-symbols-rounded">chevron_right</span></button></div>
    </header>

    <section className="capture-page-timeline">
      <div className="capture-column-heading"><strong>{ui.capture.agenda}</strong><small>{dayLabel(dayStart)}</small></div>
      <div className="capture-day-strip" aria-label={ui.capture.overview}><div className="capture-day-strip-track">{ticks.map(offset=><span className="capture-strip-tick" key={offset} style={{left:`${pct(dayStart+offset,dayStart)}%`}}><b>{String(offset/60).padStart(2,'0')}:00</b><i/></span>)}<span className="capture-strip-tick end" style={{left:'100%'}}><b>24:00</b><i/></span>{dayVisits.map(v=><span key={v.id} className="capture-strip-event" title={titleForVisit(v,places)} style={{left:`${pct(v.start,dayStart)}%`,width:`${Math.max(1.4,pct(v.end,dayStart)-pct(v.start,dayStart))}%`,'--day-accent':visualColor(v.visualColor,v.start,dayColors)} as CSSProperties}/>)}</div></div>
      {dayNodes.length===0?<div className="capture-empty-document">{ui.capture.emptyDay}</div>:<div className="capture-itinerary-list">{dayNodes.map((entry,index)=>{const prev=index>0?dayNodes[index-1].node:null,connection=prev?connectionFor(prev,entry.node):null;const visit=entry.kind==='VISIT'?dayVisits.find(v=>v.id===entry.node.id):undefined;const transport=entry.kind==='TRANSPORT'?dayTransports.find(t=>t.id===entry.node.id):undefined;return <div className="capture-itinerary-entry" key={entry.node.key}>{connection&&<div className="capture-itinerary-connection"><span className="material-symbols-rounded">south</span><div><strong>{connection.name}</strong>{connection.minutes!==undefined&&<small>{connection.minutes}{ui.common.minutes}</small>}</div></div>}<article className={`capture-itinerary-card ${entry.kind==='TRANSPORT'?'is-transport':'is-visit'}`} style={{'--day-accent':colorFor(entry)} as CSSProperties}><div className="capture-itinerary-time"><strong>{clock(entry.node.start)}</strong><small>{clock(entry.node.end)} · {durationText(Math.max(0,entry.node.end-entry.node.start))}</small></div><div className="capture-itinerary-marker">{entry.kind==='VISIT'?<><b>{visitNumber.get(entry.node.id)}</b><span className="material-symbols-rounded">{visitIconSymbol(visit?.visitIcon)}</span></>:<span className="material-symbols-rounded">route</span>}</div><div className="capture-itinerary-copy"><strong>{entry.node.title}</strong>{visit?.detail&&<p>{visit.detail}</p>}{transport?.serviceNumber&&<p>{transport.serviceNumber}</p>}</div></article></div>})}</div>}
      {dayLabels.length>0&&<div className="capture-document-notes">{dayLabels.map(l=><span key={l.id}><b>{clock(l.at)}</b>{l.text}</span>)}</div>}
    </section>

    <section className="capture-page-detail">
      <div className="capture-column-heading"><strong>{ui.capture.details}</strong><small>{ui.capture.detailsHelp}</small></div>
      {detailed.length===0?<div className="capture-empty-detail">{ui.capture.noDetails}</div>:detailed.map(visit=><article className="capture-detail-card" key={visit.id}><header><span className="material-symbols-rounded">{visitIconSymbol(visit.visitIcon)}</span><div><strong>{visitNumber.get(visit.id)}. {titleForVisit(visit,places)}</strong><small>{clock(visit.start)}–{clock(visit.end)}</small></div></header>{visit.notes&&<p className="capture-long-note">{visit.notes}</p>}{visit.attachments?.length?<div className="capture-attachment-grid">{visit.attachments.map(item=><figure key={item.id}><img src={attachmentUrl(tripId,item.id)} alt={item.fileName}/><figcaption>{item.fileName}</figcaption></figure>)}</div>:null}<div className="capture-detail-properties">{visit.expectedCost&&<span><span className="material-symbols-rounded">payments</span>{formatExpectedCost(visit.expectedCost.amount,visit.expectedCost.currency)}</span>}{visit.checklist?.map(item=><span key={item}><span className="material-symbols-rounded">check_box_outline_blank</span>{item}</span>)}</div></article>)}
      <section className="capture-day-summary"><header><strong>{ui.capture.daySummary}</strong><small>{ui.capture.tripSummary}</small></header><div className="capture-summary-grid"><article><span className="material-symbols-rounded">payments</span><div><strong>{ui.capture.estimatedCost}</strong>{costs.length?costs.map(([currency,amount])=><p key={currency}>{formatExpectedCost(amount,currency)}</p>):<p>{ui.capture.noCost}</p>}</div></article><article><span className="material-symbols-rounded">checklist</span><div><strong>{ui.capture.preparations}</strong>{preparations.length?<div className="capture-summary-tags">{preparations.map(item=><span key={item}>{item}</span>)}</div>:<p>{ui.capture.noPreparations}</p>}</div></article></div></section>
    </section>
    <div className="capture-print-map-placeholder"><span className="material-symbols-rounded">map</span><strong>{ui.capture.printMapTitle}</strong><p>{ui.capture.printMapHelp}</p></div>
  </>
}
