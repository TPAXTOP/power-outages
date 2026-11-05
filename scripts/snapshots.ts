/**
 * Show what the emergency fallback has saved in Redis.
 *
 *   bun run snapshots          # saved days: group count, save time, expiry
 *   bun run snapshots 12       # same, plus the saved outages of group 12
 *
 * Reads KV_REST_API_URL / KV_REST_API_TOKEN from .env.production.local (gitignored);
 * copy them from Vercel → Storage → your database (they are "sensitive", so `vercel env pull` leaves them empty).
 */
import { Redis } from '@upstash/redis'

type Window = [number, number]
interface SavedGroup {
  o: Window[]
  p: Window[]
  u: string | null
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const kyiv = (iso: string) =>
  new Intl.DateTimeFormat('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )

async function main() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error('No Redis credentials. Put KV_REST_API_URL and KV_REST_API_TOKEN (Vercel → Storage → your database → .env.local tab → Show secret) into .env.production.local')
    process.exit(1)
  }
  const arg = process.argv[2]
  const group = arg ? (arg.includes('.') ? arg : `${arg}.1`) : null

  const redis = new Redis({ url, token })
  const keys = (await redis.keys('outages:day:*')).sort()
  console.log(`Redis: ${new URL(url).host}`)
  if (keys.length === 0) {
    console.log('No snapshots saved yet. They appear after the deployed app is opened or the daily cron runs.')
    return
  }
  for (const key of keys) {
    const [all, ttl] = await Promise.all([redis.hgetall<Record<string, unknown>>(key), redis.ttl(key)])
    if (!all) continue
    const { _savedAt, ...groups } = all
    const g = group ? (groups[group] as SavedGroup | undefined) : undefined
    console.log(
      `\n${key.replace('outages:day:', '')}: ${Object.keys(groups).length} groups, saved ${
        _savedAt ? kyiv(String(_savedAt)) : '?'
      }, expires in ${Math.round(ttl / 3600)} h`,
    )
    if (!group) continue
    if (!g) console.log(`  ${group}: not saved`)
    else
      console.log(
        `  ${group}: outages ${g.o.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(', ') || 'none'}` +
          (g.u ? ` (updated ${kyiv(g.u)})` : ''),
      )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
