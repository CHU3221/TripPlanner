import { useEffect, useRef, useState } from 'react'
import type { TripPlace } from '../domain/place'
import type { PlaceAutocompleteSession, PlaceAutocompleteSuggestion, PlaceCandidate, PlaceSearchProvider } from '../map/provider/contract'
import { placeChoiceFromCandidate, patchNewPlaceChoiceAsUser } from '../placeDraft'
import type { PlaceChoice } from './editorTypes'
import { searchPlaceCandidates } from '../placeSearchUi'
import { text } from '../i18n/catalog'

const choiceValue=(value:PlaceChoice)=>value.mode==='NONE'?'__NONE__':value.mode==='EXISTING'?value.placeId:'__NEW__'
const candidateKey=(candidate:PlaceCandidate,index:number)=>candidate.sourceRef?.id??`${candidate.name}:${candidate.position.lat}:${candidate.position.lng}:${index}`

/** Shared editor control. Provider network requests only start after Search/Enter. */
export function PlacePicker({
  label=text.placePicker.place,value,onChange,places,placeSearch,onPreview,allowNone=true,
  noneLabel=text.placePicker.anywhere,help=text.placePicker.help,
  allowManual=true,
}:{
  label?:string; value:PlaceChoice; onChange:(value:PlaceChoice)=>void; places:TripPlace[]
  placeSearch?:PlaceSearchProvider; onPreview?:(candidate:PlaceCandidate|null)=>void
  allowNone?:boolean; noneLabel?:string; help?:string; allowManual?:boolean
}){
  const autocompleteSessionRef=useRef<PlaceAutocompleteSession|null>(null)
  const autocompleteSessionPromiseRef=useRef<Promise<PlaceAutocompleteSession|null>|null>(null)
  const autocompleteSessionGenerationRef=useRef(0)
  const requestGenerationRef=useRef(0)
  const [query,setQuery]=useState('')
  const [results,setResults]=useState<PlaceCandidate[]>([])
  const [suggestions,setSuggestions]=useState<PlaceAutocompleteSuggestion[]>([])
  const [searching,setSearching]=useState(false)
  const [error,setError]=useState('')
  const [showCoordinates,setShowCoordinates]=useState(false)
  const [selectedKey,setSelectedKey]=useState<string|null>(null)
  const autocompleteEnabled=Boolean(placeSearch?.createAutocompleteSession)

  function abandonAutocomplete(){
    autocompleteSessionGenerationRef.current++
    requestGenerationRef.current++
    autocompleteSessionRef.current?.cancel()
    autocompleteSessionRef.current=null
    autocompleteSessionPromiseRef.current=null
  }
  async function ensureAutocompleteSession(){
    if(!placeSearch?.createAutocompleteSession)return null
    if(autocompleteSessionRef.current)return autocompleteSessionRef.current
    if(autocompleteSessionPromiseRef.current)return autocompleteSessionPromiseRef.current
    const generation=autocompleteSessionGenerationRef.current
    const pending=placeSearch.createAutocompleteSession().then(session=>{
      if(generation!==autocompleteSessionGenerationRef.current){session.cancel();return null}
      autocompleteSessionRef.current=session
      return session
    }).finally(()=>{if(autocompleteSessionPromiseRef.current===pending)autocompleteSessionPromiseRef.current=null})
    autocompleteSessionPromiseRef.current=pending
    return pending
  }

  useEffect(()=>()=>abandonAutocomplete(),[])

  function choose(raw:string){
    abandonAutocomplete();setResults([]);setSuggestions([]);setError('');setSelectedKey(null);onPreview?.(null)
    if(raw==='__NONE__'){onChange({mode:'NONE'});return}
    if(raw==='__NEW__'){onChange({mode:'NEW',name:''});return}
    onChange({mode:'EXISTING',placeId:raw})
  }
  async function search(){
    if(!placeSearch)return
    const q=query.trim()
    if(!q){setError(text.placePicker.queryRequired);setResults([]);setSuggestions([]);return}
    if(autocompleteEnabled)abandonAutocomplete()
    const generation=++requestGenerationRef.current
    setSearching(true);setError('');setSelectedKey(null);onPreview?.(null)
    try{
      if(autocompleteEnabled){
        const session=await ensureAutocompleteSession()
        const found=session?await session.suggest(q):[]
        if(generation!==requestGenerationRef.current)return
        setSuggestions(found);setResults([])
        if(found.length===0)setError(text.placePicker.noAutocomplete)
      }else{
        const found=await searchPlaceCandidates(placeSearch,q)
        if(generation!==requestGenerationRef.current)return
        setResults(found);setSuggestions([])
        if(found.length===0)setError(text.placePicker.noResults)
      }
    }catch(e){
      if(generation!==requestGenerationRef.current)return
      setResults([]);setSuggestions([]);setError(e instanceof Error?e.message:text.placePicker.searchFailed)
    }finally{if(generation===requestGenerationRef.current)setSearching(false)}
  }
  function chooseCandidate(candidate:PlaceCandidate,index:number){
    abandonAutocomplete()
    const key=candidateKey(candidate,index)
    setSelectedKey(key);setSuggestions([])
    onChange(placeChoiceFromCandidate(candidate,query));onPreview?.(candidate)
  }
  async function chooseSuggestion(suggestion:PlaceAutocompleteSuggestion){
    const session=autocompleteSessionRef.current
    if(!session)return
    const requestGeneration=++requestGenerationRef.current
    setSearching(true);setError('')
    try{
      const candidate=await session.select(suggestion)
      if(requestGeneration!==requestGenerationRef.current)return
      autocompleteSessionRef.current=null;autocompleteSessionGenerationRef.current++
      setSuggestions([]);setResults([])
      onChange(placeChoiceFromCandidate(candidate,query));onPreview?.(candidate)
    }catch(e){
      autocompleteSessionRef.current=null;autocompleteSessionGenerationRef.current++
      if(requestGeneration===requestGenerationRef.current)setError(e instanceof Error?e.message:text.placePicker.detailsFailed)
    }finally{if(requestGeneration===requestGenerationRef.current)setSearching(false)}
  }
  function editNew(patch:Partial<Extract<PlaceChoice,{mode:'NEW'}>>){
    if(value.mode!=='NEW')return
    setSelectedKey(null);onPreview?.(null)
    onChange(patchNewPlaceChoiceAsUser(value,patch))
  }
  function editQuery(next:string){
    if(suggestions.length||autocompleteSessionRef.current)abandonAutocomplete()
    setQuery(next);setSuggestions([]);setResults([]);setError('')
  }
  const selectedPlace=value.mode==='EXISTING'?places.find(place=>place.id===value.placeId):undefined
  return <div className="place-picker-control">
    <label className="editor-field editor-field-wide"><span>{label}</span><select value={choiceValue(value)} onChange={e=>choose(e.target.value)}>
      {allowNone&&<option value="__NONE__">{noneLabel}</option>}
      <option value="__NEW__">{text.placePicker.newPlace}</option>
      {places.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}
    </select><small>{selectedPlace?`${text.placePicker.currentPlace} · ${selectedPlace.name}`:help}</small></label>
    {value.mode==='NEW'&&<>
      {placeSearch&&<div className="editor-field editor-field-wide"><span>{text.placePicker.searchLabel}</span><form className="place-search-row" onSubmit={e=>{e.preventDefault();void search()}}><input value={query} onChange={e=>editQuery(e.target.value)} placeholder={text.placePicker.searchPlaceholder}/><button type="submit" disabled={searching}>{searching?text.placePicker.searching:text.placePicker.search}</button></form><small>{text.placePicker.explicitSearchHelp}</small>{error&&<small className="place-search-error">{error}</small>}</div>}
      {autocompleteEnabled&&suggestions.length>0&&<div className="editor-field editor-field-wide place-search-results"><span>{text.placePicker.suggestions}</span>{suggestions.map(suggestion=><button type="button" key={suggestion.id} onClick={()=>void chooseSuggestion(suggestion)}><strong>{suggestion.name}</strong>{suggestion.secondaryText&&<small>{suggestion.secondaryText}</small>}</button>)}</div>}
      {!autocompleteEnabled&&results.length>0&&<div className="editor-field editor-field-wide place-search-results"><span>{text.placePicker.results}</span>{results.map((candidate,index)=>{const key=candidateKey(candidate,index);return <button type="button" key={key} className={selectedKey===key?'selected':''} onClick={()=>chooseCandidate(candidate,index)}><strong>{candidate.name}</strong>{candidate.address&&<small>{candidate.address}</small>}</button>})}</div>}
      {allowManual&&<><label className="editor-field editor-field-wide"><span>{text.placePicker.placeName}</span><input value={value.name} onChange={e=>editNew({name:e.target.value})} placeholder={text.placePicker.manualPlaceholder}/>{value.address&&<small className="place-picker-selected-address">{value.address}</small>}</label>{!showCoordinates?<div className="editor-field editor-field-wide"><button type="button" className="inline-add-button" onClick={()=>setShowCoordinates(true)}>{text.placePicker.manualCoordinates}</button></div>:<div className="editor-grid editor-subgrid place-coordinate-grid"><label className="editor-field"><span>{text.placePicker.latitude}</span><input type="number" step="any" value={value.lat??''} onChange={e=>editNew({lat:e.target.value===''?undefined:Number(e.target.value)})}/></label><label className="editor-field"><span>{text.placePicker.longitude}</span><input type="number" step="any" value={value.lng??''} onChange={e=>editNew({lng:e.target.value===''?undefined:Number(e.target.value)})}/></label></div>}</>}
    </>}
  </div>
}
