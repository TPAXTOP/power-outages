'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  durationLabel,
  hhmm,
  isEmergency,
  liveState,
  nextLabel,
  plannedLabel,
  type Day,
  type LiveState,
} from '@/lib/schedule'
import { Alert, Bolt, BoltOff, Legend, RefreshButton, clock, stamp } from './ui'
import { markFromPicker, readRecent, useLiveClock } from './useLiveClock'

export interface PickerItem {
  id: string
  label: string
  days: Day[]
  updatedOn: string | null
}

interface Props {
  items: PickerItem[]
  fetchedAt: string
  source: 'live' | 'saved'
  savedAt: string | null
  error: string | null
}

export default function GroupPicker({ items, fetchedAt, source, savedAt, error }: Props) {
  const { now, pending, refresh } = useLiveClock(fetchedAt)
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => setRecent(readRecent()), [])

  const byId = new Map(items.map((it) => [it.id, it]))
  const recentItems = recent.map((id) => byId.get(id)).filter((x): x is PickerItem => !!x)
  const states = new Map(items.map((it) => [it.id, liveState(it.days, now)]))
  const emergencyCount = items.filter((it) =>
    it.days.some((d) => d.date === now.date && isEmergency(d)),
  ).length
  const updatedOn = items.map((it) => it.updatedOn ?? '').sort().pop()

  return (
    <>
      <header className="top">
        <h1>Відключення світла</h1>
        <RefreshButton pending={pending} onClick={refresh} />
      </header>

      {items.length === 0 && (
        <div className="notice error">Не вдалося завантажити графік: {error}</div>
      )}

      {source === 'saved' && (
        <div className="notice warn">
          Не вдалося отримати свіжі дані ({error}). Показано збережені графіки
          {savedAt ? ` станом на ${stamp(savedAt, now.date)}` : ''}, вони могли змінитися.
        </div>
      )}

      {emergencyCount > 0 && (
        <div className="notice alert" role="alert">
          <Alert />
          <span>
            Екстрені відключення
            {emergencyCount < items.length ? ` у ${emergencyCount} групах` : ''}: планові графіки
            можуть не виконуватись. Відкрийте групу, щоб побачити останній опублікований графік.
          </span>
        </div>
      )}

      {recentItems.length > 0 && (
        <section className="picker-section">
          <h2 className="section-title">Нещодавні</h2>
          <div className="recent-list">
            {recentItems.map((it) => (
              <RecentCard key={it.id} item={it} st={states.get(it.id)!} />
            ))}
          </div>
        </section>
      )}

      {items.length > 0 && (
        <section className="picker-section">
          <h2 className="section-title">{recentItems.length ? 'Усі групи' : 'Оберіть свою групу'}</h2>
          <div className="pick-grid">
            {items.map((it) => (
              <GroupTile key={it.id} item={it} st={states.get(it.id)!} />
            ))}
          </div>
        </section>
      )}

      <Legend emergency={emergencyCount > 0} />

      {items.length > 0 && (
        <footer>
          <p>
            Графік оновлено {updatedOn ? stamp(updatedOn, now.date) : '—'}
            {source === 'live' && <> · отримано о {clock(fetchedAt)}</>}
          </p>
        </footer>
      )}
    </>
  )
}

function look(st: LiveState): { cls: string; icon: React.ReactNode; text: string } {
  switch (st.kind) {
    case 'on':
      return { cls: 'on', icon: <Bolt />, text: `світло є, ${nextLabel(st).toLowerCase()}` }
    case 'off':
      return { cls: 'off', icon: <BoltOff />, text: `світла немає, ${nextLabel(st).toLowerCase()}` }
    case 'emergency':
      // Keep the planned colours so the grid stays informative; the outline marks the emergency.
      return st.planned
        ? {
            cls: `${st.planned.kind} em`,
            icon: <Alert />,
            text: `екстрені відключення. ${plannedLabel(st.planned).toLowerCase()}`,
          }
        : { cls: 'alert', icon: <Alert />, text: 'екстрені відключення' }
    default:
      return { cls: 'unknown', icon: null, text: 'графіка немає' }
  }
}

/** "до 16:30": how long the current (or, in an emergency, planned) state lasts. */
function untilShort(st: LiveState): string | null {
  const s = st.kind === 'emergency' ? st.planned : st.kind === 'unknown' ? null : st
  if (!s || s.changeAt === null) return null
  return `до ${hhmm(s.changeAt > 1440 ? s.changeAt - 1440 : s.changeAt)}`
}

function GroupTile({ item, st }: { item: PickerItem; st: LiveState }) {
  const { cls, icon, text } = look(st)
  const href = `/${item.label}`
  const until = untilShort(st)
  return (
    <Link
      href={href}
      className={`tile pick ${cls}`}
      aria-label={`Група ${item.label}: ${text}`}
      onClick={() => markFromPicker(href)}
    >
      <span className="pick-num">
        {icon}
        {item.label}
      </span>
      <span className="pick-until">{until ?? ' '}</span>
    </Link>
  )
}

function RecentCard({ item, st }: { item: PickerItem; st: LiveState }) {
  const href = `/${item.label}`
  let cls: string
  let icon: React.ReactNode
  let headline: string
  let sub: string
  if (st.kind === 'emergency') {
    cls = 'alert'
    icon = <Alert />
    headline = 'Екстрені відключення'
    const p = st.planned
    sub = p ? plannedLabel(p) : 'Плановий графік може не виконуватись'
  } else if (st.kind === 'unknown') {
    cls = 'unknown'
    icon = null
    headline = 'Графіка немає'
    sub = st.reason
  } else {
    cls = st.kind
    icon = st.kind === 'off' ? <BoltOff /> : <Bolt />
    headline = st.kind === 'off' ? 'Світла немає' : 'Світло є'
    sub = nextLabel(st)
    if (st.minutesLeft !== null && !st.openEnded) sub += ` · через ${durationLabel(st.minutesLeft)}`
  }
  return (
    <Link
      href={href}
      className={`recent status ${cls}`}
      aria-label={`Група ${item.label}: ${headline}, ${sub}`}
      onClick={() => markFromPicker(href)}
    >
      <span className="recent-group">
        <small>Група</small>
        <b>{item.label}</b>
      </span>
      <span className="recent-main">
        <span className="headline">
          {icon}
          {headline}
        </span>
        <span className="sub">{sub}</span>
      </span>
      <svg className="chevron" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M9 5l7 7-7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  )
}
