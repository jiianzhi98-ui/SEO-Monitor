import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// Accepts ?ids=id1,id2,... and checks each site with limit(1) in parallel.
// Much more efficient than loading all rank_changes rows.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') || '').split(',').filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ ids: [] })

  const supabase = createServiceClient()
  const since = new Date(Date.now() + 8 * 3600000 - 30 * 86400000).toISOString().slice(0, 10)

  const results = await Promise.all(
    ids.map(id =>
      supabase.from('rank_changes').select('site_id').eq('site_id', id).gte('stat_date', since).limit(1)
    )
  )

  const hasData = ids.filter((id, i) => (results[i].data?.length ?? 0) > 0)
  return NextResponse.json({ ids: hasData })
}
