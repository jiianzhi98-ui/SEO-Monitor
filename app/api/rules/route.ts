import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

function calcClaimScore(rankPos: number | null, isIndexed: boolean, rankChange: number | null): number {
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

  const [{ data, error }, { data: trackingRows }, { data: claimRows }] = await Promise.all([
    service.from('rules').select('*').order('rule_number', { ascending: true }),
    service.from('competitor_tracking_records')
      .select('rule_id, effectiveness')
      .not('rule_id', 'is', null),
    service.from('member_claimed_keywords')
      .select('id, source_rule_id')
      .not('source_rule_id', 'is', null)
      .limit(2000),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate competitor tracked stats per rule_id
  const statsMap = new Map<string, { tracked_success: number; tracked_fail: number; tracked_tracking: number }>()
  for (const row of (trackingRows ?? []) as { rule_id: string; effectiveness: string }[]) {
    if (!row.rule_id) continue
    const s = statsMap.get(row.rule_id) ?? { tracked_success: 0, tracked_fail: 0, tracked_tracking: 0 }
    if (row.effectiveness === '有效') s.tracked_success++
    else if (row.effectiveness === '无效') s.tracked_fail++
    else s.tracked_tracking++
    statsMap.set(row.rule_id, s)
  }

  // Compute avg score per rule from member claims → site_tracking_records
  const claimToRule = new Map<string, string>()
  for (const c of (claimRows ?? []) as { id: string; source_rule_id: string }[]) {
    claimToRule.set(c.id, c.source_rule_id)
  }

  const scoreMap = new Map<string, { total: number; count: number }>()
  if (claimToRule.size > 0) {
    const { data: siteTrack } = await service
      .from('site_tracking_records')
      .select('claim_id, rank_position, prev_rank_position, is_indexed')
      .in('claim_id', Array.from(claimToRule.keys()))
      .order('record_date', { ascending: false })
      .limit(5000)

    const seenClaims = new Set<string>()
    for (const t of (siteTrack ?? []) as { claim_id: string; rank_position: number | null; prev_rank_position: number | null; is_indexed: boolean }[]) {
      if (seenClaims.has(t.claim_id)) continue
      seenClaims.add(t.claim_id)
      const ruleId = claimToRule.get(t.claim_id)
      if (!ruleId) continue
      const rankChange = (t.rank_position != null && t.prev_rank_position != null)
        ? t.prev_rank_position - t.rank_position : null
      const score = calcClaimScore(t.rank_position, t.is_indexed, rankChange)
      const s = scoreMap.get(ruleId) ?? { total: 0, count: 0 }
      s.total += score
      s.count += 1
      scoreMap.set(ruleId, s)
    }
  }

  const rules = (data ?? []).map((r: { id: string }) => {
    const sd = scoreMap.get(r.id)
    return {
      ...r,
      ...(statsMap.get(r.id) ?? { tracked_success: 0, tracked_fail: 0, tracked_tracking: 0 }),
      avg_score: sd && sd.count > 0 ? Math.round(sd.total / sd.count) : null,
      avg_score_count: sd?.count ?? 0,
    }
  })

  return NextResponse.json({ rules })
}

export async function POST(req: Request) {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data: profile } = await service
    .from('user_profiles').select('role').eq('id', user.id).single()
  if (!['super', 'admin'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { data, error } = await service
    .from('rules')
    .insert({
      name:                body.name,
      type:                body.type,
      status:              body.status ?? 'active',
      source:              body.source ?? 'manual',
      stage_applicability: body.stage_applicability ?? [],
      description:         body.description ?? null,
      confidence:          body.confidence ?? 0,
      success_count:       body.success_count ?? 0,
      fail_count:          body.fail_count ?? 0,
      priority:            body.priority ?? 0,
      site_ids:            body.site_ids ?? [],
      competitor_domains:  body.competitor_domains ?? [],
      created_by:          user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}
