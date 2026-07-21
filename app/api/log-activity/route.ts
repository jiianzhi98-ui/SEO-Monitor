import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { activityStart, activityEnd } from '@/lib/activity-log'

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { step, domain, summary, ok, durationMs } = await req.json()
    const supabase = createServiceClient()
    const aid = await activityStart(supabase, {
      type: 'search',
      source: 'browser',
      step: step ?? null,
      domain: domain ?? null,
    })
    if (aid) await activityEnd(supabase, aid, {
      status: 'done',
      ok: ok ?? 0,
      durationMs: durationMs ?? null,
      summary: summary ?? null,
    })
  } catch { /* logging must never fail the caller */ }
  return NextResponse.json({ ok: true })
}
