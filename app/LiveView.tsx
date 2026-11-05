'use client'

import { useEffect } from 'react'
import {
  APPLIES,
  durationLabel,
  effective,
  hhmm,
  hourSegments,
  isEmergency,
  liveState,
  nextLabel,
  plannedLabel,
  statusLabel,
  totalOutage,
  type Day,
  type GroupData,
  type HourSegment,
  type KyivNow,
  type Window,
} from '@/lib/schedule'
import { Alert, BackButton, Bolt, BoltOff, Legend, RefreshButton, clock, dateLabel, stamp } from './ui'
import { pushRecent, useLiveClock } from './useLiveClock'

interface Props {
  id: string
  label: string
  group: GroupData
  /** Labels of other groups with an identical schedule */
  sameAs: string[]
  fetchedAt: string
  source: 'live' | 'saved'
  savedAt: string | null
  error: string | null
}

export default function LiveView({ id, label, group, sameAs, fetchedAt, source, savedAt, error }: Props) {
  const { now, pending, refresh } = useLiveClock(fetchedAt)
  useEffect(() => pushRecent(id), [id])

  const days = group.days.filter((d) => d.date >= now.date) // after midnight, a cached "today" is yesterday
  const anyEmergency = days.some(isEmergency)

  return (
    <>
      <header className="top">
        <BackButton />
        <h1>Група {label}</h1>
        <RefreshButton pending={pending} onClick={refresh} />
      </header>

      {source === 'saved' && (
        <div className="notice warn">
          Не вдалося отримати свіжі дані ({error}). Показано збережений графік
          {savedAt ? ` станом на ${stamp(savedAt, now.date)}` : ''}, він міг змінитися.
        </div>
      )}

      <section className="schedule">
        <StatusCard days={group.days} now={now} />
        {days.map((d) => (
          <DayCard key={d.date} day={d} now={now} />
        ))}
      </section>

      <Legend emergency={anyEmergency} />

      <footer>
        {sameAs.length > 0 && (
          <p>
            Такий самий графік: {sameAs.length === 1 ? 'група' : 'групи'} {sameAs.join(', ')}
          </p>
        )}
        <p>
          Графік оновлено {group.updatedOn ? stamp(group.updatedOn, now.date) : '—'}
          {source === 'live' && <> · отримано о {clock(fetchedAt)}</>}
        </p>
      </footer>
    </>
  )
}

function StatusCard({ days, now }: { days: Day[]; now: KyivNow }) {
  const st = liveState(days, now)

  if (st.kind === 'unknown')
    return (
      <div className="status unknown">
        <div className="headline">Графіка немає</div>
        <div className="sub">{st.reason}</div>
      </div>
    )

  if (st.kind === 'emergency') {
    const p = st.planned
    return (
      <div className="status alert" role="alert">
        <div className="headline">
          <Alert />
          Екстрені відключення
        </div>
        <div className="sub">Плановий графік може не виконуватись</div>
        <div className="sub planned">
          {p ? plannedLabel(p) : 'Графіка на сьогодні не збережено'}
        </div>
      </div>
    )
  }

  const off = st.kind === 'off'
  let sub = nextLabel(st)
  if (off && st.openEnded) sub += ' · графік на завтра ще не опубліковано'
  else if (st.minutesLeft !== null) sub += ` · через ${durationLabel(st.minutesLeft)}`

  return (
    <div className={`status ${off ? 'off' : 'on'}`}>
      <div className="headline">
        {off ? <BoltOff /> : <Bolt />}
        {off ? 'Світла немає' : 'Світло є'}
      </div>
      <div className="sub">{sub}</div>
    </div>
  )
}

