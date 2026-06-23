import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const maxDuration = 30

export async function POST(request: Request) {
  const { site_id, date } = await request.json()
  if (!site_id || !date) return NextResponse.json({ error: 'missing params' }, { status: 400 })

  const supabase = createServiceClient()
  const nextMidnight = new Date(date + 'T16:00:00.000Z').getTime()
  const start = new Date(nextMidnight - 86400000).toISOString()
  const end = new Date(nextMidnight - 1).toISOString()

  const { data: rows } = await supabase
    .from('raw_keywords')
    .select('id, keyword')
    .eq('site_id', site_id)
    .gte('discovered_at', start)
    .lte('discovered_at', end)
    .order('id', { ascending: true })

  if (!rows || rows.length === 0) return NextResponse.json({ deleted: 0 })

  const seen = new Set<string>()
  const toDelete: number[] = []
  for (const row of rows as { id: number; keyword: string }[]) {
    if (seen.has(row.keyword)) {
      toDelete.push(row.id)
    } else {
      seen.set(row.keyword)
    }
  }

  if (toDelete.length > 0) {
    await supabase.from('raw_keywords').delete().in('id', toDelete)
  }

  return NextResponse.json({ deleted: toDelete.length })
}
