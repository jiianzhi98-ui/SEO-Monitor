export type IndexStatus = 'normal' | 'warning' | 'danger' | 'rising'

/**
 * 近期水位判断：取最近14个历史快照，用两个最高值与两个最低值确认有效区间。
 * 两个高/低值在 ±20% 内才算同一水位；否则最极端那个视为孤立异常，取次值。
 * 今天在区间内 → 正常；超出区间才触发告警。
 */
export function computeIndexStatus(
  siteSnaps: { index_count: number }[]
): IndexStatus {
  if (siteSnaps.length < 6) return 'normal'
  const recent = siteSnaps.slice(-15)
  const latest = recent[recent.length - 1].index_count
  const h = recent.slice(0, -1).map(r => r.index_count).sort((a, b) => a - b)
  if (h.length < 4 || h[0] === 0) return 'normal'
  const top1 = h[h.length - 1], top2 = h[h.length - 2]
  const cHigh = top2 >= top1 * 0.8 ? top1 : top2
  const bot1 = h[0], bot2 = h[1]
  const cLow = bot2 <= bot1 * 1.2 ? bot1 : bot2
  if (latest < cLow * 0.8) return 'danger'
  if (latest < cLow) return 'warning'
  if (latest > cHigh) return 'rising'
  return 'normal'
}