function DayCard({ day, now }: { day: Day; now: KyivNow }) {
  const isToday = day.date === now.date
  const published = day.status === APPLIES
  const emergency = isEmergency(day)
  const eff = effective(day)
  const total = totalOutage(eff.outages)
  const showGrid = published || (eff.from !== null && (emergency || eff.outages.length > 0))
  const nowHour = isToday ? Math.floor(now.minute / 60) : -1

  let meta: string
  if (published) meta = `без світла ${durationLabel(total)}`
  else if (emergency) meta = eff.from ? `екстрені відключення · за графіком без світла ${durationLabel(total)}` : 'екстрені відключення'
  else meta = statusLabel(day.status)

  return (
    <div className={`day${emergency ? ' emergency' : ''}`}>
      <div className="day-head">
        <h2>
          {isToday ? 'Сьогодні' : 'Завтра'} <span className="date">{dateLabel(day.date)}</span>
        </h2>
        <span className="day-meta">{meta}</span>
      </div>

      {emergency && (
        <div className="day-alert">
          <Alert />
          <span>
            {eff.from === 'saved' && day.saved ? (
              <>
                Діють екстрені відключення, графік може не виконуватись. Нижче останній
                опублікований графік (оновлено{' '}
                {stamp(day.saved.updatedOn ?? day.saved.savedAt, now.date)}).
              </>
            ) : eff.from === 'live' ? (
              'Діють екстрені відключення, графік може не виконуватись.'
            ) : (
              'Діють екстрені відключення. Збереженого графіка на цей день немає.'
            )}
          </span>
        </div>
      )}

      {showGrid ? (
        <>
          <div className="grid">
            {hourSegments(eff).map((segs, h) => (
              <HourTile key={h} hour={h} segs={segs} isNow={h === nowHour} />
            ))}
          </div>
          <p className="summary">
            {eff.outages.length === 0 ? (
              'Відключень не заплановано'
            ) : (
              <>
                Відключення: <Ranges ws={eff.outages} />
              </>
            )}
          </p>
          {eff.possible.length > 0 && (
            <p className="summary">
              Можливі: <Ranges ws={eff.possible} />
            </p>
          )}
        </>
      ) : (
        !emergency && <p className="summary">Графік на наступний день зазвичай публікують увечері.</p>
      )}
    </div>
  )
}

function Ranges({ ws }: { ws: Window[] }) {
  return (
    <>
      {ws.map(([a, b], i) => (
        <span key={a} className="range">
          {hhmm(a)}–{hhmm(b)}
          {i < ws.length - 1 ? ', ' : ''}
        </span>
      ))}
    </>
  )
}

/**
 * One hour. Fully on/off tiles show an icon; a partly-off tile (e.g. outage
 * from :30) is split: the off part is a dark copy of the tile clipped to that
 * part, so the label changes colour where the fill starts.
 */
function HourTile({ hour, segs, isNow }: { hour: number; segs: HourSegment[]; isNow: boolean }) {
  const label = `${String(hour).padStart(2, '0')}:00`
  const full =
    segs.find((s) => s.from === 0 && s.to === 1 && s.kind === 'off') ??
    segs.find((s) => s.from === 0 && s.to === 1)
  const cls = `tile${isNow ? ' now' : ''}`

  if (segs.length === 0)
    return (
      <div className={`${cls} on`} aria-label={`${label}, світло є`}>
        <Bolt />
        <span>{label}</span>
      </div>
    )
  if (full)
    return (
      <div
        className={`${cls} ${full.kind}`}
        aria-label={`${label}, ${full.kind === 'off' ? 'відключення' : 'можливе відключення'}`}
      >
        <BoltOff />
        <span>{label}</span>
      </div>
    )

  const ranges = segs
    .map((s) => `${hhmm(hour * 60 + Math.round(s.from * 60))}–${hhmm(hour * 60 + Math.round(s.to * 60))}`)
    .join(', ')
  return (
    <div className={`${cls} on split`} aria-label={`${label}, відключення ${ranges}`}>
      <span>{label}</span>
      {segs.map((s, i) => (
        <div
          key={i}
          className={`overlay ${s.kind}`}
          style={{ clipPath: `inset(0 ${(1 - s.to) * 100}% 0 ${s.from * 100}%)` }}
        >
          <span>{label}</span>
        </div>
      ))}
    </div>
  )
}
