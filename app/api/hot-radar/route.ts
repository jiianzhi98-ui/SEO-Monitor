import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const maxDuration = 30

function getMY(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

interface SiteRow { id: string; domain: string }
interface RawKwRow { keyword: string; site_id: string }
interface RankRow { keyword: string; site_id: string; volume: number }

export async function GET() {
  const supabase = createServiceClient()
  const since = getMY(-30)

  const { data: sitesRaw } = await supabase.from('sites').select('id, domain')
  const siteMap = new Map(((sitesRaw || []) as SiteRow[]).map((s) => [s.id, s.domain]))

  // 共新增词
  const { data: rawKws } = await supabase
    .from('raw_keywords')
    .select('keyword, site_id')
    .gte('discovered_at', since)

  const newAgg = new Map<string, { siteIds: Set<string>; count: number }>()
  for (const row of (rawKws || []) as RawKwRow[]) {
    if (!newAgg.has(row.keyword)) newAgg.set(row.keyword, { siteIds: new Set(), count: 0 })
    const e = newAgg.get(row.keyword)!
    e.siteIds.add(row.site_id)
    e.count++
  }
  const newWords = Array.from(newAgg.entries())
    .filter(([, v]) => v.siteIds.size >= 2)
    .map(([keyword, v]) => ({
      keyword,
      count: v.count,
      siteCount: v.siteIds.size,
      sites: Array.from(v.siteIds).map((id) => siteMap.get(id) ?? id),
    }))
    .sort((a, b) => b.siteCount - a.siteCount || b.count - a.count)

  // 竞品涨排名
  const { data: rankRows } = await supabase
    .from('rank_changes')
    .select('keyword, site_id, volume')
    .eq('type', 'rankup')
    .gte('stat_date', since)

  const rankAgg = new Map<string, { siteIds: Set<string>; maxVolume: number }>()
  for (const row of (rankRows || []) as RankRow[]) {
    if (!rankAgg.has(row.keyword)) rankAgg.set(row.keyword, { siteIds: new Set(), maxVolume: 0 })
    const e = rankAgg.get(row.keyword)!
    e.siteIds.add(row.site_id)
    e.maxVolume = Math.max(e.maxVolume, row.volume ?? 0)
  }
  const rankWords = Array.from(rankAgg.entries())
    .filter(([, v]) => v.siteIds.size >= 2)
    .map(([keyword, v]) => ({
      keyword,
      siteCount: v.siteIds.size,
      volume: v.maxVolume,
      sites: Array.from(v.siteIds).map((id) => siteMap.get(id) ?? id),
    }))
    .sort((a, b) => b.siteCount - a.siteCount || b.volume - a.volume)

  return NextResponse.json({ newWords, rankWords })
}
