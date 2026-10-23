import type { RouteTransitStep } from '../contract'

/**
 * Convert Google Maps JavaScript Routes library legs/steps into small, plain
 * provider-neutral runtime details. No original SDK objects or route payloads
 * leave this adapter. The list is optional; lack of detail is not a fake step.
 * https://developers.google.com/maps/documentation/javascript/reference/route
 */
const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const finitePositive = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

const timeInstant = (value: unknown): string | undefined => {
  // TransitDetails departureTime / arrivalTime are JS Date objects in the
  // current Maps JavaScript Routes SDK. The fallback accepts an ISO string
  // only for version tolerant mocks; malformed values are omitted.
  const time = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return time && Number.isFinite(time.getTime()) ? time.toISOString() : undefined
}

const vehicleMode = (step: any): RouteTransitStep['mode'] => {
  if (step?.travelMode === 'WALKING') return 'WALK'
  if (step?.travelMode !== 'TRANSIT') return 'OTHER'
  const vehicle = String(step?.transitDetails?.transitLine?.vehicle?.vehicleType ?? '').toUpperCase()
  if (vehicle.includes('BUS') || vehicle === 'TROLLEYBUS') return 'BUS'
  if (vehicle === 'SUBWAY' || vehicle === 'METRO' || vehicle === 'UNDERGROUND') return 'SUBWAY'
  if (['RAIL','TRAIN','TRAM','LIGHT_RAIL','HEAVY_RAIL','COMMUTER_TRAIN','HIGH_SPEED_TRAIN','MONORAIL','CABLE_CAR','FUNICULAR'].includes(vehicle)) return 'TRAIN'
  return 'OTHER'
}

export function normalizeGoogleTransitSteps(legs: unknown): RouteTransitStep[] {
  if (!Array.isArray(legs)) return []
  const result: RouteTransitStep[] = []
  for (const leg of legs) {
    if (!Array.isArray(leg?.steps)) continue
    for (const step of leg.steps) {
      if (!step || typeof step !== 'object') continue
      const detail = step.transitDetails
      const line = detail?.transitLine
      const ms = finitePositive(step.staticDurationMillis)
      const distanceMeters = finitePositive(step.distanceMeters)
      const count = finitePositive(detail?.stopCount)
      const normalized: RouteTransitStep = {
        mode: vehicleMode(step),
        ...(stringValue(step.instructions) ? { instruction: stringValue(step.instructions) } : {}),
        ...(ms !== undefined ? { durationMinutes: Math.round(ms / 60000) } : {}),
        ...(distanceMeters !== undefined ? { distanceMeters } : {}),
        ...(stringValue(line?.name) ? { lineName: stringValue(line.name) } : {}),
        ...(stringValue(line?.shortName) ? { lineShortName: stringValue(line.shortName) } : {}),
        ...(stringValue(detail?.headsign) ? { headsign: stringValue(detail.headsign) } : {}),
        ...(stringValue(line?.vehicle?.name) ? { vehicleName: stringValue(line.vehicle.name) } : {}),
        ...(stringValue(detail?.departureStop?.name) ? { departureStop: stringValue(detail.departureStop.name) } : {}),
        ...(stringValue(detail?.arrivalStop?.name) ? { arrivalStop: stringValue(detail.arrivalStop.name) } : {}),
        ...(count !== undefined ? { stopCount: count } : {}),
        ...(timeInstant(detail?.departureTime) ? { departureAt: timeInstant(detail.departureTime) } : {}),
        ...(timeInstant(detail?.arrivalTime) ? { arrivalAt: timeInstant(detail.arrivalTime) } : {}),
      }
      // Google can return a walking step without transit metadata. Keep only
      // steps that contain useful navigation data, not empty placeholders.
      if (Object.keys(normalized).length > 1) result.push(normalized)
    }
  }
  return result
}
