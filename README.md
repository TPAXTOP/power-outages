# Power outages (Kyiv)

A phone-friendly web app that shows the planned power-outage schedule for Kyiv, for any outage group. The interface is in Ukrainian.

> Unofficial project, not affiliated with any energy company. Always check official sources: during emergency outages the published schedule may not apply.

## Features

- **Group picker** (`/`): every group as a tile coloured by its current state (power on, outage, emergency), with how long that state lasts. Recently opened groups appear on top as live status cards.
- **Group page** (`/12`): current state with a countdown to the next change, hour-by-hour grids for today and tomorrow, and a list of groups with an identical schedule. Each group has its own URL, so it can be bookmarked or added to the home screen.
- **Short group numbers**: `12` instead of `12.1` while no group has more than one subgroup; full numbers come back automatically if subgroups appear. `/12.1` redirects to `/12`.
- **Live updates**: the clock ticks every 20 s, and data refreshes every 3 minutes and whenever the tab becomes visible again.
- **Emergency fallback**: during emergency outages the published schedule is often withdrawn entirely. The app keeps the last published schedule of every day and shows it, clearly marked as possibly not applying. If the schedule can't be loaded, the saved one is shown too.
- **Background refresh**: the schedule can change several times a day. A scheduler checks it every 10 minutes during the day (every 30 minutes at night) and saves new versions, so the fallback is never stale. A fingerprint check keeps unchanged runs down to a single Redis read.
- Light and dark mode, installable as a home-screen web app.

## Tech

- [Next.js 15](https://nextjs.org/) (App Router, React 19, TypeScript), [Bun](https://bun.sh/)
- [Vercel](https://vercel.com/) hosting, with a daily cron as a backup trigger
- [Upstash Redis](https://upstash.com/docs/redis) for saved schedules, [Upstash QStash](https://upstash.com/docs/qstash) for frequent scheduled refreshes (both have free tiers)

## Running locally

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # production build + type check
```

No configuration is needed locally: without Redis credentials, saved schedules are kept in memory.

## Deploying to Vercel

1. Import the repository in Vercel. The build settings come from `vercel.json`.
2. In the project's **Storage** tab, add **Upstash for Redis** and **Upstash QStash** from the Marketplace and connect both to the project. This sets `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `QSTASH_TOKEN` and `QSTASH_URL`.
3. Add an environment variable `CRON_SECRET` with any random string, then redeploy.
4. Go to **Settings → Cron Jobs** and click **Run** next to `/api/snapshot`. The app creates its own QStash schedules on that first call (otherwise this happens at the next daily cron run).

| Variable | Required | Purpose |
| --- | --- | --- |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | for the fallback | Upstash Redis (`UPSTASH_REDIS_REST_URL` / `_TOKEN` also accepted) |
| `QSTASH_TOKEN`, `QSTASH_URL` | for frequent refresh | Upstash QStash; without them only the daily cron runs |
| `CRON_SECRET` | yes | Protects `/api/snapshot`; sent by the Vercel cron and QStash as a Bearer token |

To inspect what has been saved, put the Redis credentials into `.env.production.local` (gitignored) and run `bun run snapshots`, or `bun run snapshots 12` for one group's outages.

## Project layout

```
app/
  page.tsx, GroupPicker.tsx     group picker (/)
  [group]/page.tsx, LiveView.tsx  group schedule (/12)
  api/snapshot/route.ts         background refresh endpoint
  useLiveClock.ts, ui.tsx       live clock, recent groups, shared UI
lib/
  schedule.ts   pure schedule logic: outage windows, live state, labels
  groups.ts     group sorting, short labels, URL resolution
  snapshots.ts  saved schedules (Redis, or memory without credentials)
  poll.ts       background refresh with change detection
  qstash.ts     self-managed QStash schedules
scripts/
  snapshots.ts  inspect saved schedules
```

## License

[MIT](LICENSE)
