import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { fetchBaiduIndexTitles } from '@/lib/crawler'

export const maxDuration = 300

interface SiteRecord { id: string; domain: string; name: string }

function getMalaysiaDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

async function storePeriod(
  supabase: ReturnType<typeof createServiceClient>,
  site: SiteRecord,
  period: 'month' | 'week' | 'day',
  today: string,
  existingTitles: Set<string>
): Promise<string[]> {
  const titles = await fetchBaiduIndexTitles(site.domain, period, site.name)
  if (titles.length === 0) return []

  if (period === 'month') {
    // Replace today's month data entirely
    await supabase.from('baidu_index').delete()
      .eq('site_id', site.id).eq('stat_date', today).eq('period', 'month')
    const rows = titles.map((title) => ({ site_id: site.id, title, stat_date: today, period: 'month' }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('baidu_index') as any).upsert(rows, { onConflict: 'site_id,stat_date,period,title', ignoreDuplicates: true })
  } else {
    // Only store titles not already in broader periods
    const exclusive = titles.filter((t) => !existingTitles.has(t))
    if (exclusive.length > 0) {
      const rows = exclusive.map((title) => ({ site_id: site.id, title, stat_date: today, period }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('baidu_index') as any).upsert(rows, { onConflict: 'site_id,stat_date,period,title', ignoreDuplicates: true })
    }
  }

  return titles
}

async function generateChanges(
  supabase: ReturnType<typeof createServiceClient>,
  siteId: string,
  today: string
) {
  const yesterday = getMalaysiaDate(-1)

  const [{ data: todayData }, { data: yesterdayData }] = await Promise.all([
    supabase.from('baidu_index').select('title, period').eq('site_id', siteId).eq('stat_date', today),
    supabase.from('baidu_index').select('title, period').eq('site_id', siteId).eq('stat_date', yesterday),
  ])

  type IndexRow = { title: string; period: string }
  const todayMap = new Map(((todayData || []) as IndexRow[]).map((r) => [r.title, r.period as 'day' | 'week' | 'month']))
  const yesterdayMap = new Map(((yesterdayData || []) as IndexRow[]).map((r) => [r.title, r.period as 'day' | 'week' | 'month']))

  type ChangeRow = { site_id: string; title: string; change_date: string; change_type: 'appeared' | 'dropped'; period: 'day' | 'week' | 'month' }
  const changeRows: ChangeRow[] = []

  Array.from(todayMap.entries()).forEach(([title, period]) => {
    if (!yesterdayMap.has(title)) changeRows.push({ site_id: siteId, title, change_date: today, change_type: 'appeared', period })
  })
  Array.from(yesterdayMap.entries()).forEach(([title, period]) => {
    if (!todayMap.has(title)) changeRows.push({ site_id: siteId, title, change_date: today, change_type: 'dropped', period })
  })

  if (changeRows.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('baidu_index_changes') as any).upsert(changeRows, { onConflict: 'site_id,change_date,title,change_type', ignoreDuplicates: true })
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = getMalaysiaDate()
  const cutoff3d = getMalaysiaDate(-3)
  const cutoff30d = getMalaysiaDate(-30)

  const { data: sitesRaw } = await supabase.from('sites').select('id, domain, name').eq('is_enabled', true)
  const sites = (sitesRaw || []) as SiteRecord[]

  const results: { site: string; month: number; week: number; day: number; error?: string }[] = []

  for (const site of sites) {
    try {
      // Month: fetch all, store all
      const monthTitles = await storePeriod(supabase, site, 'month', today, new Set())
      await new Promise((r) => setTimeout(r, 5000))

      // Week: fetch all, store only titles not in month
      const monthSet = new Set(monthTitles)
      const weekTitles = await storePeriod(supabase, site, 'week', today, monthSet)
      await new Promise((r) => setTimeout(r, 5000))

      // Day: fetch all, store only titles not in month or week
      const weekExclusiveSet = new Set(weekTitles.filter((t) => !monthSet.has(t)))
      const combined = new Set(Array.from(monthSet).concat(Array.from(weekExclusiveSet)))
      const dayTitles = await storePeriod(supabase, site, 'day', today, combined)
      await new Promise((r) => setTimeout(r, 1000))

      // Generate change records vs yesterday
      await generateChanges(supabase, site.id, today)

      results.push({ site: site.domain, month: monthTitles.length, week: weekTitles.length, day: dayTitles.length })
    } catch (err) {
      results.push({ site: site.domain, month: 0, week: 0, day: 0, error: err instanceof Error ? err.message : '失败' })
    }

    await new Promise((r) => setTimeout(r, 8000))
  }

  // Cleanup old data
  await supabase.from('baidu_index').delete().lt('stat_date', cutoff3d)
  await supabase.from('baidu_index_changes').delete().lt('change_date', cutoff30d)

  return NextResponse.json({ date: today, results })
}
