import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { GROUP_PARAM, groupLabel, resolveGroup } from '@/lib/groups'
import { daysKey } from '@/lib/schedule'
import { fetchSchedule } from '@/lib/source'
import LiveView from '../LiveView'
import { BackButton } from '../ui'

export const dynamic = 'force-dynamic'

type Params = Promise<{ group: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { group } = await params
  if (!GROUP_PARAM.test(group)) return {}
  const data = await fetchSchedule()
  const r = resolveGroup(group, data.ids)
  const label = r.kind === 'ok' ? groupLabel(r.id, data.short) : group
  return { title: `Група ${label} · Світло`, appleWebApp: { title: `Група ${label}` } }
}

export default async function GroupPage({ params }: { params: Params }) {
  const { group } = await params
  if (!GROUP_PARAM.test(group)) notFound()

  const data = await fetchSchedule()
  if (data.ids.length === 0)
    return (
      <Shell title={`Група ${group}`}>
        <div className="notice error">Не вдалося завантажити графік: {data.error}</div>
      </Shell>
    )

  const r = resolveGroup(group, data.ids)

  if (r.kind === 'missing')
    return (
      <Shell title={`Група ${group}`}>
        <div className="notice error">
          Групи {group} у графіку немає. Можливо, групи перенумерували (зараз груп:{' '}
          {data.ids.length}).
        </div>
        <Link className="button" href="/">
          Обрати групу
        </Link>
      </Shell>
    )

  if (r.kind === 'ambiguous')
    return (
      <Shell title={`Група ${group}`}>
        <p className="lead">Черга {group} має кілька підгруп. Оберіть свою:</p>
        <div className="pick-grid">
          {r.ids.map((id) => (
            <Link key={id} href={`/${id}`} className="tile pick on">
              <span className="pick-num">{id}</span>
            </Link>
          ))}
        </div>
      </Shell>
    )

  const label = groupLabel(r.id, data.short)
  if (label !== group) redirect(`/${label}`)

  const g = data.groups[r.id]
  const key = daysKey(g.days)
  const sameAs = data.ids
    .filter((id) => id !== r.id && daysKey(data.groups[id].days) === key)
    .map((id) => groupLabel(id, data.short))

  return (
    <main>
      <LiveView
        id={r.id}
        label={label}
        group={g}
        sameAs={sameAs}
        fetchedAt={data.fetchedAt}
        source={data.source}
        savedAt={data.savedAt}
        error={data.error}
      />
    </main>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main>
      <header className="top">
        <BackButton />
        <h1>{title}</h1>
        <span className="round-btn placeholder" aria-hidden />
      </header>
      {children}
    </main>
  )
}
