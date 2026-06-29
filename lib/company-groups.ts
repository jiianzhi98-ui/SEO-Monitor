const GROUP_COLORS = [
  'border-l-blue-400',
  'border-l-orange-400',
  'border-l-purple-400',
  'border-l-emerald-400',
  'border-l-pink-400',
  'border-l-indigo-400',
  'border-l-teal-400',
  'border-l-amber-500',
  'border-l-rose-400',
  'border-l-cyan-500',
]

export function buildGroupMaps(
  sites: { domain: string; friend_links?: string[] | null }[]
): { idMap: Map<string, number>; colorMap: Map<string, string> } {
  const sorted = [...sites].sort((a, b) => a.domain.localeCompare(b.domain))
  const domainSet = new Set(sorted.map((s) => s.domain))
  const idMap = new Map<string, number>()
  let nextId = 0

  for (const site of sorted) {
    const links = (site.friend_links || []).filter((l) => domainSet.has(l))
    if (links.length === 0) continue
    const all = [site.domain, ...links]
    let gid: number | undefined
    for (const d of all) {
      if (idMap.has(d)) { gid = idMap.get(d)!; break }
    }
    if (gid === undefined) gid = nextId++
    for (const d of all) idMap.set(d, gid)
  }

  const colorMap = new Map<string, string>()
  for (const [domain, gid] of Array.from(idMap.entries())) {
    colorMap.set(domain, GROUP_COLORS[gid % GROUP_COLORS.length])
  }

  return { idMap, colorMap }
}

export function buildGroupColorMap(
  sites: { domain: string; friend_links?: string[] | null }[]
): Map<string, string> {
  return buildGroupMaps(sites).colorMap
}

function cmpArrays(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

/**
 * Re-orders rows so same-company sites appear adjacent.
 * The group's position is determined by the BEST (min) getGroupKey among all
 * members, so a group with one 重点 + one 侧重 site sits in the 重点 section.
 * Within the same group the pre-sort order is preserved.
 * getGroupKey should return e.g. [focus_level, category_order].
 */
export function groupSortedRows<T extends { domain: string }>(
  rows: T[],
  idMap: Map<string, number>,
  getGroupKey: (row: T) => number[]
): T[] {
  if (idMap.size === 0) return [...rows]

  const originalIndex = new Map<T, number>()
  rows.forEach((r, i) => originalIndex.set(r, i))

  // Best (min) key and first occurrence index for each group
  const groupBestKey = new Map<number, number[]>()
  const groupFirstIdx = new Map<number, number>()
  for (let i = 0; i < rows.length; i++) {
    const gid = idMap.get(rows[i].domain)
    if (gid === undefined) continue
    const key = getGroupKey(rows[i])
    const best = groupBestKey.get(gid)
    if (!best || cmpArrays(key, best) < 0) groupBestKey.set(gid, key)
    if (!groupFirstIdx.has(gid)) groupFirstIdx.set(gid, i)
  }

  return [...rows].sort((a, b) => {
    const oia = originalIndex.get(a) ?? 0
    const oib = originalIndex.get(b) ?? 0
    const gidA = idMap.get(a.domain)
    const gidB = idMap.get(b.domain)

    // Anchor key: best in group, or own key if ungrouped
    const anchorA = (gidA !== undefined ? groupBestKey.get(gidA) : undefined) ?? getGroupKey(a)
    const anchorB = (gidB !== undefined ? groupBestKey.get(gidB) : undefined) ?? getGroupKey(b)
    const keyCmp = cmpArrays(anchorA, anchorB)
    if (keyCmp !== 0) return keyCmp

    // Same anchor key → order groups by first occurrence in pre-sort
    const firstA = (gidA !== undefined ? groupFirstIdx.get(gidA) : undefined) ?? oia
    const firstB = (gidB !== undefined ? groupFirstIdx.get(gidB) : undefined) ?? oib
    if (firstA !== firstB) return firstA - firstB

    // Same group → preserve pre-sort order
    return oia - oib
  })
}
