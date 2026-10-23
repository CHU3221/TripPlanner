import type { GeoPoint } from '../../../domain/place'
import type { MapInteractionHandlers, MapMarkerPrimitive, MapPathPrimitive, MapRenderer } from '../contract'
import { googleError, loadGoogleMaps, type GoogleMaps } from './GoogleMapsSdk'
import { mapPathArrowMetrics, mapPathStrokeWeight } from '../../pathThickness'
import { recordTelemetry } from '../../../telemetry'

const COLOR = /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/
const color = (v: string | undefined, fallback = '#737b75') => v && COLOR.test(v) ? v : fallback

function markerElement(marker: MapMarkerPrimitive): HTMLElement {
  const node = document.createElement('div')
  node.className = ['trip-map-pin', marker.size === 'SMALL' ? 'is-small' : '',
    marker.badge && marker.badge > 0 ? 'has-unscheduled' : '',
    marker.state === 'HOVERED' ? 'is-hovered' : '', marker.state === 'SELECTED' ? 'is-selected' : ''].filter(Boolean).join(' ')
  node.style.setProperty('--map-pin-color', color(marker.color))
  if (marker.label) node.title = marker.label
  const dot = document.createElement('span'); dot.className = 'trip-map-pin-dot';
  if (marker.icon && marker.size !== 'SMALL') { const icon=document.createElement('span'); icon.className='material-symbols-rounded trip-map-pin-icon'; icon.textContent=marker.icon; dot.append(icon) }
  node.append(dot)
  if (marker.badge && marker.badge > 0) {
    const badge = document.createElement('span'); badge.className = 'trip-map-pin-badge'; badge.textContent = String(marker.badge); node.append(badge)
  }
  return node
}

export class GoogleMapRenderer implements MapRenderer {
  private maps: GoogleMaps | null = null
  private map: any = null
  private container: HTMLElement | null = null
  private handlers: MapInteractionHandlers = {}
  private markers = new Map<string, { instance: any; element: HTMLElement; listeners: Array<() => void> }>()
  private paths = new Map<string, { instance: any; listeners: any[] }>()
  private markerSnapshot: readonly MapMarkerPrimitive[] = []
  private pathSnapshot: readonly MapPathPrimitive[] = []
  private observer: ResizeObserver | null = null
  private mapClickListener: any = null
  private suppressBackgroundClick = false
  private generation = 0
  constructor(private readonly apiKey: string, private readonly mapId = 'DEMO_MAP_ID') {}

