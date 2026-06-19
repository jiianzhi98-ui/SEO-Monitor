import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function getMalaysiaDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId') || ''
  const period = (searchParams.get('period') || 'month') as 'month' | 'week' | 'day'

  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const today = getMalaysiaDate()
  const supabase = getSupabase()

  // Determine which stored periods to include in the response
  const periods = period === 'month' ? ['month'] : period === 'week' ? ['month', 'week'] : ['month', 'week', 'day']

  const { data } = await supabase
    .from('baidu_index')
    .select('title, period')
    .eq('site_id', siteId)
    .eq('stat_date', today)
    .in('period', periods)

  const rows = (data || []) as { title: string; period: string }[]

  if (rows.length === 0) {
    return NextResponse.json({ items: [], total: 0, notCrawled: true })
  }

  // exclusive = true means this title is unique to the requested period (highlighted green)
  const items = rows.map((r) => ({
    title: r.title,
    exclusive: period !== 'month' && r.period === period,
  }))

  // Non-exclusive first, exclusive (green) at bottom
  items.sort((a, b) => Number(a.exclusive) - Number(b.exclusive))

  return NextResponse.json({ items, total: items.length, notCrawled: false })
}
