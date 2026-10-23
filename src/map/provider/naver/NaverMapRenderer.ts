import type {
  MapInteractionHandlers,
  MapMarkerPrimitive,
  MapPathPrimitive,
  MapRenderer,
} from '../contract'
import { MapProviderError } from '../contract'
import type { GeoPoint } from '../../../domain/place'
import { sampleScreenSpaceArrows } from '../../pathArrowSampling'
import { mapPathArrowMetrics, mapPathStrokeWeight } from '../../pathThickness'

import { loadNaverMaps, type NaverMaps } from './NaverMapsSdk'

const DEFAULT_CENTER: GeoPoint = { lat: 37.5665, lng: 126.978 }
const DEFAULT_ZOOM = 2
const PLACE_DEFAULT_ZOOM = 11
const PLACE_FOCUS_ZOOM = 15


function normalizeMapColor(value: string | undefined) {
  if (!value) return undefined
  return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value) ? value : undefined
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function markerHtml(marker: MapMarkerPrimitive) {
  const classes = [
    'trip-map-pin',
    marker.size === 'SMALL' && 'is-small',
    (marker.badge ?? 0) > 0 && 'has-unscheduled',
    marker.state === 'HOVERED' && 'is-hovered',
    marker.state === 'SELECTED' && 'is-selected',
  ].filter(Boolean).join(' ')

  const label = marker.label ? ` title="${escapeHtml(marker.label)}"` : ''
  const badge = (marker.badge ?? 0) > 0
    ? `<span class="trip-map-pin-badge">${marker.badge}</span>`
    : ''
  const icon = marker.icon && marker.size !== 'SMALL' ? `<span class="material-symbols-rounded trip-map-pin-icon">${escapeHtml(marker.icon)}</span>` : ''
  const color = normalizeMapColor(marker.color)
  const style = color ? ` style="--map-pin-color:${color}"` : ''

  return `<div class="${classes}"${label}${style}><span class="trip-map-pin-dot">${icon}</span>${badge}</div>`
}

function normalizeError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

/**
 * NAVER Dynamic Map adapter.
 *
 * Responsibilities:
 * - own NAVER JS SDK loading and map/marker/polyline instances
 * - translate provider-neutral map primitives into NAVER objects
 * - report primitive ids back to the Application on hover/click
 *
 * Non-responsibilities:
 * - TripPlace/Bucket/Visit lookup
 * - selection semantics or popup content
 * - provider search / geocoding / route API calls
 */
export class NaverMapRenderer implements MapRenderer {
  private readonly clientId: string
  private maps: NaverMaps | null = null
  private map: any = null
  private container: HTMLElement | null = null
  private handlers: MapInteractionHandlers = {}
  private markers = new Map<string, any>()
  private markerListeners = new Map<string, any[]>()
  private paths = new Map<string, any>()
  private pathListeners = new Map<string, any[]>()
  private directionMarkers: any[] = []
  private directionListeners: any[] = []
  private resizeObserver: ResizeObserver | null = null
  private markerSnapshot: readonly MapMarkerPrimitive[] = []
  private pathSnapshot: readonly MapPathPrimitive[] = []
  private mountGeneration = 0
  private suppressBackgroundClick = false

  constructor(clientId: string) {
    this.clientId = clientId.trim()
  }

  async mount(container: HTMLElement, handlers?: MapInteractionHandlers): Promise<void> {
    if (!this.clientId) {
      throw new MapProviderError('AUTH_ERROR', 'VITE_NAVER_MAP_CLIENT_ID가 설정되지 않았습니다.')
    }

    this.clearRuntime()
    const generation = ++this.mountGeneration
    this.container = container
    this.handlers = handlers ?? {}

    try {
      const maps = await loadNaverMaps(this.clientId)
      // React StrictMode/HMR may dispose a pending mount before the SDK promise resolves.
      // A stale mount must never recreate the provider after unmount.
      if (generation !== this.mountGeneration || this.container !== container) return
      this.maps = maps
      const first = this.markerSnapshot[0]?.position ?? DEFAULT_CENTER
      this.map = new maps.Map(container, {
        center: new maps.LatLng(first.lat, first.lng),
        zoom: this.markerSnapshot[0]?.position ? PLACE_DEFAULT_ZOOM : DEFAULT_ZOOM,
        minZoom: 1,
      })
      this.startResizeObserver()
      this.directionListeners = [
        this.maps.Event.addListener(this.map, 'idle', () => this.renderDirectionMarkers()),
        this.maps.Event.addListener(this.map, 'click', () => {
          if (this.suppressBackgroundClick) return
          this.handlers.onMapClick?.()
        }),
      ]
      this.renderMarkers()
      this.renderPaths()
    } catch (error) {
      if (generation !== this.mountGeneration) return
      if (error instanceof MapProviderError) throw error
      throw new MapProviderError(
        'PROVIDER_UNAVAILABLE',
        `지도 초기화 실패: ${normalizeError(error, 'NAVER Map 초기화에 실패했습니다.')}`,
        error,
      )
    }
  }

