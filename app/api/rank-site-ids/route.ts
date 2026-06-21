import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// Returns the set of site_ids that have any rank_changes in the last 30 days.
// Server-side query avoids client-side row limits.
export async function GET() {
  const supabase = createServiceClient()
  const since = new Date(Date.now() + 8 * 3600000 - 30 * 86400000).toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('rank_changes')
    .select('site_id')
    .gte('stat_date', since)

  if (error) return NextResponse.json({ ids: [] })

  const ids = Array.from(new Set((data || []).map((r: any) => r.site_id)))
  return NextResponse.json({ ids })
}
