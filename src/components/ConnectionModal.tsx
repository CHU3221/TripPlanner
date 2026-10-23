import type { Dispatch, SetStateAction } from 'react'
import type { Node, TravelMode } from '../model'
import type { PlaceSearchProvider, ProviderCapabilities, RouteCandidate, RouteMode } from '../map/provider/contract'
import type { TripPlace } from '../domain/place'
import type { ConnectionSegmentDraft, PlaceChoice } from './editorTypes'
import { TransportPlacePicker } from './TransportPlacePicker'
import { TransitRouteDetails } from './TransitRouteDetails'
import { isVisualColor } from '../visual/appearance'
import { ROUTE_MODE_UI, routeModeIcon, routeModeLabel, routeModeSupported } from '../routeSearchUi'
import { text as ui } from '../i18n/catalog'

function RouteModeControls({
  mode,
  capabilities,
  loading,
  onChange,
  onSearch,
}: {
  mode: RouteMode
  capabilities: ProviderCapabilities
  loading: boolean
  onChange: (mode: RouteMode) => void
  onSearch: () => void
}) {
  const selectedSupported = routeModeSupported(capabilities, mode)
  return <section className="route-mode-panel" aria-label={ui.connection.autoRouteMode}>
    <div className="route-mode-panel-heading">
      <div><small>{ui.connection.autoRouteLookup}</small><strong>{ui.connection.autoRouteHelp}</strong></div>
      <span>{ui.connection.noCallOnSelect}</span>
    </div>
    <div className="route-mode-control" role="group" aria-label={ui.connection.modeSelection}>
      {ROUTE_MODE_UI.map(item => {
        const supported = routeModeSupported(capabilities, item.mode)
        return <button
          type="button"
          key={item.mode}
          className={mode === item.mode ? 'selected' : ''}
          disabled={!supported || loading}
          aria-pressed={mode === item.mode}
          title={supported ? ui.connection.routeSelect(item.label) : ui.connection.unsupported(item.label)}
          onClick={() => onChange(item.mode)}
        >
          <span className="material-symbols-rounded">{item.icon}</span>
          <strong>{item.label}</strong>
          {!supported && <small>{ui.connection.unsupportedShort}</small>}
        </button>
      })}
    </div>
    <button className="route-query-button" type="button" disabled={!selectedSupported || loading} onClick={onSearch}>
      <span className="material-symbols-rounded">route</span>{loading ? ui.connection.lookingUp : ui.connection.lookup}
    </button>
    {!selectedSupported && <small className="route-mode-disabled-reason">{ui.connection.unsupportedSelected}</small>}
  </section>
}