  unmount(): void {
    ++this.mountGeneration
    this.clearRuntime()
    this.container = null
    this.handlers = {}
  }

  private clearRuntime() {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null

    for (const [id, marker] of this.markers) {
      for (const listener of this.markerListeners.get(id) ?? []) this.maps?.Event.removeListener?.(listener)
      marker.setMap?.(null)
    }
    this.markerListeners.clear()
    this.markers.clear()

    for (const [id, path] of this.paths) {
      for (const listener of this.pathListeners.get(id) ?? []) this.maps?.Event.removeListener?.(listener)
      path.setMap?.(null)
    }
    this.pathListeners.clear()
    this.paths.clear()
    this.clearDirectionMarkers()
    for (const listener of this.directionListeners) this.maps?.Event.removeListener?.(listener)
    this.directionListeners = []

    // NAVER Map does not expose a general destroy() method. Removing the provider-
    // owned DOM prevents a completed StrictMode/HMR mount from leaving a second map
    // surface behind when the same React host is mounted again.
    this.container?.replaceChildren()

    this.suppressBackgroundClick = false
    this.map = null
    this.maps = null
  }

  setMarkers(markers: readonly MapMarkerPrimitive[]): void {
    this.markerSnapshot = markers
    this.renderMarkers()
  }

  setPaths(paths: readonly MapPathPrimitive[]): void {
    this.pathSnapshot = paths
    this.renderPaths()
  }

  focus(position: GeoPoint): void {
    if (!this.maps || !this.map) return
    const target = new this.maps.LatLng(position.lat, position.lng)
    const targetZoom = Math.max(this.map.getZoom(), PLACE_FOCUS_ZOOM)
    this.map.morph(target, targetZoom)
  }

  fit(positions: readonly GeoPoint[]): void {
    if (!this.maps || !this.map || !positions.length) return
    if (positions.length===1){this.map.setCenter(new this.maps.LatLng(positions[0].lat,positions[0].lng));this.map.setZoom(PLACE_DEFAULT_ZOOM);return}
    const lats=positions.map(p=>p.lat),lngs=positions.map(p=>((p.lng+180)%360+360)%360-180).sort((a,b)=>a-b)
    let gap=-1,gapIndex=0
    for(let i=0;i<lngs.length;i++){const next=i===lngs.length-1?lngs[0]+360:lngs[i+1],g=next-lngs[i];if(g>gap){gap=g;gapIndex=i}}
    const span=360-gap
    if(span>0&&span<180){
      const west=lngs[(gapIndex+1)%lngs.length],east=lngs[gapIndex]
      if(west<=east){const bounds=new this.maps.LatLngBounds(new this.maps.LatLng(Math.min(...lats),west),new this.maps.LatLng(Math.max(...lats),east));this.map.fitBounds?.(bounds,48);return}
      const mid=((west+(east+360))/2+540)%360-180
      this.map.setCenter(new this.maps.LatLng((Math.min(...lats)+Math.max(...lats))/2,mid));this.map.setZoom(Math.max(2,Math.min(8,Math.floor(8-Math.log2(Math.max(1,span))))));return
    }
    const bounds=new this.maps.LatLngBounds(new this.maps.LatLng(Math.min(...lats),Math.min(...lngs)),new this.maps.LatLng(Math.max(...lats),Math.max(...lngs)));this.map.fitBounds?.(bounds,48)
  }

