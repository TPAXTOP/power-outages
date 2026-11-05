'use client'

import { useRouter } from 'next/navigation'
import { cameFromPicker } from './useLiveClock'

export function Bolt() {
  return (
    <svg className="icon bolt" viewBox="0 0 24 24" aria-hidden>
      <path d="M13.5 2 4.5 13.5h6L9.5 22l10-12.5h-6.5z" fill="currentColor" />
    </svg>
  )
}

export function BoltOff() {
  return (
    <svg className="icon bolt-off" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M13.5 2 4.5 13.5h6L9.5 22l10-12.5h-6.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M3.5 3.5l17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function Alert() {
  return (
    <svg className="icon alert-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3 2 20.5h20z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M12 10v4.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <circle cx="12" cy="17.4" r="1.25" fill="currentColor" />
    </svg>
  )
}

export function Legend({ emergency = false }: { emergency?: boolean }) {
  return (
    <div className="legend">
      <span>
        <span className="swatch on">
          <Bolt />
        </span>
        світло є
      </span>
      <span>
        <span className="swatch off">
          <BoltOff />
        </span>
        відключення
      </span>
      {emergency && (
        <span>
          <span className="swatch alert">
            <Alert />
          </span>
          екстрені
        </span>
      )}
    </div>
  )
}

export function RefreshButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button className="round-btn" onClick={onClick} disabled={pending} aria-label="Оновити">
      <span className={pending ? 'spin' : undefined} aria-hidden>
        ↻
      </span>
    </button>
  )
}

/** Back to the picker: real history back when we came from it (keeps its scroll). */
export function BackButton() {
  const router = useRouter()
  return (
    <a
      className="back"
      href="/"
      onClick={(e) => {
        e.preventDefault()
        if (cameFromPicker()) router.back()
        else router.push('/')
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        <path
          d="M15 5l-7 7 7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Групи
    </a>
  )
}

export function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

/** ISO → "19:15" in Kyiv. */
export function clock(iso: string): string {
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/** ISO → "19:15" today, or "4 лист., 19:15" on another day (Kyiv). */
export function stamp(iso: string, nowDate: string): string {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d)
  if (day === nowDate) return clock(iso)
  const date = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: 'numeric',
    month: 'short',
  }).format(d)
  return `${date}, ${clock(iso)}`
}
