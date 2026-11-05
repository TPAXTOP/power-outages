/**
 * Pure schedule logic, shared by the server (parsing) and the client (live
 * status). All times are Kyiv-local minutes from midnight.
 */

export type Window = [start: number, end: number] // minutes 0..1440

/** The last published schedule of a day, kept for emergencies. */
export interface Saved {
  outages: Window[]
  possible: Window[]
  updatedOn: string | null
  savedAt: string
}

export interface Day {
  /** Kyiv-local date, YYYY-MM-DD */
  date: string
  status: string
  /** Whether the day has any time slots (emergency days often have none) */
  hasSlots: boolean
  /** Confirmed outages, merged */
  outages: Window[]
  /** Possible outages, merged */
  possible: Window[]
  /** Set on an emergency day without slots when a saved schedule exists */
  saved?: Saved
}

export interface GroupData {
  days: Day[]
  updatedOn: string | null
}

export interface RawSlot {
  start?: number
  end?: number
  type?: string
}
export interface RawDay {
  date?: string
  status?: string
  slots?: RawSlot[]
}
export interface RawGroup {
  today?: RawDay
  tomorrow?: RawDay
  updatedOn?: string
}

export const APPLIES = 'ScheduleApplies'
export const EMERGENCY = 'EmergencyShutdowns'

export function mergeWindows(ws: Window[]): Window[] {
  const sorted = [...ws].sort((a, b) => a[0] - b[0])
  const out: Window[] = []
  for (const w of sorted) {
    const last = out[out.length - 1]
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1])
    else out.push([w[0], w[1]])
  }
  return out
}

export function parseDay(raw: RawDay | undefined): Day | null {
  if (!raw?.date) return null
  const outages: Window[] = []
  const possible: Window[] = []
  for (const s of raw.slots ?? []) {
    if (typeof s.start !== 'number' || typeof s.end !== 'number') continue
    if (s.type === 'Definite') outages.push([s.start, s.end])
    else if (s.type && s.type !== 'NotPlanned') possible.push([s.start, s.end])
  }
  return {
    date: raw.date.slice(0, 10),
    status: raw.status ?? 'Unknown',
    hasSlots: (raw.slots?.length ?? 0) > 0,
    outages: mergeWindows(outages),
    possible: mergeWindows(possible),
  }
}

export function parseGroup(raw: RawGroup): GroupData {
  return {
    days: [parseDay(raw.today), parseDay(raw.tomorrow)].filter((d): d is Day => d !== null),
    updatedOn: raw.updatedOn ?? null,
  }
}

/** Identity of a schedule, to find groups that share it. */
export function daysKey(days: Day[]): string {
  return JSON.stringify(days.map((d) => [d.date, d.status, effective(d)]))
}

export function isEmergency(day: Day): boolean {
  return day.status === EMERGENCY
}

export interface Effective {
  outages: Window[]
  possible: Window[]
  /** live = current data; saved = last published schedule (emergency without slots); null = nothing */
  from: 'live' | 'saved' | null
}

/** The windows to display for a day. */
export function effective(day: Day): Effective {
  if (day.status === APPLIES || day.hasSlots)
    return { outages: day.outages, possible: day.possible, from: 'live' }
  if (day.saved) return { outages: day.saved.outages, possible: day.saved.possible, from: 'saved' }
  return { outages: [], possible: [], from: null }
}

/** Day whose windows can tell on/off: published, or an emergency with a known schedule. */
function usable(day: Day): boolean {
  return day.status === APPLIES || (isEmergency(day) && effective(day).from !== null)
}

// ---------------------------------------------------------------- live status

export interface KyivNow {
  date: string // YYYY-MM-DD
  minute: number // 0..1439
}

