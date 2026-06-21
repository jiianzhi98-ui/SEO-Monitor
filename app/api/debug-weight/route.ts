import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// One-time backfill: copy all rankup keywords from rank_changes into keyword_volume
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

  const insertRows = Array.from(map.entries()).map(([keyword, volume]) => ({ keyword, volume }))

  // Clear existing data first, then insert deduplicated rows
  const { error: delErr } = await supabase.from('keyword_volume').delete().gte('volume', -1)
  if (delErr) return NextResponse.json({ error: 'delete failed: ' + delErr.message }, { status: 500 })

  if (insertRows.length === 0) return NextResponse.json({ total: 0 })

  // Insert in batches of 500
  const errors: string[] = []
  for (let i = 0; i < insertRows.length; i += 500) {
    const batch = insertRows.slice(i, i + 500)
    const res = await (supabase.from('keyword_volume') as any).insert(batch)
    if (res.error) errors.push(res.error.message)
  }

  return NextResponse.json({
    total: insertRows.length,
    withVolume: insertRows.filter(r => r.volume > 0).length,
    withoutVolume: insertRows.filter(r => r.volume === 0).length,
    errors: errors.length > 0 ? errors : null,
  })
}
