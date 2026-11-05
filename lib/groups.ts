/**
 * Group ids look like "12.1" (queue 12, subgroup 1). While every queue in the
 * data has a single subgroup, the subgroup number carries no information,
 * so labels and URLs use just "12".
 */

export const GROUP_PARAM = /^\d+(\.\d+)?$/

function parts(id: string): [number, number] {
  const [a, b] = id.split('.')
  return [Number(a), Number(b ?? 0)]
}

export function sortGroups(ids: string[]): string[] {
  return [...ids].sort((x, y) => {
    const [a1, b1] = parts(x)
    const [a2, b2] = parts(y)
    return a1 - a2 || b1 - b2
  })
}

const major = (id: string) => id.split('.')[0]

/** True when no queue has more than one subgroup. */
export function shortLabels(ids: string[]): boolean {
  const seen = new Set<string>()
  for (const id of ids) {
    const m = major(id)
    if (seen.has(m)) return false
    seen.add(m)
  }
  return true
}

/** "12.1" → "12" when labels are short. Also used as the URL slug. */
export function groupLabel(id: string, short: boolean): string {
  return short ? major(id) : id
}

export type Resolved =
  | { kind: 'ok'; id: string }
  | { kind: 'ambiguous'; ids: string[] }
  | { kind: 'missing' }

/** "12.1" → exact match; "12" → the only subgroup of queue 12, or a choice. */
export function resolveGroup(param: string, ids: string[]): Resolved {
  if (ids.includes(param)) return { kind: 'ok', id: param }
  if (param.includes('.')) return { kind: 'missing' }
  const matches = ids.filter((id) => major(id) === param)
  if (matches.length === 1) return { kind: 'ok', id: matches[0] }
  if (matches.length > 1) return { kind: 'ambiguous', ids: sortGroups(matches) }
  return { kind: 'missing' }
}
