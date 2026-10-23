import type { MapPathPrimitive } from './provider/contract'
import { DEFAULT_CONNECTION_WIDTH_PX, normalizeConnectionWidthPx } from './tripMapSettings'

/** Provider-neutral path thickness. The saved Trip value is the base line width in CSS pixels. */
export function mapPathBaseWidth(path: Pick<MapPathPrimitive,'strokeWidthPx'>): number {
  return normalizeConnectionWidthPx(path.strokeWidthPx??DEFAULT_CONNECTION_WIDTH_PX)
}

export function mapPathStrokeWeight(path: Pick<MapPathPrimitive,'strokeWidthPx'|'state'|'emphasis'>): number {
  const base=mapPathBaseWidth(path)
  const stateBoost=path.state==='SELECTED'?2:path.state==='HOVERED'?1:0
  const emphasisBoost=path.emphasis==='STRONG'?1:0
  return base+stateBoost+emphasisBoost
}

/**
 * Direction-arrow sizing follows the saved connection width without pulsing when
 * hover/selection temporarily thickens the line. Square-root scaling keeps very
 * thick custom lines readable without producing oversized arrow glyphs.
 */
export function mapPathArrowMetrics(path: Pick<MapPathPrimitive,'strokeWidthPx'>){
  const base=mapPathBaseWidth(path)
  const factor=Math.max(0.72,Math.min(3,Math.sqrt(base/DEFAULT_CONNECTION_WIDTH_PX)))
  return {
    googleScale:Number((1.45*factor).toFixed(2)),
    googleOutlineWeight:Number((0.7*Math.max(0.9,Math.min(factor,1.9))).toFixed(2)),
    offsetPx:Math.round(28*factor),
    repeatPx:Math.round(44*factor),
    naverFontPx:Math.max(7,Math.round(9*factor)),
    naverShadowPx:Number((1.5*factor).toFixed(1)),
    naverAnchorPx:Math.max(4,Math.round(5*factor)),
  }
}
