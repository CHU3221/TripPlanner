import type { PlaceProviderId } from '../domain/place'
import type { TripSnapshot, TripSnapshotRepository, VersionedTripSnapshot } from './contract'

export type TripSummary={tripId:string;name:string;mapProvider:PlaceProviderId;revision:number}
export class TripRevisionConflictError extends Error{constructor(){super('다른 편집 내용이 먼저 저장되었습니다. 다시 불러온 뒤 저장해주세요.');this.name='TripRevisionConflictError'}}

async function readResponse<T>(response:Response):Promise<T>{
  const body=await response.json().catch(()=>({})) as {message?:string}&T
  if(response.status===409)throw new TripRevisionConflictError()
  if(!response.ok)throw new Error(body.message??`서버 요청에 실패했습니다. (${response.status})`)
  return body
}
export class HttpTripSnapshotRepository implements TripSnapshotRepository{
  constructor(private readonly baseUrl='/api/trips'){}
  async list():Promise<TripSummary[]>{const r=await fetch(this.baseUrl,{headers:{Accept:'application/json'}});return (await readResponse<{trips:TripSummary[]}>(r)).trips}
  async create(name:string,mapProvider:PlaceProviderId='GOOGLE'):Promise<VersionedTripSnapshot>{const r=await fetch(this.baseUrl,{method:'POST',headers:{'content-type':'application/json',Accept:'application/json'},body:JSON.stringify({name,mapProvider})});return readResponse<VersionedTripSnapshot>(r)}
  async load(tripId:string):Promise<VersionedTripSnapshot|null>{const r=await fetch(`${this.baseUrl}/${encodeURIComponent(tripId)}`,{headers:{Accept:'application/json'}});if(r.status===404)return null;return readResponse<VersionedTripSnapshot>(r)}
  async revision(tripId:string):Promise<number|null>{const r=await fetch(`${this.baseUrl}/${encodeURIComponent(tripId)}/revision`,{headers:{Accept:'application/json'}});if(r.status===404)return null;return (await readResponse<{revision:number}>(r)).revision}
  async save(tripId:string,snapshot:TripSnapshot,expectedRevision:number):Promise<number>{const r=await fetch(`${this.baseUrl}/${encodeURIComponent(tripId)}`,{method:'PUT',headers:{'content-type':'application/json',Accept:'application/json'},body:JSON.stringify({expectedRevision,snapshot})});return (await readResponse<{revision:number}>(r)).revision}
  async delete(tripId:string):Promise<void>{const r=await fetch(`${this.baseUrl}/${encodeURIComponent(tripId)}`,{method:'DELETE',headers:{Accept:'application/json'}});await readResponse<{ok:true}>(r)}
}
