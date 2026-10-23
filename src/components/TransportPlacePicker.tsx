import type { TripPlace } from '../domain/place'
import type { PlaceCandidate, PlaceSearchProvider } from '../map/provider/contract'
import type { PlaceChoice } from './editorTypes'
import { PlacePicker } from './PlacePicker'
import { text as ui } from '../i18n/catalog'

/** Compatibility wrapper; all schedule/transport editors now share PlacePicker. */
export function TransportPlacePicker({label,value,onChange,places,placeSearch,onPreview,allowNone=false,noneLabel=ui.transport.waypointNone}:{
  label:string;value:PlaceChoice;onChange:(value:PlaceChoice)=>void;places:TripPlace[];placeSearch?:PlaceSearchProvider
  onPreview?:(candidate:PlaceCandidate|null)=>void;allowNone?:boolean;noneLabel?:string
}){
  return <PlacePicker label={label} value={value} onChange={onChange} places={places} placeSearch={placeSearch} onPreview={onPreview} allowNone={allowNone} noneLabel={noneLabel} help={ui.transport.placePickerHelp}/>
}
