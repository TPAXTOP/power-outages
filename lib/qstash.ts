import 'server-only'
import { createHash } from 'node:crypto'
import { Client } from '@upstash/qstash'
import { getMeta, setMeta } from './snapshots'

/**
 * Upstash QStash calls /api/snapshot on these schedules (Kyiv time), about
 * 120 messages/day; the free plan allows 1,000/day and retries count too.
 */
export const SCHEDULES = [
  { id: 'outages-day', cron: 'CRON_TZ=Europe/Kyiv */10 6-23 * * *' },
  { id: 'outages-night', cron: 'CRON_TZ=Europe/Kyiv */30 0-5 * * *' },
]

/**
 * The app manages its own QStash schedules: no manual setup beyond adding
 * QStash to the Vercel project (Marketplace → Upstash QStash), which sets
 * QSTASH_TOKEN (and QSTASH_URL). Runs on every /api/snapshot call; the
 * configuration hash in Redis makes it a single read when nothing changed,
 * and the schedules are re-checked daily (hash TTL), so a deleted schedule or
 * a new CRON_SECRET / domain is picked up automatically.
 */
export async function ensureSchedules(secret: string): Promise<string> {
  const token = process.env.QSTASH_TOKEN
  if (!token) return 'not connected (no QSTASH_TOKEN)'
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (!host) return 'skipped (not a Vercel deployment)'

  const destination = `https://${host}/api/snapshot`
  const config = createHash('sha1')
    .update(JSON.stringify({ destination, secret, SCHEDULES }))
    .digest('hex')
  if ((await getMeta('qstash')) === config) return 'ok'

  const client = new Client({ token, baseUrl: process.env.QSTASH_URL || undefined })
  for (const s of SCHEDULES) {
    await client.schedules.create({
      scheduleId: s.id, // same id → update in place
      destination,
      cron: s.cron,
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      redact: { header: ['Authorization'] }, // keep the secret out of QStash logs
      retries: 1,
      timeout: 30,
      label: 'outages',
    })
  }
  // Remove schedules that call this app but are no longer in SCHEDULES (renamed ids).
  const wanted = new Set(SCHEDULES.map((s) => s.id))
  const stale = (await client.schedules.list()).filter(
    (s) => s.destination === destination && !wanted.has(s.scheduleId),
  )
  for (const s of stale) await client.schedules.delete(s.scheduleId)

  await setMeta('qstash', config)
  console.log(
    `[qstash] schedules set: ${[...wanted].join(', ')} → ${destination}` +
      (stale.length ? `; removed ${stale.map((s) => s.scheduleId).join(', ')}` : ''),
  )
  return 'schedules created'
}
