import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { UserRole } from '@/lib/user-context'

async function getCallerRole(): Promise<UserRole | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  return (data?.role ?? 'normal') as UserRole
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCallerRole()
  if (!role || role === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { name, members, rank_domains, new_domains, associated_domains, competitor_domains, site_domains } = await req.json() as {
    name: string
    members: { user_id: string; username: string; member_type?: string }[]
    rank_domains?: string[]
    new_domains?: string[]
    associated_domains?: string[]
    competitor_domains?: string[]
    site_domains?: string[]
  }

  if (!members || members.length === 0) {
    return NextResponse.json({ error: '请至少选择一个成员' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { error: updateErr } = await service
    .from('task_groups')
    .update({ name, rank_domains: rank_domains || [], new_domains: new_domains || [], associated_domains: associated_domains || [], competitor_domains: competitor_domains || [], site_domains: site_domains || [] })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await service.from('task_group_members').delete().eq('group_id', id)
  await service.from('task_group_members').insert(
    members.map(m => ({ group_id: id, user_id: m.user_id, username: m.username, member_type: m.member_type || 'app' }))
  )

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getCallerRole()
  if (!role || role === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { error } = await service.from('task_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
