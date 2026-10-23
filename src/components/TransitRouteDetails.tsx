import type { RouteTransitStep } from '../map/provider/contract'
import { text as ui } from '../i18n/catalog'

const STEP_ICONS: Record<RouteTransitStep['mode'],string> = {
  WALK: 'directions_walk', BUS: 'directions_bus', SUBWAY: 'subway', TRAIN: 'train', OTHER: 'directions_transit',
}
const STEP_LABELS: Record<RouteTransitStep['mode'],string> = {
  WALK: ui.transit.walk, BUS: ui.transit.bus, SUBWAY: ui.transit.subway, TRAIN: ui.transit.train, OTHER: ui.transit.other,
}

/** Absolute instant shown in the viewer device timezone (not necessarily the trip timezone). */
function clockText(iso: string | undefined) {
  if (!iso) return undefined
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return undefined
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

export function TransitRouteDetails({ steps }: { steps: readonly RouteTransitStep[] | undefined }) {
  if (!steps?.length) return <p className="transit-details-missing">{ui.transit.missing}</p>
  const hasTime = steps.some(step => step.arrivalAt || step.departureAt)
  return <section className="transit-details" aria-label={ui.transit.aria}>
    <strong className="transit-details-title">{ui.transit.title}</strong>
    <ol className="transit-step-list">
      {steps.map((step,index) => {
        const routeName = [step.lineName, step.lineShortName && step.lineShortName !== step.lineName ? step.lineShortName : undefined].filter(Boolean).join(' · ')
        const label = step.mode === 'WALK' ? ui.transit.walk : routeName || step.vehicleName || STEP_LABELS[step.mode]
        const heading = step.headsign ? ui.transit.direction(step.headsign) : undefined
        const departure = clockText(step.departureAt)
        const arrival = clockText(step.arrivalAt)
        return <li key={index} className="transit-step">
          <span className="material-symbols-rounded transit-step-icon" aria-hidden="true">{STEP_ICONS[step.mode]}</span>
          <div className="transit-step-body">
            <div className="transit-step-heading"><strong>{label}</strong>{step.durationMinutes !== undefined && <span>{step.durationMinutes}{ui.common.minutes}</span>}{step.distanceMeters !== undefined && step.mode === 'WALK' && <small>{Math.round(step.distanceMeters)}m</small>}</div>
            {step.mode !== 'WALK' && heading && <div className="transit-step-headsign">{heading}</div>}
            {step.departureStop && <div><span className="transit-step-stop-label">{ui.transit.board}</span> {step.departureStop}{departure && <small> · {departure}</small>}</div>}
            {step.arrivalStop && <div><span className="transit-step-stop-label">{ui.transit.alight}</span> {step.arrivalStop}{arrival && <small> · {arrival}</small>}</div>}
            {step.stopCount !== undefined && step.mode !== 'WALK' && <small>{ui.transit.stops(step.stopCount)}</small>}
            {step.instruction && <p>{step.instruction}</p>}
          </div>
        </li>
      })}
    </ol>
    {hasTime && <small className="transit-time-note">{ui.transit.timeNote}</small>}
  </section>
}
