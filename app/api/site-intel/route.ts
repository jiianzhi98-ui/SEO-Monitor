import { NextResponse } from 'next/server'
import { fetchAizhanData } from '@/lib/crawler'
import { createServiceClient } from '@/lib/supabase-server'
import { activityStart, activityEnd } from '@/lib/activity-log'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain')?.trim()
  if (!domain) return NextResponse.json({ error: '缺少域名' }, { status: 400 })

  const supabase = createServiceClient()
  const aid = await activityStart(supabase, { type: 'search', source: 'site-intel', domain })
  const t0 = Date.now()

  try {
    const data = await fetchAizhanData(domain)
    if (aid) await activityEnd(supabase, aid, {
      status: 'done', ok: 1, rowsWritten: 0, durationMs: Date.now() - t0,
      summary: `pc=${data.pc} mobile=${data.mobile} index=${data.indexCount}`,
    })
    return NextResponse.json(data)
  } catch {
    if (aid) await activityEnd(supabase, aid, { status: 'fail', durationMs: Date.now() - t0 })
    return NextResponse.json({ pc: 0, mobile: 0, indexCount: 0, pcIpMin: 0, pcIpMax: 0, pcIpAvg: 0, mobileIpMin: 0, mobileIpMax: 0, mobileIpAvg: 0 })
  }
}
