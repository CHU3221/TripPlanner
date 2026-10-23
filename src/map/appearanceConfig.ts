import appearanceConfigJson from '../../config/map-appearance.config.json'
import type { MapColor, MapMarkerPrimitive, MapPathPrimitive } from './provider/contract'

/** Pure application appearance policy; renderer remains provider-agnostic. */
export type MapPathAppearance = { stroke: NonNullable<MapPathPrimitive['stroke']>; color: MapColor | null; directionColor: MapColor | null }
export type MapMarkerAppearance = { color: MapColor | null }
export type MapAppearanceConfig = {
  schemaVersion: 1
  paths: { connection: MapPathAppearance; majorTransport: MapPathAppearance; autoRoute: MapPathAppearance }
  markers: { regular: MapMarkerAppearance; waypoint: MapMarkerAppearance; searchPreview: MapMarkerAppearance }
}

function mapColor(value: unknown, key: string): MapColor | null {
  if (value === null) return null
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value)) return value
  throw new Error(`Invalid map appearance color: ${key}; expected null, #RRGGBB or #RRGGBBAA`)
}
function pathAppearance(raw: unknown, key: string): MapPathAppearance {
  if (!raw || typeof raw !== 'object') throw new Error(`Missing map path appearance: ${key}`)
  const item = raw as Record<string, unknown>
  if (item.stroke !== 'SOLID' && item.stroke !== 'DASHED') throw new Error(`Invalid map stroke: ${key}`)
  return { stroke: item.stroke, color: mapColor(item.color, key), directionColor: mapColor(item.directionColor ?? null, `${key}.directionColor`) }
}
function markerAppearance(raw: unknown, key: string): MapMarkerAppearance {
  if (!raw || typeof raw !== 'object') throw new Error(`Missing map marker appearance: ${key}`)
  return { color: mapColor((raw as Record<string, unknown>).color, key) }
}

export function parseMapAppearanceConfig(input: unknown): MapAppearanceConfig {
  if (!input || typeof input !== 'object') throw new Error('Invalid map appearance config')
  const root = input as Record<string, unknown>
  if (root.schemaVersion !== 1) throw new Error('Unsupported map appearance schemaVersion')
  if (!root.paths || typeof root.paths !== 'object' || !root.markers || typeof root.markers !== 'object') {
    throw new Error('Map appearance requires paths and markers')
  }
  const paths = root.paths as Record<string, unknown>
  const markers = root.markers as Record<string, unknown>
  return {
    schemaVersion: 1,
    paths: {
      connection: pathAppearance(paths.connection, 'paths.connection'),
      majorTransport: pathAppearance(paths.majorTransport, 'paths.majorTransport'),
      autoRoute: pathAppearance(paths.autoRoute, 'paths.autoRoute'),
    },
    markers: {
      regular: markerAppearance(markers.regular, 'markers.regular'),
      waypoint: markerAppearance(markers.waypoint, 'markers.waypoint'),
      searchPreview: markerAppearance(markers.searchPreview, 'markers.searchPreview'),
    },
  }
}

/** Build-time config: editing JSON requires rebuild/redeploy, not a new History gesture. */
export const MAP_APPEARANCE = parseMapAppearanceConfig(appearanceConfigJson)

export function appearanceForPath(
  path: MapPathPrimitive,
  kind: keyof MapAppearanceConfig['paths'],
  config: MapAppearanceConfig = MAP_APPEARANCE,
): MapPathPrimitive {
  const style = config.paths[kind]
  return { ...path, stroke: style.stroke, ...(path.color ? {} : style.color ? { color: style.color } : {}), ...(path.directionColor ? {} : style.directionColor ? { directionColor: style.directionColor } : {}) }
}

export function appearanceForMarker(
  marker: MapMarkerPrimitive,
  kind: keyof MapAppearanceConfig['markers'],
  config: MapAppearanceConfig = MAP_APPEARANCE,
): MapMarkerPrimitive {
  const color = config.markers[kind].color
  return color ? { ...marker, color } : marker
}