  private startResizeObserver() {
    if (!this.maps || !this.map || !this.container) return
    const syncSize = () => {
      if (!this.maps || !this.map || !this.container) return
      const rect = this.container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        this.map.setSize(new this.maps.Size(rect.width, rect.height))
        this.map.setOptions?.({ minZoom: 1 })
        this.renderDirectionMarkers()
      }
    }
    syncSize()
    this.resizeObserver = new ResizeObserver(syncSize)
    this.resizeObserver.observe(this.container)
  }

  private renderMarkers() {
    if (!this.maps || !this.map) return

    const live = new Set(this.markerSnapshot.map(marker => marker.id))
    for (const [id, marker] of this.markers) {
      if (!live.has(id)) {
        for (const listener of this.markerListeners.get(id) ?? []) this.maps.Event.removeListener?.(listener)
        this.markerListeners.delete(id)
        marker.setMap(null)
        this.markers.delete(id)
      }
    }

    for (const primitive of this.markerSnapshot) {
      const position = new this.maps.LatLng(primitive.position.lat, primitive.position.lng)
      const small = primitive.size === 'SMALL'
      const icon = {
        content: markerHtml(primitive),
        anchor: new this.maps.Point(small ? 7 : 14, small ? 7 : 14),
      }
      let marker = this.markers.get(primitive.id)

      if (!marker) {
        marker = new this.maps.Marker({ map: this.map, position, icon })
        const listeners = [
          this.maps.Event.addListener(marker, 'mouseover', () => this.handlers.onMarkerHover?.(primitive.id)),
          this.maps.Event.addListener(marker, 'mouseout', () => this.handlers.onMarkerHover?.(null)),
          this.maps.Event.addListener(marker, 'click', () => { this.suppressBackgroundClickForTurn(); this.handlers.onMarkerClick?.(primitive.id) }),
        ]
        this.markerListeners.set(primitive.id, listeners)
        this.markers.set(primitive.id, marker)
      } else {
        marker.setPosition(position)
        marker.setIcon(icon)
      }
    }
  }

  private suppressBackgroundClickForTurn() {
    this.suppressBackgroundClick = true
    window.setTimeout(() => { this.suppressBackgroundClick = false }, 0)
  }

  private clearDirectionMarkers() {
    for (const marker of this.directionMarkers) marker.setMap?.(null)
    this.directionMarkers = []
  }

  private renderDirectionMarkers() {
    this.clearDirectionMarkers()
    if (!this.maps || !this.map) return
    const projection = this.map.getProjection?.()
    if (!projection?.fromCoordToOffset) return
    const width = this.container?.clientWidth ?? 0
    const height = this.container?.clientHeight ?? 0
    if (!width || !height) return
    let remaining = 100 // bound marker count for long Directions geometry and slow devices
    for (const primitive of this.pathSnapshot) {
      if (primitive.direction !== 'FORWARD' || primitive.points.length < 2 || remaining <= 0) continue
      const points = primitive.points.map(point => {
        const at = projection.fromCoordToOffset(new this.maps!.LatLng(point.lat,point.lng))
        return { x: at.x, y: at.y, lat: point.lat, lng: point.lng }
      })
      const arrowMetrics = mapPathArrowMetrics(primitive)
      const arrows = sampleScreenSpaceArrows(points, arrowMetrics.repeatPx, remaining)
      const arrowColor = normalizeMapColor(primitive.directionColor) ?? '#FFFFFF'
      for (const arrow of arrows) {
        const pad=Math.max(12,arrowMetrics.naverFontPx)
        if (arrow.x < -pad || arrow.x > width+pad || arrow.y < -pad || arrow.y > height+pad) continue
        const arrowHtml = `<span aria-hidden="true" style="display:block;pointer-events:none;font:900 ${arrowMetrics.naverFontPx}px Arial,sans-serif;color:${arrowColor};opacity:.92;text-shadow:0 0 ${arrowMetrics.naverShadowPx}px rgba(30,34,38,.9);transform:rotate(${arrow.degrees}deg)">▶</span>`
        this.directionMarkers.push(new this.maps.Marker({
          map:this.map,position:new this.maps.LatLng(arrow.lat,arrow.lng),clickable:false,
          icon:{content:arrowHtml,anchor:new this.maps.Point(arrowMetrics.naverAnchorPx,arrowMetrics.naverAnchorPx)},
        }))
      }
      remaining -= arrows.length
    }
  }

  private renderPaths() {
    if (!this.maps || !this.map) return

    const live = new Set(this.pathSnapshot.map(path => path.id))
    for (const [id, path] of this.paths) {
      if (!live.has(id)) {
        for (const listener of this.pathListeners.get(id) ?? []) this.maps.Event.removeListener?.(listener)
        this.pathListeners.delete(id)
        path.setMap(null)
        this.paths.delete(id)
      }
    }

    for (const primitive of this.pathSnapshot) {
      if (primitive.points.length < 2) continue
      const naverPath = primitive.points.map(point => new this.maps.LatLng(point.lat, point.lng))
      const weight = mapPathStrokeWeight(primitive)
      const opacity = primitive.state === 'NORMAL' || !primitive.state ? 0.65 : 0.9
      let path = this.paths.get(primitive.id)

      const options = {
        clickable: true,
        path: naverPath,
        strokeOpacity: opacity,
        strokeStyle: primitive.stroke === 'DASHED' ? 'shortdash' : 'solid',
        strokeWeight: weight,
        strokeColor: normalizeMapColor(primitive.color),
      }

      if (!path) {
        path = new this.maps.Polyline({ map: this.map, ...options })
        const listeners = [
          this.maps.Event.addListener(path, 'mouseover', () => this.handlers.onPathHover?.(primitive.id)),
          this.maps.Event.addListener(path, 'mouseout', () => this.handlers.onPathHover?.(null)),
          this.maps.Event.addListener(path, 'click', () => { this.suppressBackgroundClickForTurn(); this.handlers.onPathClick?.(primitive.id) }),
        ]
        this.pathListeners.set(primitive.id, listeners)
        this.paths.set(primitive.id, path)
      } else {
        path.setOptions(options)
      }
    }
    this.renderDirectionMarkers()
  }
}
