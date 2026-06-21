import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const supabase = createServiceClient()

  const { data: rankRows, error } = await supabase
    .from('rank_changes')
    .select('keyword, volume, stat_date')
    .eq('type', 'rankup')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (rankRows || []) as { keyword: string; volume: number; stat_date: string }[]

  // Deduplicate: keep max volume per keyword, and most recent stat_date
  const map = new Map<string, { volume: number; stat_date: string }>()
  for (const r of rows) {
    const v = r.volume ?? 0
    const existing = map.get(r.keyword)
    if (!existing || v > existing.volume || (!existing.stat_date && r.stat_date)) {
      map.set(r.keyword, { volume: Math.max(v, existing?.volume ?? 0), stat_date: r.stat_date ?? existing?.stat_date ?? '' })
    }
  }

  const insertRows = Array.from(map.entries()).map(([keyword, { volume, stat_date }]) => ({ keyword, volume, stat_date }))

  const { error: delErr } = await supabase.from('keyword_volume').delete().gte('volume', -1)
  if (delErr) return NextResponse.json({ error: 'delete failed: ' + delErr.message }, { status: 500 })

  if (insertRows.length === 0) return NextResponse.json({ total: 0 })

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
