export type KwStatus = 'normal' | 'warning' | 'danger' | 'high'

interface KwStatRow {
  stat_date: string | null
  app_count: number
  game_count: number
}

/**
 * 以昨日新增量对比7天均值计算新增异常状态。
 * 竞品日收与首页快报共用同一逻辑，只改这里两边同步生效。
 */
export function computeKwStatus(
  siteStats: KwStatRow[],
  yesterday: string
): KwStatus {
  const ytStat = siteStats.find(s => (s.stat_date ?? '').slice(0, 10) === yesterday)
  const yesterdayVal = (ytStat?.app_count ?? 0) + (ytStat?.game_count ?? 0)

  const dayMap = new Map<string, number>()
  for (const s of siteStats) {
    const d = (s.stat_date ?? '').slice(0, 10)
    if (d) dayMap.set(d, (s.app_count ?? 0) + (s.game_count ?? 0))
  }

  const vals = Array.from(dayMap.values())
  const avg7d = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0

  if (avg7d > 0) {
    const ratio = yesterdayVal / avg7d
    if (ratio < 0.3) return 'danger'
    if (ratio < 0.6) return 'warning'
    if (ratio > 1.5) return 'high'
  }
  return 'normal'
}
