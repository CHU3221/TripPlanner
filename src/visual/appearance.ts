import { DAY, timelineDateFromMinute } from '../model'

/** User-owned visual options. No provider route geometry or metrics belong here. */
export type TripDayColors = Record<string, string>
export const DAY_PALETTE = ['#3979DD', '#D46B43', '#12A38B', '#9366CA', '#CA4D89', '#93811E', '#467E92'] as const
export const VALID_VISUAL_COLOR = /^#[0-9a-fA-F]{6}$/

export function isVisualColor(value: unknown): value is string {
  return typeof value === 'string' && VALID_VISUAL_COLOR.test(value)
}

export function dayKey(minute: number): string { return timelineDateFromMinute(minute) }

/** Stable epoch-relative palette: moving a Visit to another date updates its inherited color. */
export function dayColor(minute: number, overrides: Readonly<TripDayColors> = {}): string {
  const custom = overrides[dayKey(minute)]
  if (isVisualColor(custom)) return custom
  const day = Math.floor(minute / DAY)
  return DAY_PALETTE[((day % DAY_PALETTE.length) + DAY_PALETTE.length) % DAY_PALETTE.length]
}

/** Never persist the resolved color: direct override > day override > day palette. */
export function visualColor(override: string | undefined, minute: number, days: Readonly<TripDayColors> = {}): string {
  return isVisualColor(override) ? override : dayColor(minute, days)
}


export type TripAppearanceSettings = { planBColor: string }
export const DEFAULT_PLAN_B_COLOR = '#7D8793'
export const DEFAULT_TRIP_APPEARANCE: TripAppearanceSettings = { planBColor: DEFAULT_PLAN_B_COLOR }

export function normalizeTripAppearanceSettings(value?: Partial<TripAppearanceSettings> | null): TripAppearanceSettings {
  return { planBColor: isVisualColor(value?.planBColor) ? value.planBColor : DEFAULT_PLAN_B_COLOR }
}

export function updateDayColor(days: Readonly<TripDayColors>, date: string, color?: string): TripDayColors {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid day key')
  if (color !== undefined && !isVisualColor(color)) throw new Error('Invalid visual color')
  const next = { ...days }
  if (color) next[date] = color
  else delete next[date]
  return next
}
