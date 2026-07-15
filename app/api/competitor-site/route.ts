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
  // 以排名信号为主线：日期筛选器对应的是"发现排名变动的日期"，不是提交日期
  if (tab === 'outcomes') {
    // 1. 取日期范围内所有排名变动（发现日期 = stat_date）
    const { data: rankRows } = await service
      .from('site_keyword_ranks')
      .select('keyword, volume, rank_position, type, stat_date')
      .eq('site_id', site.id)
      .eq('platform', 'mobile')
      .gte('stat_date', dateStart)
      .lte('stat_date', dateEnd)
      .order('stat_date', { ascending: false })
      .order('volume', { ascending: false })
      .limit(2000)

    const allRankRows = (rankRows || []) as { keyword: string; volume: number; rank_position: number | null; type: string; stat_date: string }[]

    // 每个词只保留最近一条（最高量排名信号）
    const rankMap = new Map<string, { rank_volume: number; rank_position: number | null; rank_type: string; rank_date: string }>()
    for (const r of allRankRows) {
      if (!rankMap.has(r.keyword)) {
        rankMap.set(r.keyword, { rank_volume: r.volume, rank_position: r.rank_position, rank_type: r.type, rank_date: r.stat_date })
      }
    }
    const kwList = Array.from(rankMap.keys())

    if (kwList.length === 0) {
      return NextResponse.json({ site, date: dateStart, keywords: [], rankup: [], rankdown: [], outcomes: [], outcomeSummary: { total: 0, hasRank: 0, rankup: 0, rankdown: 0, top10: 0 } })
    }

    // 2. 查这些词在 raw_keywords 里的最新提交记录（发布日期、类型、文章链接）
    const { data: kwRows } = await service
      .from('raw_keywords')
      .select('keyword, content_type, content_date, source_url')
      .eq('site_id', site.id)
      .in('keyword', kwList.slice(0, 500))
      .not('keyword', 'like', '%电脑版%')
      .order('content_date', { ascending: false })

    // 每个词取最新记录；同时统计出现次数用于判断 operation_type
    type KwMeta = { content_type: string | null; content_date: string; source_url: string | null; count: number }
    const kwMetaMap = new Map<string, KwMeta>()
    for (const r of (kwRows || []) as { keyword: string; content_type: string | null; content_date: string; source_url: string | null }[]) {
      if (!kwMetaMap.has(r.keyword)) {
        kwMetaMap.set(r.keyword, { content_type: r.content_type, content_date: r.content_date, source_url: r.source_url, count: 1 })
      } else {
        kwMetaMap.get(r.keyword)!.count++
      }
    }

    // 3. 搜索量（从 keyword_volume）
    const { data: svRows } = await service
      .from('keyword_volume')
      .select('keyword, volume')
      .in('keyword', kwList.slice(0, 500))
    const searchVolMap = new Map(((svRows || []) as { keyword: string; volume: number }[]).map(r => [r.keyword, r.volume]))

    // 4. 收录状态：用 source_url 查 site_indexed_pages
    const sourceUrls = Array.from(kwMetaMap.values()).map(m => m.source_url).filter((u): u is string => !!u)
    const indexMap = new Map<string, { first_seen_date: string; last_seen_date: string }>()
    if (sourceUrls.length > 0) {
      const { data: idxRows } = await service
        .from('site_indexed_pages')
        .select('url, first_seen_date, last_seen_date')
        .eq('site_id', site.id)
        .in('url', sourceUrls.slice(0, 500))
      for (const r of (idxRows || []) as { url: string; first_seen_date: string; last_seen_date: string }[]) {
        indexMap.set(r.url, { first_seen_date: r.first_seen_date, last_seen_date: r.last_seen_date })
      }
    }

    // 5. 竞品规则（判断 operation_type）
    const { data: profile } = await service
      .from('competitor_profiles')
      .select('same_name_diff_date_is_update')
      .eq('domain', domain)
      .maybeSingle()
    const sameNameDiffDate: boolean = profile?.same_name_diff_date_is_update ?? false

    // 6. 组装输出：每个词一行
    const outcomes = kwList.map(keyword => {
      const rank = rankMap.get(keyword)!
      const meta = kwMetaMap.get(keyword)
      const idx = meta?.source_url ? indexMap.get(meta.source_url) : undefined
      // 若同词多次出现在不同日期 → 更新
      const operation_type: '新增' | '更新' = (sameNameDiffDate && (meta?.count ?? 0) > 1) ? '更新' : '新增'
      return {
        keyword,
        content_type: meta?.content_type ?? null,
        content_date: meta?.content_date ?? null,
        search_volume: searchVolMap.get(keyword) ?? 0,
        rank_volume: rank.rank_volume,
        rank_position: rank.rank_position,
        rank_type: rank.rank_type,
        rank_date: rank.rank_date,
        operation_type,
        index_first_seen: idx?.first_seen_date ?? null,
        index_last_seen: idx?.last_seen_date ?? null,
      }
    })

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
