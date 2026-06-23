import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const exportParam = searchParams.get('export')
  const exportAll = exportParam === '1'
  const exportToday = exportParam === 'today'

  const supabase = createServiceClient()

  if (exportToday) {
    // Malaysia UTC+8: today starts at (todayMY 00:00 +08:00) in UTC
    const nowMs = Date.now() + 8 * 60 * 60 * 1000
    const todayMY = new Date(nowMs).toISOString().slice(0, 10)
    const todayStartUTC = new Date(todayMY + 'T00:00:00+08:00').toISOString()

    const { data: rawData, error: rawErr } = await supabase
      .from('raw_keywords')
      .select('keyword')
      .gte('discovered_at', todayStartUTC)
    if (rawErr) return NextResponse.json({ error: rawErr.message }, { status: 500 })

    const keywords = [...new Set((rawData || []).map((r: { keyword: string }) => r.keyword))]
    if (keywords.length === 0) return NextResponse.json({ keywords: [] })

    const { data: volData } = await supabase
      .from('keyword_volume')
      .select('keyword, volume')
      .in('keyword', keywords)

    const volMap = new Map((volData || []).map((r: { keyword: string; volume: number }) => [r.keyword, r.volume]))
    const result = keywords
      .map(kw => ({ keyword: kw, volume: volMap.get(kw) ?? 0 }))
      .sort((a, b) => b.volume - a.volume)

    return NextResponse.json({ keywords: result })
  }

  let query = supabase
    .from('keyword_volume')
    .select('keyword, volume')
    .order('volume', { ascending: false })

  if (q) {
    query = query.ilike('keyword', `%${q}%`)
  }

  if (!exportAll) {
    query = query.limit(50)
  } else {
    query = query.limit(100000)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ keywords: data || [] })
}
