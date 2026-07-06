import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'normal') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { site_id, direction } = await request.json()
  if (!site_id || !direction) return NextResponse.json({ error: '缺少参数' }, { status: 400 })

  try {
    let rows = 0
    if (direction === 'to_site_rank_keywords') {
      const { data, error } = await service.rpc('migrate_rank_changes_to_srk', { p_site_id: site_id })
      if (error) throw error
      rows = data ?? 0
    } else if (direction === 'to_rank_changes') {
      const { data, error } = await service.rpc('migrate_srk_to_rank_changes', { p_site_id: site_id })
      if (error) throw error
      rows = data ?? 0
    } else {
      return NextResponse.json({ error: '无效 direction' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, rows })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '迁移失败' }, { status: 500 })
  }
}
