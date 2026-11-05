import 'server-only'
import { createHash } from 'node:crypto'
import { revalidateTag } from 'next/cache'
import { getMeta, saveSnapshots, setMeta } from './snapshots'
import { DATA_TAG, fetchRaw, parseAll } from './source'

export type PollResult =
  | { changed: false }
  | { changed: true; saved: boolean; days: string[] }

/**
 * Background check, called by QStash every 10-30 min and by the daily Vercel
 * cron (`/api/snapshot`). Reloads the schedule data bypassing the cache and
 * compares its fingerprint with the last one processed:
 * - unchanged → done (one Redis read);
 * - changed → save the published days and drop the cached data, so
 *   pages show the new schedule right away instead of after REVALIDATE_S.
 * Overlapping runs are harmless: they write identical data.
 */
export async function pollSchedule(): Promise<PollResult> {
  const raw = await fetchRaw({ fresh: true })
  const fp = `sha1:${createHash('sha1').update(JSON.stringify(raw)).digest('hex')}`
  if ((await getMeta('fingerprint')) === fp) return { changed: false }

  const groups = parseAll(raw)
  const saved = await saveSnapshots(groups)
  if (saved) await setMeta('fingerprint', fp) // otherwise retry the save on the next poll
  revalidateTag(DATA_TAG)

  const days = [
    ...new Set(Object.values(groups).flatMap((g) => g.days.map((d) => `${d.date} ${d.status}`))),
  ].sort()
  console.log(`[poll] schedule changed; saved=${saved}; ${days.join(', ')}`)
  return { changed: true, saved, days }
}
