import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

function calcScore(rankPos: number | null, isIndexed: boolean, rankChange: number | null): number {
  let rankScore = 0
  if (rankPos != null) {
    if (rankPos <= 3) rankScore = 60
    else if (rankPos <= 10) rankScore = 50
    else if (rankPos <= 20) rankScore = 40
    else if (rankPos <= 30) rankScore = 30
    else rankScore = 20
  }
  const indexScore = isIndexed ? 20 : 0
  let changeScore = 0
  if (rankChange != null && rankChange > 0) {
    if (rankChange > 20) changeScore = 20
    else if (rankChange >= 10) changeScore = 15
    else changeScore = 10
  }
  return rankScore + indexScore + changeScore
}

export async function GET() {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: claims, error: claimErr } = await service
    .from('member_claimed_keywords')
    .select('id, source')
    .eq('status', 'submitted')
    .limit(10000)

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })

  const allClaims = (claims ?? []) as { id: string; source: string }[]
  if (allClaims.length === 0) return NextResponse.json({ stats: [] })

  const since90 = new Date(Date.now() + 8 * 3600000 - 90 * 86400000).toISOString().slice(0, 10)
  const claimIds = allClaims.map(c => c.id)
  const claimSource = new Map<string, string>(allClaims.map(c => [c.id, c.source]))

  const BATCH = 200
  const trackRows: {
    claim_id: string
    rank_position: number | null
    prev_rank_position: number | null
    is_indexed: boolean
    effectiveness: string | null
    record_date: string
  }[] = []

  const [, { data: envDays }] = await Promise.all([
    (async () => {
      for (let i = 0; i < claimIds.length; i += BATCH) {
        const { data } = await service
          .from('site_tracking_records')
          .select('claim_id, rank_position, prev_rank_position, is_indexed, effectiveness, record_date')
          .in('claim_id', claimIds.slice(i, i + BATCH))
          .order('record_date', { ascending: false })
          .limit(2000)
        if (data) trackRows.push(...data)
      }
    })(),
    service
      .from('environment_daily')
      .select('date, crawl_anomaly, avg_index_change_pct')
      .gte('date', since90),
  ])

  trackRows.sort((a, b) => b.record_date.localeCompare(a.record_date))

  const badDates = new Set<string>()
  for (const e of (envDays ?? []) as { date: string; crawl_anomaly: boolean; avg_index_change_pct: number | null }[]) {
    if (e.crawl_anomaly || (e.avg_index_change_pct !== null && e.avg_index_change_pct < -5)) {
      badDates.add(e.date)
    }
  }

  interface SourceStat {
    total: number
    ranked: number
    effective: number
    scoreTotal: number
    scoredCount: number
  }
  const statsMap = new Map<string, SourceStat>()
  const seenClaims = new Set<string>()

  // tally totals from allClaims first
  for (const c of allClaims) {
    const s = statsMap.get(c.source) ?? { total: 0, ranked: 0, effective: 0, scoreTotal: 0, scoredCount: 0 }
    s.total++
    statsMap.set(c.source, s)
  }

  // then enrich from tracking records
  for (const t of trackRows) {
    if (seenClaims.has(t.claim_id)) continue
    const source = claimSource.get(t.claim_id)
    if (!source) continue
    const s = statsMap.get(source)
    if (!s) continue

    if (t.rank_position != null) s.ranked++
    if (t.effectiveness === '获取排名' || t.effectiveness === '获取收录') s.effective++

    if (!badDates.has(t.record_date)) {
      const rankChange = (t.rank_position != null && t.prev_rank_position != null)
        ? t.prev_rank_position - t.rank_position : null
      s.scoreTotal += calcScore(t.rank_position, t.is_indexed, rankChange)
      s.scoredCount++
    }

    seenClaims.add(t.claim_id)
  }

  const SOURCE_ORDER = ['竞品涨排名', '共新增词', '交叉词', '连续上涨词', '更新词库', '搜索量查询']

  const stats = Array.from(statsMap.entries())
    .sort((a, b) => {
      const ai = SOURCE_ORDER.indexOf(a[0])
      const bi = SOURCE_ORDER.indexOf(b[0])
      if (ai >= 0 && bi >= 0) return ai - bi
      if (ai >= 0) return -1
      if (bi >= 0) return 1
      return b[1].total - a[1].total
    })
    .map(([source, s]) => ({
      source,
      total: s.total,
      ranked: s.ranked,
      effective: s.effective,
      avg_score: s.scoredCount > 0 ? Math.round(s.scoreTotal / s.scoredCount * 10) / 10 : null,
      scored_count: s.scoredCount,
    }))

  return NextResponse.json({ stats })
}
