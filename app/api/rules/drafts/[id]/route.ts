import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  if (!['super', 'admin'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json() as {
    action: 'approve' | 'reject'
    // Editable draft fields (for approve)
    draft_name?: string
    draft_type?: string
    draft_rule_status?: string
    draft_description?: string
    draft_confidence?: number
    draft_stage_applicability?: string[]
  }

  if (body.action === 'reject') {
    const { error } = await service
      .from('rule_drafts')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (body.action === 'approve') {
    const VALID_TYPES = ['add', 'update', 'delete', 'redirect', 'other']
    const VALID_STATUSES = ['active', 'testing', 'archived']
    if (body.draft_type && !VALID_TYPES.includes(body.draft_type)) {
      return NextResponse.json({ error: 'Invalid draft_type' }, { status: 400 })
    }
    if (body.draft_rule_status && !VALID_STATUSES.includes(body.draft_rule_status)) {
      return NextResponse.json({ error: 'Invalid draft_rule_status' }, { status: 400 })
    }

    // Fetch the draft to get latest values
    const { data: draft } = await service.from('rule_drafts').select('*').eq('id', id).single()
    if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    // For new_rule drafts: create a real rule
    if (draft.draft_category === 'new_rule') {
      const { data: maxRow } = await service
        .from('rules')
        .select('rule_number')
        .order('rule_number', { ascending: false })
        .limit(1)
        .single()
      const nextNumber = (maxRow?.rule_number ?? 0) + 1

      const { data: newRule, error: ruleErr } = await service
        .from('rules')
        .insert({
          rule_number: nextNumber,
          name: body.draft_name ?? draft.draft_name,
          type: body.draft_type ?? draft.draft_type ?? 'add',
          status: body.draft_rule_status ?? draft.draft_rule_status ?? 'testing',
          source: 'ai',
          description: body.draft_description ?? draft.draft_description ?? null,
          confidence: body.draft_confidence ?? draft.draft_confidence ?? 50,
          stage_applicability: body.draft_stage_applicability ?? draft.draft_stage_applicability ?? [],
          success_count: 0,
          fail_count: 0,
          priority: 0,
          site_ids: [],
          competitor_domains: [],
          created_by: user.id,
        })
        .select()
        .single()

      if (ruleErr) return NextResponse.json({ error: ruleErr.message }, { status: 500 })

      await service.from('rule_drafts').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      }).eq('id', id)

      return NextResponse.json({ success: true, rule: newRule })
    }

    // For rule_review drafts: just mark as approved (admin reviews manually)
    await service.from('rule_drafts').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }).eq('id', id)

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
