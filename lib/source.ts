import 'server-only'
import { cache } from 'react'
import { after } from 'next/server'
import { readFile } from 'node:fs/promises'
import { REVALIDATE_S, SOURCE_URL } from './config'
import { shortLabels, sortGroups } from './groups'
import {
  APPLIES,
  addDays,
  isEmergency,
  kyivNow,
  parseGroup,
  type Day,
  type GroupData,
  type RawGroup,
} from './schedule'
import { loadSnapshot, saveSnapshots, type Snapshot } from './snapshots'

export interface ScheduleData {
  groups: Record<string, GroupData>
  /** Sorted group ids */
  ids: string[]
  /** Labels without the subgroup number ("12" instead of "12.1") */
  short: boolean
  fetchedAt: string
  /** live = fresh data; saved = source unreachable, built from saved schedules */
  source: 'live' | 'saved'
  /** For source "saved": when the newest saved schedule was stored */
  savedAt: string | null
  /** Load error (with source "saved", the page still has data) */
  error: string | null
}

/**
 * Loads the schedule data on the server (cached REVALIDATE_S).
 *
 * Dev only: SCHEDULE_FIXTURE=<path> reads the data from a JSON file instead,
 * re-read on every request (a missing file behaves like a failed load).
 */
export const DATA_TAG = 'schedule'

/** fresh = bypass the data cache (the poller); otherwise cached REVALIDATE_S under DATA_TAG. */
export async function fetchRaw({ fresh = false } = {}): Promise<Record<string, RawGroup>> {
  const fixture = process.env.NODE_ENV !== 'production' ? process.env.SCHEDULE_FIXTURE : undefined
  let body: unknown
  if (fixture) {
    body = JSON.parse(await readFile(fixture, 'utf8'))
  } else {
    const res = await fetch(SOURCE_URL, {
      ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: REVALIDATE_S, tags: [DATA_TAG] } }),
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.json()
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('unexpected data')
  return body as Record<string, RawGroup>
}

export const fetchSchedule = cache(async (): Promise<ScheduleData> => {
  const fetchedAt = new Date().toISOString()
  let raw: Record<string, RawGroup>
  try {
    raw = await fetchRaw()
  } catch (e) {
    return fromSnapshots(fetchedAt, e instanceof Error ? e.message : String(e))
  }

  const groups = parseAll(raw)

  // Keep published days for later emergencies, without delaying the response.
  after(() => saveSnapshots(groups))
  await attachSaved(groups)

  const ids = sortGroups(Object.keys(groups))
  return { groups, ids, short: shortLabels(ids), fetchedAt, source: 'live', savedAt: null, error: null }
})

export function parseAll(raw: Record<string, RawGroup>): Record<string, GroupData> {
  const groups: Record<string, GroupData> = {}
  for (const [id, g] of Object.entries(raw)) groups[id] = parseGroup(g)
  return groups
}

/** Emergency days without slots get the last published schedule of that date. */
async function attachSaved(groups: Record<string, GroupData>): Promise<void> {
  const needs = (d: Day) => isEmergency(d) && !d.hasSlots
  const dates = new Set<string>()
  for (const g of Object.values(groups)) for (const d of g.days) if (needs(d)) dates.add(d.date)

  for (const date of dates) {
    const snap = await loadSnapshot(date)
    if (!snap) continue
    for (const [id, g] of Object.entries(groups)) {
      const s = snap.groups[id]
      const d = g.days.find((x) => x.date === date)
      if (s && d && needs(d))
        d.saved = { outages: s.o, possible: s.p, updatedOn: s.u, savedAt: snap.savedAt }
    }
  }
}

/** Source unreachable: rebuild today and tomorrow from saved schedules. */
async function fromSnapshots(fetchedAt: string, error: string): Promise<ScheduleData> {
  const today = kyivNow().date
  const dates = [today, addDays(today, 1)]
  const snaps = (await Promise.all(dates.map((d) => loadSnapshot(d)))).map((s, i) =>
    s ? { date: dates[i], ...s } : null,
  ).filter((s): s is Snapshot & { date: string } => s !== null)

  const groups: Record<string, GroupData> = {}
  for (const snap of snaps) {
    for (const [id, s] of Object.entries(snap.groups)) {
      const g = (groups[id] ??= { days: [], updatedOn: null })
      g.days.push({ date: snap.date, status: APPLIES, hasSlots: true, outages: s.o, possible: s.p })
      if (s.u && (!g.updatedOn || s.u > g.updatedOn)) g.updatedOn = s.u
    }
  }
  const ids = sortGroups(Object.keys(groups))
  const savedAt = snaps.map((s) => s.savedAt).sort().pop() ?? null
  return {
    groups,
    ids,
    short: shortLabels(ids),
    fetchedAt,
    source: ids.length ? 'saved' : 'live',
    savedAt,
    error,
  }
}