export function kyivNow(d: Date = new Date()): KyivNow {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/** YYYY-MM-DD + n days */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface OnOff {
  kind: 'on' | 'off'
  /** absolute minutes from today's midnight; null = no change within published data */
  changeAt: number | null
  /** true when the current state runs to the end of the published data */
  openEnded: boolean
  minutesLeft: number | null
}

export type LiveState =
  | { kind: 'unknown'; reason: string }
  /** planned = what the (last published) schedule says, if known */
  | { kind: 'emergency'; planned: OnOff | null }
  | OnOff

/**
 * Current state. Days are chained from today while they are usable, so an
 * outage 22:30-24:00 that continues 00:00-02:00 tomorrow reports "back at 02:00".
 */
export function liveState(days: Day[], now: KyivNow): LiveState {
  const start = days.findIndex((d) => d.date === now.date)
  if (start < 0) return { kind: 'unknown', reason: 'Графіка на сьогодні немає' }
  const today = days[start]
  if (!usable(today)) {
    if (isEmergency(today)) return { kind: 'emergency', planned: null }
    return { kind: 'unknown', reason: `Графік на сьогодні: ${statusLabel(today.status)}` }
  }

  const windows: Window[] = []
  let knownUntil = 0
  for (let i = start; i < days.length; i++) {
    const d = days[i]
    if (!usable(d)) break
    const base = (i - start) * 1440
    for (const [a, b] of effective(d).outages) windows.push([base + a, base + b])
    knownUntil = base + 1440
  }
  const state = onOff(mergeWindows(windows), knownUntil, now.minute)
  return isEmergency(today) ? { kind: 'emergency', planned: state } : state
}

function onOff(merged: Window[], knownUntil: number, t: number): OnOff {
  const cur = merged.find(([a, b]) => a <= t && t < b)
  if (cur)
    return { kind: 'off', changeAt: cur[1], openEnded: cur[1] >= knownUntil, minutesLeft: cur[1] - t }
  const next = merged.find(([a]) => a > t)
  if (next) return { kind: 'on', changeAt: next[0], openEnded: false, minutesLeft: next[0] - t }
  return { kind: 'on', changeAt: null, openEnded: true, minutesLeft: null }
}

// ---------------------------------------------------------------- formatting

export function hhmm(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Absolute minute (relative to today's midnight) → "о 19:00", "о 24:00", "завтра о 02:30". */
export function whenLabel(abs: number): string {
  if (abs <= 1440) return `о ${hhmm(abs)}`
  return `завтра о ${hhmm(abs - 1440)}`
}

/** Absolute minute → "19:00" or "завтра 02:30". */
export function untilLabel(abs: number): string {
  return abs <= 1440 ? hhmm(abs) : `завтра ${hhmm(abs - 1440)}`
}

export function durationLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} хв`
  return m === 0 ? `${h} год` : `${h} год ${m} хв`
}

/** What happens next: "Відключення о 16:30", "Увімкнуть о 14:00", ... */
export function nextLabel(st: OnOff): string {
  if (st.changeAt === null) return 'Відключень за графіком більше немає'
  if (st.kind === 'off' && st.openEnded) return `Щонайменше до ${untilLabel(st.changeAt)}`
  return `${st.kind === 'off' ? 'Увімкнуть' : 'Відключення'} ${whenLabel(st.changeAt)}`
}

/** During an emergency: "За графіком: світло є · відключення о 16:30". */
export function plannedLabel(p: OnOff): string {
  const next = nextLabel(p)
  return `За графіком: ${p.kind === 'off' ? 'світла немає' : 'світло є'} · ${next.charAt(0).toLowerCase()}${next.slice(1)}`
}

export function statusLabel(status: string): string {
  switch (status) {
    case APPLIES:
      return 'графік діє'
    case 'WaitingForSchedule':
      return 'ще не опубліковано'
    case EMERGENCY:
      return 'екстрені відключення'
    default:
      return status
  }
}

export type SegmentKind = 'off' | 'possible'

/** Part of one hour tile, as fractions 0..1 of the hour. */
export interface HourSegment {
  from: number
  to: number
  kind: SegmentKind
}

/** For each hour 0..23, which parts of it are outages ("off") or "possible". */
export function hourSegments({ outages, possible }: Pick<Effective, 'outages' | 'possible'>): HourSegment[][] {
  const cells: HourSegment[][] = []
  for (let h = 0; h < 24; h++) {
    const a = h * 60
    const b = a + 60
    const segs: HourSegment[] = []
    const add = (ws: Window[], kind: SegmentKind) => {
      for (const [s, e] of ws) {
        const from = Math.max(s, a)
        const to = Math.min(e, b)
        if (from < to) segs.push({ from: (from - a) / 60, to: (to - a) / 60, kind })
      }
    }
    add(possible, 'possible')
    add(outages, 'off')
    cells.push(segs)
  }
  return cells
}

export function totalOutage(outages: Window[]): number {
  return outages.reduce((s, [a, b]) => s + (b - a), 0)
}
