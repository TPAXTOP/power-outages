import { pollSchedule } from '@/lib/poll'
import { ensureSchedules } from '@/lib/qstash'

export const dynamic = 'force-dynamic'

/**
 * Background refresh of the saved schedules (see lib/poll.ts). Called by:
 * - Upstash QStash every 10 min (06-24 Kyiv) / 30 min (night); the schedules
 *   are created by this route itself (lib/qstash.ts);
 * - the daily Vercel cron in vercel.json (backup, and the first trigger that
 *   creates the QStash schedules; can be run by hand in Vercel → Settings → Cron Jobs).
 * Both send `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`)
    return new Response('Unauthorized', { status: 401 })

  let qstash: string
  try {
    qstash = await ensureSchedules(secret)
  } catch (e) {
    qstash = `error: ${e instanceof Error ? e.message : String(e)}`
    console.error('[qstash]', qstash)
  }

  try {
    return Response.json({ ok: true, ...(await pollSchedule()), qstash })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[poll] failed:', error)
    return Response.json({ ok: false, error, qstash }, { status: 502 })
  }
}

export const GET = handle
export const POST = handle
