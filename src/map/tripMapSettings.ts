export const MIN_CONNECTION_WIDTH_PX=1
export const MAX_CONNECTION_WIDTH_PX=24
export const DEFAULT_CONNECTION_WIDTH_PX=3
export type LegacyConnectionSize='SMALL'|'MEDIUM'|'LARGE'|'XLARGE'
export type TripMapSettings={connectionWidthPx:number}
export const DEFAULT_TRIP_MAP_SETTINGS:TripMapSettings={connectionWidthPx:DEFAULT_CONNECTION_WIDTH_PX}
const legacyWidth=(value:LegacyConnectionSize|undefined)=>value==='XLARGE'?9:value==='LARGE'?7:value==='MEDIUM'?5:value==='SMALL'?3:undefined
export function normalizeConnectionWidthPx(value:unknown):number{
  const numeric=typeof value==='number'?value:Number(value)
  if(!Number.isFinite(numeric))return DEFAULT_CONNECTION_WIDTH_PX
  return Math.max(MIN_CONNECTION_WIDTH_PX,Math.min(MAX_CONNECTION_WIDTH_PX,Math.round(numeric)))
}
export function normalizeTripMapSettings(value?:Partial<TripMapSettings>&{connectionSize?:LegacyConnectionSize}|null):TripMapSettings{
  return {connectionWidthPx:normalizeConnectionWidthPx(value?.connectionWidthPx??legacyWidth(value?.connectionSize))}
}
