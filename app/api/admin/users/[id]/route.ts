import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { UserRole } from '@/lib/user-context'

async function getCallerRole(): Promise<{ callerId: string; role: UserRole } | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  return { callerId: user.id, role: ((data?.role ?? 'normal') as UserRole) }
}

// PATCH /api/admin/users/[id]
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const caller = await getCallerRole()
  if (!caller || caller.role === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { role } = await req.json() as { role: UserRole }

  if (caller.role === 'admin' && role === 'super') {
    return NextResponse.json({ error: '无权限设置超级账号' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: target } = await service.from('user_profiles').select('role').eq('id', params.id).single()
  if (caller.role === 'admin' && target?.role === 'super') {
    return NextResponse.json({ error: '无权限修改超级账号' }, { status: 403 })
  }

  await service.from('user_profiles').upsert({ id: params.id, role })

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/users/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const caller = await getCallerRole()
  if (!caller || caller.role === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (caller.callerId === params.id) {
    return NextResponse.json({ error: '不能删除自己的账号' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: target } = await service.from('user_profiles').select('role').eq('id', params.id).single()
  if (caller.role === 'admin' && target?.role === 'super') {
    return NextResponse.json({ error: '无权限删除超级账号' }, { status: 403 })
  }

  const { error } = await service.auth.admin.deleteUser(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
