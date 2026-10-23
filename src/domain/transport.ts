// Compatibility aliases only.
// The interactive planner's canonical MajorTransport shape lives in ../model.ts.
// Keep this file so older imports do not silently create a second transport model.
import type { MajorTransportData } from '../model'

export type ScheduledTransportId = string
export type TransportMode = NonNullable<MajorTransportData['mode']>
export type ScheduledTransport = MajorTransportData
