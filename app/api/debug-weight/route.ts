import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// One-time backfill: copy all rankup keywords from rank_changes into keyword_volume
// Existing entries with volume>0 are preserved (ignoreDuplicates for volume=0 rows)
export async function GET() {
  const supabase = createServiceClient()

  const { data: rankRows, error } = await supabase
    .from('rank_changes')
    .select('keyword, volume')
    .eq('type', 'rankup')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (rankRows || []) as { keyword: string; volume: number }[]

  // Deduplicate: keep max volume per keyword
  const map = new Map<string, number>()
  for (const r of rows) {
    const v = r.volume ?? 0
    map.set(r.keyword, Math.max(map.get(r.keyword) ?? 0, v))
  }

  const withVol = Array.from(map.entries()).filter(([, v]) => v > 0).map(([keyword, volume]) => ({ keyword, volume }))
  const noVol = Array.from(map.entries()).filter(([, v]) => v <= 0).map(([keyword]) => ({ keyword, volume: 0 }))

  let withVolResult = null, noVolResult = null

  if (withVol.length > 0) {
    const res = await (supabase.from('keyword_volume') as any).upsert(withVol, { onConflict: 'keyword' })
    withVolResult = res.error?.message ?? `${withVol.length} rows upserted`
  }
  if (noVol.length > 0) {
    const res = await (supabase.from('keyword_volume') as any).upsert(noVol, { onConflict: 'keyword', ignoreDuplicates: true })
    noVolResult = res.error?.message ?? `${noVol.length} rows inserted (no overwrite)`
  }

  return NextResponse.json({
    total: map.size,
    withVolume: withVol.length,
    withoutVolume: noVol.length,
    withVolResult,
    noVolResult,
  })
}
