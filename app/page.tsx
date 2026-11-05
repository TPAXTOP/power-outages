import { redirect } from 'next/navigation'
import { GROUP_PARAM, groupLabel } from '@/lib/groups'
import { fetchSchedule } from '@/lib/source'
import GroupPicker, { type PickerItem } from './GroupPicker'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ groups?: string | string[] }>

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  // Old links: /?groups=12.1 → /12.1 (which then redirects to its canonical form)
  const old = (await searchParams).groups
  const first = (Array.isArray(old) ? old.join(',') : old ?? '')
    .split(',')
    .map((g) => g.trim())
    .find((g) => GROUP_PARAM.test(g))
  if (first) redirect(`/${first}`)

  const data = await fetchSchedule()
  const items: PickerItem[] = data.ids.map((id) => ({
    id,
    label: groupLabel(id, data.short),
    days: data.groups[id].days,
    updatedOn: data.groups[id].updatedOn,
  }))

  return (
    <main>
      <GroupPicker
        items={items}
        fetchedAt={data.fetchedAt}
        source={data.source}
        savedAt={data.savedAt}
        error={data.error}
      />
    </main>
  )
}
