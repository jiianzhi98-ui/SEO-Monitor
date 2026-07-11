import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { UserRole } from '@/lib/user-context'

async function getCaller() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  return { id: user.id, email: user.email ?? '', role: (data?.role ?? 'normal') as UserRole }
}

interface RawGroup { id: string; name: string; type: string; created_at: string; competitor_domains: string[] }
interface RawMember { group_id: string; user_id: string; username: string | null; member_type: string | null }

export async function GET() {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const [{ data: groups, error }, { data: members }] = await Promise.all([
    service.from('task_groups').select('*').order('created_at'),
    service.from('task_group_members').select('group_id, user_id, username, member_type'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const membersByGroup = new Map<string, { user_id: string; username: string; member_type: string }[]>()
  for (const m of (members || []) as RawMember[]) {
    if (!membersByGroup.has(m.group_id)) membersByGroup.set(m.group_id, [])
    membersByGroup.get(m.group_id)!.push({ user_id: m.user_id, username: m.username || '', member_type: m.member_type || 'app' })
  }

  const allGroups = ((groups || []) as RawGroup[]).map(g => ({
    ...g,
    members: membersByGroup.get(g.id) || [],
  }))

  const result = caller.role === 'normal'
    ? allGroups.filter(g => g.members.some(m => m.user_id === caller.id))
    : allGroups

  return NextResponse.json({ groups: result })
}

export async function POST(req: Request) {
  const caller = await getCaller()
  if (!caller || caller.role === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { type, members, name: nameInput, rank_domains, new_domains, associated_domains, competitor_domains, site_domains } = await req.json() as {
    type: 'game' | 'app' | 'both'
    members: { user_id: string; username: string; member_type?: string }[]
    name?: string
    rank_domains?: string[]
    new_domains?: string[]
    associated_domains?: string[]
    competitor_domains?: string[]
    site_domains?: string[]
  }

  if (!type || !members || members.length === 0) {
    return NextResponse.json({ error: '请至少选择一个成员' }, { status: 400 })
  }

  const name = (nameInput || '').trim() || members.map(m => m.username || m.user_id.slice(0, 8)).join(' · ')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: group, error } = await service
    .from('task_groups')
    .insert({ name, type, rank_domains: rank_domains || [], new_domains: new_domains || [], associated_domains: associated_domains || [], competitor_domains: competitor_domains || [], site_domains: site_domains || [] })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await service.from('task_group_members').insert(
    members.map(m => ({ group_id: group.id, user_id: m.user_id, username: m.username, member_type: m.member_type || 'app' }))
  )

  return NextResponse.json({ group: { ...group, members } })
}
