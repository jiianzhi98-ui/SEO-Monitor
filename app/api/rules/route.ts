import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const [{ data, error }, { data: trackingRows }] = await Promise.all([
    service.from('rules').select('*').order('rule_number', { ascending: true }),
    service.from('competitor_tracking_records')
      .select('rule_id, effectiveness')
      .not('rule_id', 'is', null),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate tracked stats per rule_id
  const statsMap = new Map<string, { tracked_success: number; tracked_fail: number; tracked_tracking: number }>()
  for (const row of (trackingRows ?? []) as { rule_id: string; effectiveness: string }[]) {
    if (!row.rule_id) continue
    const s = statsMap.get(row.rule_id) ?? { tracked_success: 0, tracked_fail: 0, tracked_tracking: 0 }
    if (row.effectiveness === '有效') s.tracked_success++
    else if (row.effectiveness === '无效') s.tracked_fail++
    else s.tracked_tracking++
    statsMap.set(row.rule_id, s)
  }

  const rules = (data ?? []).map((r: { id: string }) => ({
    ...r,
    ...(statsMap.get(r.id) ?? { tracked_success: 0, tracked_fail: 0, tracked_tracking: 0 }),
  }))

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
