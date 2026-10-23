import type { VisitPropertyIcon } from './domain/place'

export const VISIT_PROPERTY_ICONS:readonly {id:VisitPropertyIcon;symbol:string}[]=[
  {id:'PLACE',symbol:'place'},
  {id:'ATTRACTION',symbol:'attractions'},
  {id:'FOOD',symbol:'restaurant'},
  {id:'CAFE',symbol:'local_cafe'},
  {id:'SHOPPING',symbol:'shopping_bag'},
  {id:'HOTEL',symbol:'hotel'},
  {id:'TRANSIT',symbol:'train'},
  {id:'EVENT',symbol:'event'},
  {id:'NATURE',symbol:'park'},
  {id:'OTHER',symbol:'star'},
] as const

export function visitIconSymbol(icon?:VisitPropertyIcon){
  return VISIT_PROPERTY_ICONS.find(item=>item.id===(icon??'PLACE'))?.symbol??'place'
}

export const COMMON_COST_CURRENCIES=['KRW','JPY','USD','EUR','CNY','TWD','HKD','SGD','THB','GBP'] as const

export function formatExpectedCost(amount:number,currency:string){
  const code=(currency||'KRW').toUpperCase()
  try{return new Intl.NumberFormat('ko-KR',{style:'currency',currency:code,maximumFractionDigits:Number.isInteger(amount)?0:2}).format(amount)}
  catch{return `${amount.toLocaleString('ko-KR')} ${code}`}
}
