import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getMY(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

interface NewWordRow { keyword: string; site_count: number; total_count: number; sites: string[] }
interface RankWordRow { keyword: string; site_count: number; max_volume: number; sites: string[] }
interface RankChangeRow { keyword: string; site_id: string; stat_date: string; volume: number }

export async function GET() {
  const supabase = createServiceClient()
  const since = getMY(-30)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const [{ data: newWordsRaw }, { data: rankWordsRaw }, { data: siteRows }, { data: rankChangesRaw }] = await Promise.all([
    db.rpc('get_hot_new_words', { p_since: since }),
    db.rpc('get_hot_rank_words', { p_since: since }),
    supabase.from('sites').select('id, domain'),
    supabase.from('rank_changes')
      .select('keyword, site_id, stat_date, volume')
      .eq('type', 'rankup')
      .gte('stat_date', since)
      .order('stat_date')
      .limit(200000),
  ])

  const newWords = ((newWordsRaw || []) as NewWordRow[]).map((r) => ({
    keyword: r.keyword,
    count: Number(r.total_count),
    siteCount: Number(r.site_count),
    sites: r.sites || [],
  }))

  const rankWords = ((rankWordsRaw || []) as RankWordRow[]).map((r) => ({
    keyword: r.keyword,
    siteCount: Number(r.site_count),
    volume: Number(r.max_volume),
    sites: r.sites || [],
  }))

  // ── Streak computation ────────────────────────────────────────────────────
  const idToDomain = new Map(
    ((siteRows || []) as { id: string; domain: string }[]).map(s => [s.id, s.domain])
  )

  // Group by (site_id|keyword) → unique dates + max volume
  const grouped = new Map<string, { dates: Set<string>; volume: number; domain: string }>()
  for (const r of (rankChangesRaw || []) as RankChangeRow[]) {
    const domain = idToDomain.get(r.site_id)
    if (!domain) continue
    const key = `${r.site_id}|${r.keyword}`
    if (!grouped.has(key)) grouped.set(key, { dates: new Set(), volume: 0, domain })
    const entry = grouped.get(key)!
    entry.dates.add((r.stat_date ?? '').slice(0, 10))
    if ((r.volume || 0) > entry.volume) entry.volume = r.volume || 0
  }

  // Count total days each (site, keyword) appeared in rankup within the window — gaps allowed
  const streakWords: { keyword: string; streak: number; domain: string; volume: number }[] = []
  const groupedEntries = Array.from(grouped.entries())
  for (const [key, { dates, volume, domain }] of groupedEntries) {
    const pipeIdx = key.indexOf('|')
    const keyword = key.slice(pipeIdx + 1)
    const streak = dates.size  // total unique appearance days, not consecutive
    if (streak < 2) continue
    streakWords.push({ keyword, streak, domain, volume })
  }
  streakWords.sort((a, b) => b.streak - a.streak || b.volume - a.volume)

  return NextResponse.json({ newWords, rankWords, streakWords })
}
