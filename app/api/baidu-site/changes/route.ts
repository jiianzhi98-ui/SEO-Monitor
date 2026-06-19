import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function getMalaysiaDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

type IndexRow = { title: string; period: string }
type ChangeRow = {
  site_id: string
  title: string
  change_date: string
  change_type: 'appeared' | 'dropped'
  period: 'day' | 'week' | 'month'
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId') || ''
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const today = getMalaysiaDate()
  const yesterday = getMalaysiaDate(-1)
  const since = getMalaysiaDate(-30)
  const cutoff3d = getMalaysiaDate(-3)
  const supabase = getSupabase()

  // Load today and yesterday data
  const [{ data: todayData }, { data: yesterdayData }] = await Promise.all([
    supabase.from('baidu_index').select('title, period').eq('site_id', siteId).eq('stat_date', today),
    supabase.from('baidu_index').select('title, period').eq('site_id', siteId).eq('stat_date', yesterday),
  ])

  const todayRows = (todayData || []) as IndexRow[]
  const yesterdayRows = (yesterdayData || []) as IndexRow[]

  // Only generate changes if we have today's data
  if (todayRows.length > 0) {
    const todayMap = new Map(todayRows.map((r) => [r.title, r.period as 'day' | 'week' | 'month']))
    const yesterdayMap = new Map(yesterdayRows.map((r) => [r.title, r.period as 'day' | 'week' | 'month']))

    const changeRows: ChangeRow[] = []

    // Appeared: in today but not yesterday
    Array.from(todayMap.entries()).forEach(([title, period]) => {
      if (!yesterdayMap.has(title)) {
        changeRows.push({ site_id: siteId, title, change_date: today, change_type: 'appeared', period })
      }
    })

    // Dropped: in yesterday but not today
    Array.from(yesterdayMap.entries()).forEach(([title, period]) => {
      if (!todayMap.has(title)) {
        changeRows.push({ site_id: siteId, title, change_date: today, change_type: 'dropped', period })
      }
    })

    // Upsert changes
    if (changeRows.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('baidu_index_changes') as any).upsert(changeRows, {
        onConflict: 'site_id,change_date,title,change_type',
        ignoreDuplicates: true,
      })
    }

    // Clean up old raw data (keep 3 days)
    await supabase.from('baidu_index').delete().eq('site_id', siteId).lt('stat_date', cutoff3d)

    // Clean up old change records (keep 30 days)
    await supabase.from('baidu_index_changes').delete().eq('site_id', siteId).lt('change_date', since)
  }

  // Return recent change history
  const { data: recentChanges } = await supabase
    .from('baidu_index_changes')
    .select('*')
    .eq('site_id', siteId)
    .gte('change_date', since)
    .order('change_date', { ascending: false })

  return NextResponse.json({ changes: recentChanges || [] })
}
