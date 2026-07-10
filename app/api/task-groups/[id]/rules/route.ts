import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function GET(_req: Request, { params: _params }: { params: Promise<{ id: string }> }) {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data, error } = await service
    .from('rules')
    .select('*')
    .order('rule_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data ?? [] })
}

export async function POST(req: Request, { params: _params }: { params: Promise<{ id: string }> }) {
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
      created_by:          user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}
