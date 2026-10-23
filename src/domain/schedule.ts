// Compatibility alias only.
// The interactive planner's canonical Visit shape lives in ../model.ts.
// Keep this file so older imports do not silently create a second schedule model.
export type { VisitData as VisitEntry } from '../model'
export type ScheduleEntryId = string