export function ConnectionModal({
  pair,
  draft,
  setDraft,
  source,
  autoWaypoints,
  setAutoWaypoints,
  runtimeRoute,
  routeMode,
  routeCapabilities,
  routeLoading,
  saveBlockedReason,
  onRouteModeChange,
  connectionName,
  setConnectionName,
  connectionMemo,
  setConnectionMemo,
  expectedDurationMinutes,
  setExpectedDurationMinutes,
  visualColor,
  setVisualColor,
  places,
  placeSearch,
  onPreviewPlaceCandidate,
  onDeleteAutoRoute,
  onClose,
  onSave,
  onAuto,
}: {
  pair: { from: Node; to: Node }
  draft: ConnectionSegmentDraft[]
  setDraft: Dispatch<SetStateAction<ConnectionSegmentDraft[]>>
  source: 'MANUAL' | 'ROUTE_API'
  autoWaypoints: PlaceChoice[]
  setAutoWaypoints: Dispatch<SetStateAction<PlaceChoice[]>>
  runtimeRoute: RouteCandidate | null
  routeMode: RouteMode
  routeCapabilities: ProviderCapabilities
  routeLoading: boolean
  saveBlockedReason?: string | null
  onRouteModeChange: (mode: RouteMode) => void
  connectionName: string
  setConnectionName: (name:string)=>void
  connectionMemo: string
  setConnectionMemo: (memo:string)=>void
  expectedDurationMinutes?: number
  setExpectedDurationMinutes: (minutes:number|undefined)=>void
  visualColor:string
  setVisualColor:(color:string)=>void
  places: TripPlace[]
  placeSearch?: PlaceSearchProvider
  onPreviewPlaceCandidate?: (candidate: import('../map/provider/contract').PlaceCandidate | null) => void
  onDeleteAutoRoute: () => void
  onClose: () => void
  onSave: () => void
  onAuto: () => void
}) {
  const auto = source === 'ROUTE_API'
  const hasWaypointDraft = draft.some((segment, index) => index < draft.length - 1 && segment.waypoint.mode !== 'NONE')

  return <div className="modal-backdrop" onPointerDown={onClose}><section className="connection-modal" onPointerDown={e => e.stopPropagation()}>
    <header><div><small>{ui.connection.planning}</small><strong>{pair.from.title} → {pair.to.title}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header>
    <div className="segment-editor">
      <div className="connection-user-metadata">
        <label>{ui.connection.name}<input value={connectionName} onChange={e=>setConnectionName(e.target.value)} placeholder={ui.connection.namePlaceholder} /></label>
        <label>{ui.common.memo}<textarea value={connectionMemo} onChange={e=>setConnectionMemo(e.target.value)} placeholder={ui.connection.memoPlaceholder} rows={2}/></label>
      </div>
      <div className="visual-color-picker connection-color-picker"><label>{ui.connection.routeColor}</label><input type="color" aria-label={ui.connection.routeColorAria} value={isVisualColor(visualColor)?visualColor:'#3979dd'} onChange={e=>setVisualColor(e.target.value)}/><span>{visualColor||ui.schedule.autoDayColor}</span><button type="button" onClick={()=>setVisualColor('')}>{ui.schedule.useDayColor}</button></div>
      <RouteModeControls mode={routeMode} capabilities={routeCapabilities} loading={routeLoading} onChange={onRouteModeChange} onSearch={onAuto}/>
      {!auto && <label className="connection-expected-duration"><span>{ui.connection.expectedDuration}</span><small>{ui.connection.expectedDurationHelp}</small><div><input type="number" min="0" max="10080" step="1" value={expectedDurationMinutes??''} onChange={e=>setExpectedDurationMinutes(e.target.value===''?undefined:Math.max(0,Math.min(10080,Math.round(Number(e.target.value)||0))))}/><span>{ui.common.minutes}</span></div></label>}
      {auto ? <div className="auto-route-card">
        <div className="auto-route-heading"><div><small>{ui.connection.pendingAuto}</small><strong><span className="material-symbols-rounded">{routeModeIcon(routeMode)}</span> {routeModeLabel(routeMode)}</strong></div><span className="auto-route-lock"><span className="material-symbols-rounded">lock</span> {ui.connection.runtimeResult}</span></div>
        <div className="auto-route-metrics">{runtimeRoute?<><span>{runtimeRoute.summary??ui.connection.routeLabel(routeModeLabel(runtimeRoute.mode))}</span><strong>{runtimeRoute.durationMinutes}{ui.common.minutes}</strong>{runtimeRoute.distanceMeters!==undefined&&<span>{(runtimeRoute.distanceMeters/1000).toFixed(1)} km</span>}</>:<span>{ui.connection.noRuntime}</span>}</div>
        {runtimeRoute?.mode === 'TRANSIT' && <TransitRouteDetails steps={runtimeRoute.transitSteps}/>}
        <div className="auto-route-waypoint-list">
          <strong>{ui.connection.autoWaypoints}</strong>
          {autoWaypoints.map((choice,index)=><div className="connection-waypoint-picker" key={index}>
            <TransportPlacePicker
              label={ui.connection.waypoint(index+1)}
              value={choice}
              onChange={next=>setAutoWaypoints(items=>items.map((item,i)=>i===index?next:item))}
              places={places}
              placeSearch={placeSearch}
              onPreview={onPreviewPlaceCandidate}
              allowNone
              noneLabel={ui.connection.placeSelect}
            />
            <div className="auto-route-waypoint-actions">
              <button type="button" disabled={index===0} onClick={()=>setAutoWaypoints(items=>{
                const next=[...items];[next[index-1],next[index]]=[next[index],next[index-1]];return next
              })}>{ui.connection.moveUp}</button>
              <button type="button" disabled={index===autoWaypoints.length-1} onClick={()=>setAutoWaypoints(items=>{
                const next=[...items];[next[index+1],next[index]]=[next[index],next[index+1]];return next
              })}>{ui.connection.moveDown}</button>
              <button type="button" onClick={()=>setAutoWaypoints(items=>items.filter((_,i)=>i!==index))}>{ui.schedule.remove}</button>
            </div>
          </div>)}
          <button type="button" onClick={()=>setAutoWaypoints(items=>[...items,{mode:'NONE'}])}>{ui.connection.addWaypoint}</button>
        </div>
        <small>{ui.connection.waypointHelp}</small>
        <small>{ui.connection.runtimeNotSaved}</small>
        <button className="delete-auto-route" type="button" onClick={onDeleteAutoRoute}><span className="material-symbols-rounded">undo</span>{ui.connection.toManual}</button>
      </div> : <>
        {draft.length === 0 && <div className="empty-route">{ui.connection.manualEmpty}</div>}
        {draft.map((segment, index) => <div className="connection-segment-block" key={segment.id}>
          <div className="segment-row">
            <select value={segment.mode} onChange={e => setDraft(items => items.map((value,j) => j === index ? { ...value, mode: e.target.value as TravelMode } : value))}><option value="WALK">{ui.transit.walk}</option><option value="SUBWAY">{ui.transit.subway}</option><option value="BUS">{ui.transit.bus}</option><option value="CAR">{ui.connection.car}</option></select>
            <input value={segment.memo ?? ''} onChange={e => setDraft(items => items.map((value,j) => j === index ? { ...value, memo: e.target.value } : value))} placeholder={ui.connection.boardingMemoPlaceholder}/>
            <input type="number" min="0" value={segment.minutes} onChange={e => setDraft(items => items.map((value,j) => j === index ? { ...value, minutes: Number(e.target.value) } : value))}/><span>{ui.common.minutes}</span>
            <button type="button" onClick={() => setDraft(items => items.filter((_,j) => j !== index))}><span className="material-symbols-rounded">delete</span></button>
          </div>
          {index === draft.length - 1 && <div className="connection-final-destination">{ui.connection.segmentArrival(index+1)} <strong>{pair.to.title}</strong></div>}
          {index < draft.length - 1 && <div className="connection-waypoint-picker">
            <TransportPlacePicker
              label={ui.connection.segmentArrivalWaypoint(index+1)}
              value={segment.waypoint}
              onChange={waypoint => setDraft(items => items.map((value,j) => j === index ? { ...value, waypoint } : value))}
              places={places}
              placeSearch={placeSearch}
              onPreview={onPreviewPlaceCandidate}
              allowNone
              noneLabel={ui.transport.waypointNone}
            />
          </div>}
        </div>)}
        <button className="add-segment" type="button" onClick={() => setDraft(items => [...items, { id: crypto.randomUUID(), mode: 'WALK', minutes: 10, waypoint: { mode: 'NONE' } }])}>{ui.connection.addSegment}</button>
        {hasWaypointDraft && <small className="connection-waypoint-note">{ui.connection.manualWaypointHelp}</small>}
      </>}
      {saveBlockedReason && <p className="route-save-blocked">{saveBlockedReason}</p>}
    </div>
    <footer><div/><div/><button onClick={onClose}>{ui.common.cancel}</button><button className="primary" disabled={!!saveBlockedReason} onClick={onSave}>{ui.common.save}</button></footer>
  </section></div>
}

