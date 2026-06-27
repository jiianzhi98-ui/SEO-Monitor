export type KwStatus = 'normal' | 'warning' | 'danger' | 'high'

interface KwStatRow {
  stat_date: string | null
  app_count: number
  game_count: number
}

function isWeekend(dateStr: string): boolean {
  const dow = new Date(dateStr).getDay()
  return dow === 0 || dow === 6
}

/**
 * 按工作日/周末分组计算基准均值。
 * 昨天是工作日 → 只跟30天内的工作日均值比；周末 → 只跟周末均值比。
 * 消除星期效应，避免周末低量被误判为异常。
 * 竞品日收与首页快报共用此逻辑，只改这里两边同步生效。
 * 调用方需拉取30天数据。
 */
function getBaseline(siteStats: KwStatRow[], yesterday: string): number {
  const yIsWeekend = isWeekend(yesterday)
  const vals: number[] = []
  for (const s of siteStats) {
    const d = (s.stat_date ?? '').slice(0, 10)
    if (!d || d === yesterday) continue
    if (isWeekend(d) === yIsWeekend) {
      vals.push((s.app_count ?? 0) + (s.game_count ?? 0))
    }
  }
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

export function computeKwBaseline(siteStats: KwStatRow[], yesterday: string): number {
  return Math.round(getBaseline(siteStats, yesterday))
}

export function computeKwStatus(siteStats: KwStatRow[], yesterday: string): KwStatus {
  const ytStat = siteStats.find(s => (s.stat_date ?? '').slice(0, 10) === yesterday)
  const yesterdayVal = (ytStat?.app_count ?? 0) + (ytStat?.game_count ?? 0)
  const baseline = getBaseline(siteStats, yesterday)
  if (baseline > 0) {
    const ratio = yesterdayVal / baseline
    if (ratio < 0.3) return 'danger'
    if (ratio < 0.6) return 'warning'
    if (ratio > 1.5) return 'high'
  }
  return 'normal'
}
