import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

function getMY(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const diff = new Date(getMY()).getTime() - new Date(dateStr.slice(0, 10)).getTime()
  return Math.max(0, Math.floor(diff / 86400000))
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId } = await params
  const { searchParams } = new URL(req.url)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  const role: string = profile?.role ?? 'normal'
  const canSeeAll = role === 'super' || role === 'admin'

  if (!canSeeAll) {
    const { data: member } = await service
      .from('task_group_members').select('user_id')
      .eq('group_id', groupId).eq('user_id', user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Members lookup (for usernames)
  const { data: membersRaw } = await service
    .from('task_group_members').select('user_id, username').eq('group_id', groupId)
  const memberMap = new Map<string, string>(
    (membersRaw || []).map((m: { user_id: string; username: string | null }) =>
      [m.user_id, m.username || m.user_id.slice(0, 8)])
  )

  // Filters from query params
  const filterDiscoverStart = searchParams.get('discoverStart') || ''
  const filterDiscoverEnd   = searchParams.get('discoverEnd') || ''
  const filterMember        = searchParams.get('memberId') || ''
  const filterOp            = searchParams.get('opType') || ''
  const filterKw            = (searchParams.get('keyword') || '').toLowerCase()
  const filterSubmitStart   = searchParams.get('submitStart') || ''
  const filterSubmitEnd     = searchParams.get('submitEnd') || ''
  const filterIndex         = searchParams.get('indexed') || ''   // 'has' | 'none'
  const filterRankKw        = (searchParams.get('rankKeyword') || '').toLowerCase()
  const filterOutcome       = searchParams.get('outcome') || ''   // 'success'|'fail'|'pending'
  const sortBy              = searchParams.get('sortBy') || 'claimed_date'
  const sortDir             = searchParams.get('sortDir') || 'desc'

  // Build member_claimed_keywords query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let kwQuery: any = service
    .from('member_claimed_keywords')
    .select('id, user_id, keyword, final_keyword, page_url, operation_type, search_volume, source, claimed_date, submitted_at')
    .eq('group_id', groupId)
    .eq('status', 'submitted')

  if (!canSeeAll) kwQuery = kwQuery.eq('user_id', user.id)
  if (filterDiscoverStart) kwQuery = kwQuery.gte('claimed_date', filterDiscoverStart)
  if (filterDiscoverEnd)   kwQuery = kwQuery.lte('claimed_date', filterDiscoverEnd)
  if (filterMember && canSeeAll) kwQuery = kwQuery.eq('user_id', filterMember)
  if (filterOp) kwQuery = kwQuery.eq('operation_type', filterOp)

  const { data: kwRows, error: kwErr } = await kwQuery
  if (kwErr) return NextResponse.json({ error: kwErr.message }, { status: 500 })

  type KwRow = { id: string; user_id: string; keyword: string; final_keyword: string | null; page_url: string | null; operation_type: string | null; search_volume: number; source: string; claimed_date: string; submitted_at: string | null }
  const allRows = (kwRows || []) as KwRow[]

  // Collect unique non-null page_urls
  const pageUrls = Array.from(new Set(allRows.filter(r => r.page_url).map(r => r.page_url!)))

  // Batch fetch index data
  const indexMap = new Map<string, { first_seen_date: string; disappeared_date: string | null }>()
  if (pageUrls.length > 0) {
    const { data: indexRows } = await service
      .from('site_indexed_pages')
      .select('url, first_seen_date, disappeared_date')
      .in('url', pageUrls)
    for (const r of (indexRows || []) as { url: string; first_seen_date: string; disappeared_date: string | null }[]) {
      indexMap.set(r.url, { first_seen_date: r.first_seen_date, disappeared_date: r.disappeared_date })
    }
  }

  // Batch fetch rank data — most recent stat_date, best rank_position per URL
  const rankMap = new Map<string, { keyword: string; rank_position: number | null; prev_rank: number | null; volume: number | null; stat_date: string }>()
  if (pageUrls.length > 0) {
    const { data: rankRows } = await service
      .from('site_keyword_ranks')
      .select('url, keyword, rank_position, prev_rank, volume, stat_date')
      .in('url', pageUrls)
      .not('url', 'is', null)
      .order('stat_date', { ascending: false })
      .order('rank_position', { ascending: true, nullsFirst: false })

    for (const r of (rankRows || []) as { url: string; keyword: string; rank_position: number | null; prev_rank: number | null; volume: number | null; stat_date: string }[]) {
      if (!rankMap.has(r.url)) {
        rankMap.set(r.url, { keyword: r.keyword, rank_position: r.rank_position, prev_rank: r.prev_rank, volume: r.volume, stat_date: r.stat_date })
      }
    }
  }

  type OutcomeRow = {
    id: string; user_id: string; username: string
    keyword: string; final_keyword: string | null
    page_url: string | null; operation_type: string | null
    search_volume: number; source: string
    claimed_date: string; submitted_at: string | null
    indexed: boolean; first_seen_date: string | null; disappeared_date: string | null
    rank_keyword: string | null; rank_position: number | null; prev_rank: number | null
    rank_change: number | null; rank_volume: number | null; rank_date: string | null
    outcome: 'success' | 'fail' | 'pending'
  }

  let rows: OutcomeRow[] = allRows.map(row => {
    const idx  = row.page_url ? indexMap.get(row.page_url) : undefined
    const rank = row.page_url ? rankMap.get(row.page_url)  : undefined

    const indexed          = !!idx && !idx.disappeared_date
    const first_seen_date  = idx?.first_seen_date  ?? null
    const disappeared_date = idx?.disappeared_date ?? null

    const rank_keyword  = rank?.keyword       ?? null
    const rank_position = rank?.rank_position ?? null
    const prev_rank     = rank?.prev_rank     ?? null
    const rank_change   = (rank_position != null && prev_rank != null) ? prev_rank - rank_position : null
    const rank_volume   = rank?.volume        ?? null
    const rank_date     = rank?.stat_date     ?? null

    const submitDate = row.submitted_at ? row.submitted_at.slice(0, 10) : row.claimed_date
    const days = daysSince(submitDate)

    let outcome: 'success' | 'fail' | 'pending'
    if (indexed && rank_position != null) {
      outcome = 'success'
    } else if (days >= 30) {
      outcome = 'fail'
    } else {
      outcome = 'pending'
    }

    return {
      id: row.id,
      user_id: row.user_id,
      username: memberMap.get(row.user_id) ?? row.user_id.slice(0, 8),
      keyword: row.keyword, final_keyword: row.final_keyword,
      page_url: row.page_url, operation_type: row.operation_type,
      search_volume: Number(row.search_volume) || 0,
      source: row.source, claimed_date: row.claimed_date, submitted_at: row.submitted_at,
      indexed, first_seen_date, disappeared_date,
      rank_keyword, rank_position, prev_rank, rank_change, rank_volume, rank_date,
      outcome,
    }
  })

  // Post-join filters
  if (filterSubmitStart) rows = rows.filter(r => (r.submitted_at ?? r.claimed_date).slice(0, 10) >= filterSubmitStart)
  if (filterSubmitEnd)   rows = rows.filter(r => (r.submitted_at ?? r.claimed_date).slice(0, 10) <= filterSubmitEnd)
  if (filterKw)          rows = rows.filter(r => r.keyword.toLowerCase().includes(filterKw) || (r.final_keyword ?? '').toLowerCase().includes(filterKw))
  if (filterIndex === 'has')  rows = rows.filter(r => r.indexed)
  if (filterIndex === 'none') rows = rows.filter(r => !r.indexed)
  if (filterRankKw)      rows = rows.filter(r => (r.rank_keyword ?? '').toLowerCase().includes(filterRankKw))
  if (filterOutcome)     rows = rows.filter(r => r.outcome === filterOutcome)

  // Sort
  const dir = sortDir === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    switch (sortBy) {
      case 'submitted_at': {
        const sa = (a.submitted_at ?? a.claimed_date).slice(0, 10)
        const sb = (b.submitted_at ?? b.claimed_date).slice(0, 10)
        return dir * sa.localeCompare(sb)
      }
      case 'search_volume': return dir * (a.search_volume - b.search_volume)
      case 'rank_change': {
        const ra = a.rank_change ?? -9999; const rb = b.rank_change ?? -9999
        return dir * (ra - rb)
      }
      case 'rank_volume': return dir * ((a.rank_volume ?? 0) - (b.rank_volume ?? 0))
      default: return dir * a.claimed_date.localeCompare(b.claimed_date)
    }
  })

  const summary = {
    total:        rows.length,
    successCount: rows.filter(r => r.outcome === 'success').length,
    indexedCount: rows.filter(r => r.indexed).length,
    pendingCount: rows.filter(r => r.outcome === 'pending').length,
  }

  return NextResponse.json({ rows, summary })
}