export function RoutePicker({ pair, mode, routes, loading, error, selectedId, onPreview, onApply, onClose }: { pair: { from: Node; to: Node }; mode:RouteMode; routes: RouteCandidate[]; loading:boolean; error:string|null; selectedId:string|null; onPreview:(id:string)=>void; onApply:()=>void; onClose:()=>void }) {
  return <div className="modal-backdrop route-picker-backdrop"><section className="route-picker" onPointerDown={e=>e.stopPropagation()}>
    <header><div><small>{ui.connection.autoRouteEyebrow(routeModeLabel(mode))}</small><strong>{pair.from.title} → {pair.to.title}</strong></div><button onClick={onClose}><span className="material-symbols-rounded">close</span></button></header>
    {loading&&<p>{ui.connection.lookingFor(routeModeLabel(mode))}</p>}
    {error&&<p className="route-picker-error">{error}</p>}
    {!loading&&!error&&routes.length===0&&<p>{ui.connection.noRoutes(routeModeLabel(mode))} {mode==='TRANSIT'?ui.connection.transitNoRouteHelp:ui.connection.routeNoRouteHelp} {ui.connection.notAuthError}</p>}
    {routes.map((route,index)=><button className="route-choice" data-selected={selectedId===route.id||undefined} key={route.id} onClick={()=>onPreview(route.id)}><strong>{route.summary??ui.connection.routeLabel(routeModeLabel(route.mode))}</strong><span><span className="material-symbols-rounded">{routeModeIcon(route.mode)}</span> {route.durationMinutes}{ui.common.minutes}{route.distanceMeters!==undefined?` · ${(route.distanceMeters/1000).toFixed(1)} km`:''}</span><small>{ui.connection.candidate(index+1,route.id)}</small></button>)}
    {mode==='TRANSIT' && selectedId && !loading && <TransitRouteDetails steps={routes.find(route=>route.id===selectedId)?.transitSteps}/>}
    <p>{ui.connection.sessionOnly}</p>
    {mode==='TRANSIT'&&<p>{ui.connection.transitDetailNote}</p>}
    <footer><button className="route-picker-cancel" onClick={onClose}>{ui.common.cancel}</button><button className="route-picker-apply" disabled={!selectedId||loading} onClick={onApply}>{ui.connection.applyRoute}</button></footer>
  </section></div>
}