  async mount(container: HTMLElement, handlers?: MapInteractionHandlers): Promise<void> {
    this.clear()
    const generation = ++this.generation
    this.container = container; this.handlers = handlers ?? {}
    try {
      const maps = await loadGoogleMaps(this.apiKey)
      const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([maps.importLibrary('maps'), maps.importLibrary('marker')])
      if (generation !== this.generation || this.container !== container) return
      if (!Map || !AdvancedMarkerElement) throw Error('Google Maps 렌더링 라이브러리를 찾지 못했습니다.')
      this.maps = maps
      const hasInitialMarker = !!this.markerSnapshot[0]?.position
      const center = this.markerSnapshot[0]?.position ?? { lat: 37.5665, lng: 126.978 }
      this.map = new Map(container, { center, zoom: hasInitialMarker ? 11 : 2, mapId: this.mapId || 'DEMO_MAP_ID', mapTypeControl: false, streetViewControl: false, cameraControl: false, zoomControl: false, rotateControl: false, fullscreenControl: false })
      recordTelemetry('GOOGLE_DYNAMIC_MAP','GOOGLE')
      const syncViewport = () => {
        if (!this.map || !this.container) return
        maps.event.trigger(this.map, 'resize')
        const minZoom = Math.max(1, Math.min(8, Math.ceil(Math.log2(Math.max(256, this.container.clientHeight) / 256))))
        this.map.setOptions({ minZoom })
        if ((this.map.getZoom() ?? minZoom) < minZoom) this.map.setZoom(minZoom)
      }
      this.observer = new ResizeObserver(syncViewport)
      this.observer.observe(container)
      syncViewport()
      this.mapClickListener = this.map.addListener('click', (event: any) => {
        if (this.suppressBackgroundClick) return
        const placeId = typeof event?.placeId === 'string' ? event.placeId : ''
        const latLng = event?.latLng
        if (placeId && latLng) {
          const lat = typeof latLng.lat === 'function' ? latLng.lat() : Number(latLng.lat)
          const lng = typeof latLng.lng === 'function' ? latLng.lng() : Number(latLng.lng)
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            this.handlers.onPoiClick?.({provider:'GOOGLE',sourceRef:{provider:'GOOGLE',id:placeId},position:{lat,lng}})
            return
          }
        }
        this.handlers.onMapClick?.()
      })
      this.renderMarkers(); this.renderPaths()
    } catch (error) {
      if (generation !== this.generation) return
      throw googleError(error, 'Google 지도 초기화에 실패했습니다.')
    }
  }

  unmount(): void { ++this.generation; this.clear(); this.container = null; this.handlers = {} }
  setMarkers(markers: readonly MapMarkerPrimitive[]): void { this.markerSnapshot = markers; this.renderMarkers() }
  setPaths(paths: readonly MapPathPrimitive[]): void { this.pathSnapshot = paths; this.renderPaths() }
  focus(position: GeoPoint): void {
    if (!this.map) return
    this.map.panTo(position)
    if ((this.map.getZoom() ?? 0) < 16) this.map.setZoom(16)
  }

  fit(positions: readonly GeoPoint[]): void {
    if (!this.map || !positions.length) return
    if (positions.length === 1) { this.map.setCenter(positions[0]); this.map.setZoom(11); return }
    const lats=positions.map(p=>p.lat),lngs=positions.map(p=>((p.lng+180)%360+360)%360-180).sort((a,b)=>a-b)
    let gap=-1,gapIndex=0
    for(let i=0;i<lngs.length;i++){const next=i===lngs.length-1?lngs[0]+360:lngs[i+1],g=next-lngs[i];if(g>gap){gap=g;gapIndex=i}}
    const west=lngs[(gapIndex+1)%lngs.length],east=lngs[gapIndex]
    this.map.fitBounds({south:Math.min(...lats),north:Math.max(...lats),west,east},48)
  }

  private clear() {
    this.observer?.disconnect(); this.observer = null
    this.mapClickListener?.remove?.(); this.mapClickListener = null
    this.suppressBackgroundClick = false
    for (const entry of this.markers.values()) { entry.listeners.forEach(off => off()); entry.instance.map = null }
    for (const entry of this.paths.values()) { entry.listeners.forEach(l => l.remove()); entry.instance.setMap(null) }
    this.markers.clear(); this.paths.clear()
    this.map = null; this.maps = null
    this.container?.replaceChildren()
  }

  private renderMarkers() {
    if (!this.maps || !this.map) return
    const live = new Set(this.markerSnapshot.map(p => p.id))
    for (const [id, entry] of this.markers) if (!live.has(id)) {
      entry.listeners.forEach(off => off()); entry.instance.map = null; this.markers.delete(id)
    }
    for (const primitive of this.markerSnapshot) {
      let entry = this.markers.get(primitive.id)
      if (!entry) {
        const element = markerElement(primitive)
        const ctor = this.maps.marker.AdvancedMarkerElement
        const instance = new ctor({ map: this.map, position: primitive.position, content: element, title: primitive.label ?? '', gmpClickable: true })
        const onOver = () => this.handlers.onMarkerHover?.(primitive.id)
        const onOut = () => this.handlers.onMarkerHover?.(null)
        const onClick = (event: MouseEvent) => {
          event.stopPropagation()
          this.suppressBackgroundClickForTurn()
          this.handlers.onMarkerClick?.(primitive.id)
        }
        element.addEventListener('pointerenter', onOver); element.addEventListener('pointerleave', onOut)
        element.addEventListener('click', onClick)
        entry = { instance, element, listeners: [
          () => element.removeEventListener('pointerenter', onOver),
          () => element.removeEventListener('pointerleave', onOut),
          () => element.removeEventListener('click', onClick),
        ] }
        this.markers.set(primitive.id, entry)
      } else {
        entry.instance.position = primitive.position
        entry.instance.title = primitive.label ?? ''
        const updated = markerElement(primitive)
        entry.element.className = updated.className
        entry.element.style.cssText = updated.style.cssText
        entry.element.title = updated.title
        entry.element.replaceChildren(...Array.from(updated.childNodes))
      }
    }
  }

  private suppressBackgroundClickForTurn() {
    this.suppressBackgroundClick = true
    window.setTimeout(() => { this.suppressBackgroundClick = false }, 0)
  }

  private renderPaths() {
    if (!this.maps || !this.map) return
    const live = new Set(this.pathSnapshot.filter(p => p.points.length >= 2).map(p => p.id))
    for (const [id, entry] of this.paths) if (!live.has(id)) {
      entry.listeners.forEach(l => l.remove()); entry.instance.setMap(null); this.paths.delete(id)
    }
    for (const primitive of this.pathSnapshot) {
      if (primitive.points.length < 2) continue
      const strokeColor = color(primitive.color, '#3979DD')
      const arrowColor = color(primitive.directionColor, '#FFFFFF')
      const weight = mapPathStrokeWeight(primitive)
      const arrow = mapPathArrowMetrics(primitive)
      const dashed = primitive.stroke === 'DASHED'
      // Direction glyphs scale with the saved connection width while retaining an
      // independent high-contrast color and thin dark outline on bright basemaps.
      const symbols = [
        ...(primitive.direction === 'FORWARD' ? [{
          icon: { path: this.maps.SymbolPath.FORWARD_CLOSED_ARROW, strokeColor: '#30343A', fillColor: arrowColor,
            strokeWeight: arrow.googleOutlineWeight, fillOpacity: .92, strokeOpacity: .72, scale: arrow.googleScale }, offset: `${arrow.offsetPx}px`, repeat: `${arrow.repeatPx}px`,
        }] : dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeColor, strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '16px' }] : []),
      ]
      const options = { path: primitive.points, strokeColor, strokeWeight: weight, strokeOpacity: dashed && primitive.direction !== 'FORWARD' ? 0 : primitive.state && primitive.state !== 'NORMAL' ? 0.9 : 0.65, icons: symbols, clickable: true }
      let entry = this.paths.get(primitive.id)
      if (!entry) {
        const instance = new this.maps.Polyline({ ...options, map: this.map })
        const listeners = [
          instance.addListener('mouseover', () => this.handlers.onPathHover?.(primitive.id)),
          instance.addListener('mouseout', () => this.handlers.onPathHover?.(null)),
          instance.addListener('click', () => { this.suppressBackgroundClickForTurn(); this.handlers.onPathClick?.(primitive.id) }),
        ]
        entry = { instance, listeners }; this.paths.set(primitive.id, entry)
      } else entry.instance.setOptions(options)
    }
  }
}
