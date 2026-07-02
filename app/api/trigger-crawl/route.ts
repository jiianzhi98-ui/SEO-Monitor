import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export const maxDuration = 55

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'normal'
  if (role === 'normal') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { site, step } = await req.json().catch(() => ({}))
  if (!site || !step) return NextResponse.json({ error: '缺少参数' }, { status: 400 })

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: '服务未配置' }, { status: 500 })

  const host = req.headers.get('host') || ''
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const url = `${protocol}://${host}/api/cron?site=${encodeURIComponent(site)}&step=${encodeURIComponent(step)}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(50000),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '触发失败' }, { status: 500 })
  }
}
