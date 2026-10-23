import type {
  MajorTransportData,
  VisitData,
} from '../model'

export type ScheduleConflict =
  | {
      kind: 'VISIT_OVERLAP'
      visitIds: [string, string]
      start: number
      end: number
    }
  | {
      kind: 'MAJOR_TRANSPORT_OVERLAP'
      visitId: string
      transportId: string
      start: number
      end: number
    }

function overlapRange(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
) {
  const start = Math.max(startA, startB)
  const end = Math.min(endA, endB)
  return end > start ? { start, end } : null
}

export function findScheduleConflicts(
  visits: VisitData[],
  transports: MajorTransportData[],
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = []
  const sortedVisits = [...visits].sort((a, b) => a.start - b.start || a.end - b.end)

  for (let i = 0; i < sortedVisits.length; i += 1) {
    for (let j = i + 1; j < sortedVisits.length; j += 1) {
      if (sortedVisits[j].start >= sortedVisits[i].end) break
      const overlap = overlapRange(
        sortedVisits[i].start,
        sortedVisits[i].end,
        sortedVisits[j].start,
        sortedVisits[j].end,
      )
      if (overlap) {
        conflicts.push({
          kind: 'VISIT_OVERLAP',
          visitIds: [sortedVisits[i].id, sortedVisits[j].id],
          ...overlap,
        })
      }
    }
  }

  for (const visit of visits) {
    for (const transport of transports) {
      const overlap = overlapRange(
        visit.start,
        visit.end,
        transport.occupiedFrom,
        transport.occupiedUntil,
      )
      if (overlap) {
        conflicts.push({
          kind: 'MAJOR_TRANSPORT_OVERLAP',
          visitId: visit.id,
          transportId: transport.id,
          ...overlap,
        })
      }
    }
  }

  return conflicts
}
