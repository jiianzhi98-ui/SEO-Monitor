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
    const { data: kwRows } = await service
      .from('raw_keywords')
      .select('keyword, content_type, content_date, source_url')
      .eq('site_id', site.id)
      .gte('content_date', dateStart)
      .lte('content_date', dateEnd)
      .not('keyword', 'like', '%电脑版%')
      .order('content_date', { ascending: false })
      .order('keyword', { ascending: true })
      .limit(500)

    const allKws = (kwRows || []) as { keyword: string; content_type: string | null; content_date: string; source_url: string | null }[]
    const kwList = allKws.map(r => r.keyword)

    // Fetch volumes from keyword_volume
    const { data: volRows } = await service
      .from('keyword_volume')
      .select('keyword, volume')
      .in('keyword', kwList.slice(0, 500))
    const volMap = new Map(((volRows || []) as { keyword: string; volume: number }[]).map(r => [r.keyword, r.volume]))

    // Fetch titles from site_keyword_ranks (most recent non-null title)
    const { data: titleRows } = await service
      .from('site_keyword_ranks')
      .select('keyword, title')
      .eq('site_id', site.id)
      .in('keyword', kwList.slice(0, 500))
      .not('title', 'is', null)
      .order('stat_date', { ascending: false })
      .limit(1000)
    const titleMap = new Map<string, string>()
    for (const r of (titleRows || []) as { keyword: string; title: string }[]) {
      if (!titleMap.has(r.keyword)) titleMap.set(r.keyword, r.title)
    }

    // Fetch competitor profile for update detection rules
    const { data: profile } = await service
      .from('competitor_profiles')
      .select('same_name_diff_date_is_update, same_base_diff_sub_is_update')
      .eq('domain', domain)
      .maybeSingle()
    const sameNameDiffDate: boolean = profile?.same_name_diff_date_is_update ?? false
    const sameBaseDiffSub: boolean  = profile?.same_base_diff_sub_is_update ?? false

    // For same_name_diff_date: check if keywords appeared before this date range
    const historicalKws = new Set<string>()
    if (sameNameDiffDate && kwList.length > 0) {
      const { data: histRows } = await service
        .from('raw_keywords')
        .select('keyword')
        .eq('site_id', site.id)
        .lt('content_date', dateStart)
        .in('keyword', kwList.slice(0, 500))
      for (const r of (histRows || []) as { keyword: string }[]) historicalKws.add(r.keyword)
    }

    // For same_base_diff_sub: count keywords per date per 4-char prefix
    const baseDateCount = new Map<string, number>()
    if (sameBaseDiffSub) {
      for (const r of allKws) {
        const key = `${r.content_date}|${r.keyword.slice(0, 4)}`
        baseDateCount.set(key, (baseDateCount.get(key) ?? 0) + 1)
      }
    }

    const keywords = allKws.map(r => {
      let operation_type: '新增' | '更新' = '新增'
      if (sameNameDiffDate && historicalKws.has(r.keyword)) {
        operation_type = '更新'
      } else if (sameBaseDiffSub) {
        const key = `${r.content_date}|${r.keyword.slice(0, 4)}`
        if ((baseDateCount.get(key) ?? 0) >= 3) operation_type = '更新'
      }
      return {
        keyword: r.keyword,
        search_volume: volMap.get(r.keyword) ?? 0,
        title: titleMap.get(r.keyword) ?? null,
        operation_type,
        source: r.content_type || '',
        content_type: r.content_type,
        content_date: r.content_date,
        source_url: r.source_url,
      }
    })

    return NextResponse.json({ site, date: dateStart, keywords, rankup: [], rankdown: [], outcomes: [], outcomeSummary: null })
  }

  // ── 成效追踪 ──────────────────────────────────────────────────────────────────
  if (tab === 'outcomes') {
    // 1. Keywords published in date range
    const { data: kwRows } = await service
      .from('raw_keywords')
      .select('keyword, content_type, content_date, discovered_at, source_url')
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
    for (const kw of (kwRows || []) as { keyword: string; content_type: string | null; content_date: string; discovered_at: string; source_url: string | null }[]) {
      if (seen.has(kw.keyword)) continue
      seen.add(kw.keyword)
      const rank = rankMap.get(kw.keyword)
      outcomes.push({
        keyword: kw.keyword,
        content_type: kw.content_type,
        content_date: kw.content_date,
        discovered_at: kw.discovered_at,
        source_url: kw.source_url,
        volume: rank?.volume ?? 0,
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
