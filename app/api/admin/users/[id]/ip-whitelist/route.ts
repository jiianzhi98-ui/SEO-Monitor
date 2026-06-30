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

const ipv4Re = /^(\d{1,3}\.){3}\d{1,3}$/

// GET /api/admin/users/[id]/ip-whitelist
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const caller = await getCallerRole()
  if (!caller || caller.role === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data } = await service
    .from('user_profiles')
    .select('allowed_ips')
    .eq('id', params.id)
    .single()

  return NextResponse.json({ allowedIps: data?.allowed_ips ?? [] })
}

// PUT /api/admin/users/[id]/ip-whitelist
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const caller = await getCallerRole()
  if (!caller || caller.role === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { allowedIps } = await req.json() as { allowedIps: string[] }
  const valid = (allowedIps ?? []).filter((ip: string) => ipv4Re.test(ip.trim()))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { error } = await service
    .from('user_profiles')
    .update({ allowed_ips: valid.length > 0 ? valid : null })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
