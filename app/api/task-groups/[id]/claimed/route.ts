import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

function getMY(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

async function getCallerId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function getCallerRole(callerId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data } = await service.from('user_profiles').select('role').eq('id', callerId).single()
  return data?.role ?? 'normal'
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const callerId = await getCallerId()
  if (!callerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId } = await params
  const { searchParams } = new URL(req.url)
  const requestedUserId = searchParams.get('userId')
  const date = searchParams.get('date') || getMY()

  // Only admin/super can query other users' records
  let userId = callerId
  if (requestedUserId && requestedUserId !== callerId) {
    const role = await getCallerRole(callerId)
    if (role === 'normal') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    userId = requestedUserId
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data, error } = await service
    .from('member_claimed_keywords')
    .select('id, keyword, keyword_type, source, search_volume, status, operation_type, final_keyword, page_url, created_at')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .eq('claimed_date', date)
    .neq('status', 'dismissed')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ keywords: data || [] })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const callerId = await getCallerId()
  if (!callerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId } = await params
  const { keyword, source, search_volume, operation_type, final_keyword, page_url, source_rule_id } = await req.json() as {
    keyword: string
    source: string
    search_volume?: number
    operation_type?: string
    final_keyword?: string
    page_url?: string
    source_rule_id?: string | null
  }

  if (!keyword) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const claimedDate = getMY()

  // Check if already claimed today (non-dismissed)
  const { data: existing } = await service
    .from('member_claimed_keywords')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', callerId)
    .eq('keyword', keyword)
    .eq('claimed_date', claimedDate)
    .neq('status', 'dismissed')
    .single()

  if (existing) return NextResponse.json({ error: '已认领' }, { status: 409 })

  const { data, error } = await service
    .from('member_claimed_keywords')
    .insert({
      group_id: groupId,
      user_id: callerId,
      keyword,
      keyword_type: null,
      source,
      search_volume: search_volume || 0,
      claimed_date: claimedDate,
      status: 'pending',
      operation_type: operation_type || null,
      final_keyword: final_keyword || null,
      page_url: page_url || null,
      source_rule_id: source_rule_id || null,
    })
    .select('id, keyword, keyword_type, source, search_volume, status, operation_type, final_keyword, page_url, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ keyword: data })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const callerId = await getCallerId()
  if (!callerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId } = await params
  const { claimId, status, final_keyword, page_url, operation_type, experiment_group } = await req.json() as {
    claimId: string
    status?: string
    final_keyword?: string
    page_url?: string
    operation_type?: string
    experiment_group?: 'control' | 'treatment' | null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const updateData: Record<string, unknown> = {}
  if (status !== undefined) {
    updateData.status = status
    if (status === 'submitted') updateData.submitted_at = new Date().toISOString()
  }
  if (final_keyword !== undefined) updateData.final_keyword = final_keyword || null
  if (page_url !== undefined) updateData.page_url = page_url || null
  if (operation_type !== undefined) updateData.operation_type = operation_type || null
  if (experiment_group !== undefined) updateData.experiment_group = experiment_group ?? null

  const { error } = await service
    .from('member_claimed_keywords')
    .update(updateData)
    .eq('id', claimId)
    .eq('group_id', groupId)
    .eq('user_id', callerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// Submit all pending for a given date
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const callerId = await getCallerId()
  if (!callerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: groupId } = await params
  const body = await req.json().catch(() => ({})) as { date?: string }
  const date = body.date || getMY()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { error } = await service
    .from('member_claimed_keywords')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', callerId)
    .eq('claimed_date', date)
    .eq('status', 'pending')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
