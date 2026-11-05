'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CLIENT_REFRESH_MS } from '@/lib/config'
import { kyivNow, type KyivNow } from '@/lib/schedule'

/**
 * Kyiv "now" that ticks every 20 s, plus a server refresh every
 * CLIENT_REFRESH_MS and whenever the tab becomes visible again.
 * Starts from the server's fetch time so the first render matches SSR.
 */
export function useLiveClock(fetchedAt: string): { now: KyivNow; pending: boolean; refresh: () => void } {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [nowMs, setNowMs] = useState(() => Date.parse(fetchedAt))
  const refresh = useCallback(() => startTransition(() => router.refresh()), [router])

  useEffect(() => {
    setNowMs(Date.now())
    const tick = setInterval(() => setNowMs(Date.now()), 20_000)
    const poll = setInterval(refresh, CLIENT_REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNowMs(Date.now())
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(tick)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  return { now: kyivNow(new Date(nowMs)), pending, refresh }
}

// ------------------------------------------------------------ recent groups

const RECENT_KEY = 'recentGroups'
const RECENT_MAX = 4

export function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function pushRecent(id: string): void {
  try {
    const list = [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // storage unavailable (private mode etc.): recents are a convenience only
  }
}

// ------------------------------------------------------------ back navigation

const BACK_KEY = 'backTo'

/** Called by the picker before opening a group, so Back can return with history. */
export function markFromPicker(path: string): void {
  try {
    sessionStorage.setItem(BACK_KEY, path)
  } catch {}
}

/** True (once) when the current page was opened from the picker in this tab. */
export function cameFromPicker(): boolean {
  try {
    const ok = sessionStorage.getItem(BACK_KEY) === location.pathname && history.length > 1
    sessionStorage.removeItem(BACK_KEY)
    return ok
  } catch {
    return false
  }
}
