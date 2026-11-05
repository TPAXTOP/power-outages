import 'server-only'
import { cache } from 'react'
import { Redis } from '@upstash/redis'
import { SNAPSHOT_TTL_S } from './config'
import { APPLIES, type GroupData, type Window } from './schedule'

/**
 * The last published schedule of every group, per date. During emergency
 * outages the published schedule is often withdrawn, so this is what the app
 * falls back to.
 *
 * Stored in Upstash Redis (Vercel Marketplace) as one hash per date:
 *   outages:day:2026-11-05 → { "1.1": {o, p, u}, ..., _savedAt: ISO }
 * Only published days are written, so an emergency never overwrites them.
 * Without Redis env vars, an in-process Map is used (dev, or degraded prod).
 */

export interface SavedGroup {
  /** outages */
  o: Window[]
  /** possible */
  p: Window[]
  /** when the schedule was last updated */
  u: string | null
}

export interface Snapshot {
  savedAt: string
  groups: Record<string, SavedGroup>
}

interface Store {
  name: string
  save(date: string, savedAt: string, groups: Record<string, SavedGroup>): Promise<void>
  load(date: string): Promise<Snapshot | null>
  getMeta(name: string): Promise<string | null>
  setMeta(name: string, value: string, ttlS: number): Promise<void>
}

const key = (date: string) => `outages:day:${date}`
const SAVED_AT = '_savedAt'

function redisStore(url: string, token: string): Store {
  const redis = new Redis({ url, token })
  return {
    name: 'redis',
    async save(date, savedAt, groups) {
      await redis
        .pipeline()
        .hset(key(date), { ...groups, [SAVED_AT]: savedAt })
        .expire(key(date), SNAPSHOT_TTL_S)
        .exec()
    },
    async load(date) {
      const all = await redis.hgetall<Record<string, unknown>>(key(date))
      if (!all) return null
      const { [SAVED_AT]: savedAt, ...groups } = all
      return { savedAt: String(savedAt ?? ''), groups: groups as Record<string, SavedGroup> }
    },
    async getMeta(name) {
      const v = await redis.get(`outages:${name}`)
      return v == null ? null : String(v)
    },
    async setMeta(name, value, ttlS) {
      await redis.set(`outages:${name}`, value, { ex: ttlS })
    },
  }
}

function memoryStore(): Store {
  // On globalThis so it survives dev hot reloads.
  const g = globalThis as {
    __outageSnapshots?: Map<string, Snapshot & { expires: number }>
    __outageMeta?: Map<string, { value: string; expires: number }>
  }
  const map = (g.__outageSnapshots ??= new Map())
  const meta = (g.__outageMeta ??= new Map())
  return {
    name: 'memory',
    async save(date, savedAt, groups) {
      const prev = map.get(date)
      map.set(date, {
        savedAt,
        groups: { ...prev?.groups, ...groups },
        expires: Date.now() + SNAPSHOT_TTL_S * 1000,
      })
    },
    async load(date) {
      const s = map.get(date)
      if (!s || s.expires < Date.now()) return null
      return { savedAt: s.savedAt, groups: s.groups }
    },
    async getMeta(name) {
      const m = meta.get(name)
      return m && m.expires > Date.now() ? m.value : null
    },
    async setMeta(name, value, ttlS) {
      meta.set(name, { value, expires: Date.now() + ttlS * 1000 })
    },
  }
}

let store: Store | null = null
function getStore(): Store {
  if (store) return store
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  store = url && token ? redisStore(url, token) : memoryStore()
  console.log(`[snapshots] using ${store.name} store`)
  return store
}

/** Last written content per date in this instance, to skip identical writes. */
const written = new Map<string, string>()

/** Save every published day of every group. Never throws; false if a write failed. */
export async function saveSnapshots(groups: Record<string, GroupData>): Promise<boolean> {
  const byDate = new Map<string, Record<string, SavedGroup>>()
  for (const [id, g] of Object.entries(groups)) {
    for (const d of g.days) {
      if (d.status !== APPLIES) continue
      let m = byDate.get(d.date)
      if (!m) byDate.set(d.date, (m = {}))
      m[id] = { o: d.outages, p: d.possible, u: g.updatedOn }
    }
  }
  const savedAt = new Date().toISOString()
  let ok = true
  for (const [date, payload] of byDate) {
    const content = JSON.stringify(payload)
    if (written.get(date) === content) continue
    try {
      await getStore().save(date, savedAt, payload)
      written.set(date, content)
    } catch (e) {
      console.error(`[snapshots] save ${date} failed:`, e)
      ok = false
    }
  }
  return ok
}

/** Small bookkeeping values (outages:<name>) in the same store. Never throw. */
export async function getMeta(name: string): Promise<string | null> {
  try {
    return await getStore().getMeta(name)
  } catch (e) {
    console.error(`[snapshots] read ${name} failed:`, e)
    return null
  }
}

export async function setMeta(name: string, value: string, ttlS = 86400): Promise<void> {
  try {
    await getStore().setMeta(name, value, ttlS)
  } catch (e) {
    console.error(`[snapshots] write ${name} failed:`, e)
  }
}

/** Saved schedule of a date, or null. Deduplicated per request; never throws. */
export const loadSnapshot = cache(async (date: string): Promise<Snapshot | null> => {
  try {
    return await getStore().load(date)
  } catch (e) {
    console.error(`[snapshots] load ${date} failed:`, e)
    return null
  }
})
