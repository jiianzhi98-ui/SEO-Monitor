import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain')
  const tab = searchParams.get('tab') || 'keywords'
  const defaultDate = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10)
  const date = searchParams.get('date') || defaultDate
  const dateStart = searchParams.get('date_start') || date
  const dateEnd   = searchParams.get('date_end')   || date

  if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: site } = await service
    .from('sites')
    .select('id, domain, has_rank_title')
    .eq('domain', domain)
    .single()

  if (!site) {
    return NextResponse.json({ site: null, date, keywords: [], rankup: [], rankdown: [], outcomes: [], outcomeSummary: null })
  }

  // ── 提交记录 ──────────────────────────────────────────────────────────────────
  if (tab === 'keywords') {
    const { data: keywords } = await service
      .from('raw_keywords')
      .select('keyword, search_volume, source, content_type, content_date')
      .eq('site_id', site.id)
      .gte('content_date', dateStart)
      .lte('content_date', dateEnd)
      .not('keyword', 'like', '%电脑版%')
      .order('content_date', { ascending: false })
      .order('search_volume', { ascending: false })
      .limit(500)

    return NextResponse.json({ site, date: dateStart, keywords: keywords || [], rankup: [], rankdown: [], outcomes: [], outcomeSummary: null })
  }

  // ── 成效追踪 ──────────────────────────────────────────────────────────────────
  if (tab === 'outcomes') {
    // 1. Keywords published in date range
    const { data: kwRows } = await service
      .from('raw_keywords')
      .select('keyword, content_type, content_date, discovered_at, search_volume')
      .eq('site_id', site.id)
      .gte('content_date', dateStart)
      .lte('content_date', dateEnd)
      .not('keyword', 'like', '%电脑版%')
      .order('content_date', { ascending: false })
      .limit(1000)

    // 2. Rank data for a look-back window (7 days before dateEnd)
    const rankLookbackStart = new Date(new Date(dateEnd).getTime() - 7 * 86400000).toISOString().slice(0, 10)
    const { data: rankRows } = await service
      .from('site_keyword_ranks')
      .select('keyword, volume, rank_position, type, stat_date')
      .eq('site_id', site.id)
      .eq('platform', 'mobile')
      .gte('stat_date', rankLookbackStart)
      .lte('stat_date', dateEnd)
      .gt('volume', 0)
      .order('stat_date', { ascending: false })
      .limit(3000)

    // Build rank map (most recent rank per keyword)
    type RankEntry = { volume: number; rank_position: number | null; rank_type: string | null; stat_date: string }
    const rankMap = new Map<string, RankEntry>()
    for (const r of (rankRows || []) as { keyword: string; volume: number; rank_position: number | null; type: string; stat_date: string }[]) {
      if (!rankMap.has(r.keyword)) {
        rankMap.set(r.keyword, { volume: r.volume, rank_position: r.rank_position, rank_type: r.type, stat_date: r.stat_date })
      }
    }

    // Merge keywords with rank data, dedupe by keyword
    const seen = new Set<string>()
    const outcomes = []
    for (const kw of (kwRows || []) as { keyword: string; content_type: string | null; content_date: string; discovered_at: string; search_volume: number | null }[]) {
      if (seen.has(kw.keyword)) continue
      seen.add(kw.keyword)
      const rank = rankMap.get(kw.keyword)
      outcomes.push({
        keyword: kw.keyword,
        content_type: kw.content_type,
        content_date: kw.content_date,
        discovered_at: kw.discovered_at,
        volume: rank?.volume ?? kw.search_volume ?? 0,
        rank_position: rank?.rank_position ?? null,
        rank_type: rank?.rank_type ?? null,
        rank_date: rank?.stat_date ?? null,
      })
    }

    const hasRank  = outcomes.filter(o => o.rank_position != null).length
    const rankup   = outcomes.filter(o => o.rank_type === 'rankup').length
    const rankdown = outcomes.filter(o => o.rank_type === 'rankdown').length
    const top10    = outcomes.filter(o => o.rank_position != null && o.rank_position <= 10).length

    return NextResponse.json({
      site, date: dateStart,
      keywords: [], rankup: [], rankdown: [],
      outcomes,
      outcomeSummary: { total: outcomes.length, hasRank, rankup, rankdown, top10 },
    })
  }

  return NextResponse.json({ site, date, keywords: [], rankup: [], rankdown: [], outcomes: [], outcomeSummary: null })
}
