const GROUP_COLORS = [
  'border-blue-400',
  'border-orange-400',
  'border-purple-400',
  'border-emerald-400',
  'border-pink-400',
  'border-indigo-400',
  'border-teal-400',
  'border-amber-500',
  'border-rose-400',
  'border-cyan-500',
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

/**
 * Re-orders an already-sorted array so same-company sites appear adjacent,
 * anchored at the position of the first group member encountered.
 */
export function groupSortedRows<T extends { domain: string }>(
  rows: T[],
  idMap: Map<string, number>
): T[] {
  const originalIndex = new Map<T, number>()
  rows.forEach((r, i) => originalIndex.set(r, i))

  // First occurrence index of each group in the current order
  const groupFirstIndex = new Map<number, number>()
  for (let i = 0; i < rows.length; i++) {
    const gid = idMap.get(rows[i].domain)
    if (gid !== undefined && !groupFirstIndex.has(gid)) {
      groupFirstIndex.set(gid, i)
    }
  }

  return [...rows].sort((a, b) => {
    const gidA = idMap.get(a.domain)
    const gidB = idMap.get(b.domain)
    const anchorA = gidA !== undefined ? groupFirstIndex.get(gidA)! : originalIndex.get(a)!
    const anchorB = gidB !== undefined ? groupFirstIndex.get(gidB)! : originalIndex.get(b)!
    if (anchorA !== anchorB) return anchorA - anchorB
    return originalIndex.get(a)! - originalIndex.get(b)!
  })
}
