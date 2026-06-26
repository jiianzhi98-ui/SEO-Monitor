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
  return ((data?.role ?? 'normal') as UserRole)
}

// GET /api/admin/users/[id]/access
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const callerRole = await getCallerRole()
  if (!callerRole || callerRole === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const [{ data: restrictedSites }, { data: granted }] = await Promise.all([
    service.from('sites').select('id, domain, name, focus_level').in('focus_level', [1, 2]).order('focus_level').order('name'),
    service.from('user_site_access').select('site_id').eq('user_id', params.id),
  ])

  return NextResponse.json({
    restrictedSites: restrictedSites ?? [],
    grantedSiteIds: ((granted ?? []) as { site_id: string }[]).map(g => g.site_id),
  })
}

// PUT /api/admin/users/[id]/access
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const callerRole = await getCallerRole()
  if (!callerRole || callerRole === 'normal') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { siteIds } = await req.json() as { siteIds: string[] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  await service.from('user_site_access').delete().eq('user_id', params.id)

  if (siteIds.length > 0) {
    await service.from('user_site_access').insert(
      siteIds.map((site_id: string) => ({ user_id: params.id, site_id }))
    )
  }

  return NextResponse.json({ ok: true })
}
