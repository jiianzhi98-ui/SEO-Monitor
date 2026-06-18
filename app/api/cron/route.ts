import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import {
  fetchHtmlListPages,
  cleanTitle,
  fetchBaiduSuggestion,
  fetchAizhanData,
  fetchRankChanges,
  type HtmlSource,
} from '@/lib/crawler'

interface SiteRecord {
  id: string
  domain: string
  crawl_type: 'html'
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  list_url: string | null
  title_selector: string | null
  date_selector: string | null
  enable_version_clean: boolean
  version_suffixes: string[]
  created_at: string
}

// Malaysia time helpers (UTC+8)
function getMalaysiaDate(offsetDays = 0): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function parseContentDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  const m = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  try {
    const d = new Date(dateStr)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch { /* ignore */ }
  return null
}

function shouldCrawlToday(frequency: string, createdAt: string): boolean {
  const todayMY = getMalaysiaDate()
  const dayOfWeek = new Date(todayMY).getDay() // 0=Sun

  if (frequency === 'daily') return true
  if (frequency === 'every3days') {
    const created = new Date(createdAt)
    const today = new Date(todayMY)
    const diffDays = Math.floor((today.getTime() - created.getTime()) / 86400000)
    return diffDays % 3 === 0
  }
  if (frequency === 'weekly') return dayOfWeek === 1 // Monday
  return false
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  // All dates use Malaysia time (UTC+8)
  const today = getMalaysiaDate()       // today's snapshot date (for weight/index)
  const yesterday = getMalaysiaDate(-1) // yesterday's content date (for new keywords)
  const crawlStartedAt = new Date().toISOString() // UTC timestamp for dedup

  const results: { site: string; count: number; error?: string }[] = []

  const { searchParams } = new URL(request.url)
  const siteFilter = searchParams.get('site')

  try {
    let query = supabase.from('sites').select('*').eq('is_enabled', true)
    if (siteFilter) query = query.eq('domain', siteFilter)
    const { data: sitesRaw, error: sitesErr } = await query
    if (sitesErr) throw sitesErr
    const sites = (sitesRaw || []) as SiteRecord[]

    for (const site of sites) {
      if (!shouldCrawlToday(site.crawl_frequency, site.created_at)) continue

      try {
        type RawEntry = { title: string; content_date: string | null }
        let rawEntries: RawEntry[] = []

        if (site.list_url && site.title_selector) {
          const cutoffDays = site.crawl_frequency === 'weekly' ? 7 : site.crawl_frequency === 'every3days' ? 3 : 1
          const htmlCutoff = getMalaysiaDate(-cutoffDays)
          const maxPg = site.crawl_frequency === 'weekly' ? 10 : site.crawl_frequency === 'every3days' ? 5 : 3
          const urls = site.list_url.split('\n').map((u: string) => u.trim()).filter(Boolean)
          const titleSels = (site.title_selector || '').split('\n').map((s: string) => s.trim())
          const dateSels = (site.date_selector || '').split('\n').map((s: string) => s.trim())
          const sources: HtmlSource[] = urls.map((url: string, i: number) => ({
            url,
            titleSelector: titleSels[i] || titleSels[0] || '',
            dateSelector: dateSels[i] || dateSels[0] || '',
          }))
          const entries = await fetchHtmlListPages(sources, htmlCutoff, maxPg)
          rawEntries = entries.map((e) => ({
            title: e.title,
            content_date: parseContentDate(e.date),
          }))
        }

        const cleanedEntries = rawEntries
          .map((e) => ({
            keyword: cleanTitle(e.title, site.enable_version_clean, site.version_suffixes || []),
            content_date: e.content_date,
          }))
          .filter((e) => e.keyword.length > 0)

        if (cleanedEntries.length === 0) {
          results.push({ site: site.domain, count: 0 })
          continue
        }

        // Dedup against keywords found in this crawl run
        const { data: existing } = await supabase
          .from('raw_keywords')
          .select('keyword')
          .eq('site_id', site.id)
          .gte('discovered_at', new Date(Date.now() - 7 * 86400000).toISOString())

        const existingSet = new Set((existing || []).map((e) => (e as { keyword: string }).keyword))
        const newEntries = cleanedEntries.filter((e) => !existingSet.has(e.keyword))

        if (newEntries.length === 0) {
          results.push({ site: site.domain, count: 0 })
          continue
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('raw_keywords') as any).insert(
          newEntries.map((e) => ({
            keyword: e.keyword,
            site_id: site.id,
            discovered_at: new Date().toISOString(),
            content_date: e.content_date,
          }))
        )

        // stat_date = yesterday (we're recording yesterday's new content)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('daily_stats') as any).upsert(
          { site_id: site.id, stat_date: yesterday, new_count: newEntries.length },
          { onConflict: 'site_id,stat_date' }
        )

        results.push({ site: site.domain, count: newEntries.length })

        // Fetch rank changes (涨入 + 跌出) for yesterday, save to rank_changes
        try {
          const [rankupEntries, rankdownEntries] = await Promise.all([
            fetchRankChanges(site.domain, yesterday, 'rankup'),
            fetchRankChanges(site.domain, yesterday, 'rankdown'),
          ])
          const rankRows = [
            ...rankupEntries.map((e) => ({ site_id: site.id, stat_date: yesterday, type: 'rankup', keyword: e.keyword, volume: e.volume })),
            ...rankdownEntries.map((e) => ({ site_id: site.id, stat_date: yesterday, type: 'rankdown', keyword: e.keyword, volume: e.volume })),
          ]
          if (rankRows.length > 0) {
            await supabase.from('rank_changes').delete().eq('site_id', site.id).eq('stat_date', yesterday)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('rank_changes') as any).insert(rankRows)
          }
        } catch {
          // rank fetch failure does not affect keyword results
        }
      } catch (siteErr: unknown) {
        results.push({
          site: site.domain,
          count: 0,
          error: siteErr instanceof Error ? siteErr.message : '抓取失败',
        })
      }
    }

    // Aggregate hot keywords from this run
    await aggregateHotKeywords(supabase, crawlStartedAt)

    // Fetch weight + index snapshot from aizhan (today's reading)
    for (const site of sites) {
      try {
        const { pc, mobile, indexCount, pcIpMin, pcIpMax, mobileIpMin, mobileIpMax } = await fetchAizhanData(site.domain)
        await Promise.all([
          (supabase.from('weight_history') as any).upsert(
            { site_id: site.id, record_date: today, pc_weight: pc, mobile_weight: mobile, pc_ip: pcIpMin, pc_ip_max: pcIpMax, mobile_ip: mobileIpMin, mobile_ip_max: mobileIpMax },
            { onConflict: 'site_id,record_date' }
          ),
          (supabase.from('index_snapshots') as any).upsert(
            { site_id: site.id, snapshot_date: today, index_count: indexCount },
            { onConflict: 'site_id,snapshot_date' }
          ),
        ])
        await new Promise((r) => setTimeout(r, 3000))
      } catch {
        // ignore per-site errors
      }
    }

    await supabase.rpc('delete_old_raw_keywords').maybeSingle()
    await supabase.rpc('delete_old_hot_keywords').maybeSingle()
    await supabase.from('rank_changes').delete().lt('stat_date', getMalaysiaDate(-30))

    return NextResponse.json({ date: today, yesterday, results })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '定时任务失败' },
      { status: 500 }
    )
  }
}

async function aggregateHotKeywords(
  supabase: ReturnType<typeof createServiceClient>,
  since: string
) {
  const { data: todayKws } = await supabase
    .from('raw_keywords')
    .select('keyword, site_id, sites(domain)')
    .gte('discovered_at', since)

  if (!todayKws || todayKws.length === 0) return

  type KwRow = { keyword: string; site_id: string; sites: { domain: string } | null }
  const rows = todayKws as unknown as KwRow[]

  const kwMap = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!kwMap.has(row.keyword)) kwMap.set(row.keyword, new Set())
    if (row.sites?.domain) kwMap.get(row.keyword)!.add(row.sites.domain)
  }

  const hotEntries = Array.from(kwMap.entries())
    .filter(([, sites]) => sites.size >= 2)
    .sort(([, a], [, b]) => b.size - a.size)
    .slice(0, 200)

  const today = getMalaysiaDate()

  for (const [keyword, siteSet] of hotEntries) {
    const siteList = Array.from(siteSet)
    const siteCount = siteList.length

    let suggestions: string[] = []
    try {
      suggestions = await fetchBaiduSuggestion(keyword)
      await new Promise((r) => setTimeout(r, 300))
    } catch {
      // ignore
    }

    const priority: 'urgent' | 'today' | 'queue' =
      siteCount >= 5 ? 'urgent' : siteCount >= 3 ? 'today' : 'queue'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('hot_keywords') as any).upsert(
      {
        keyword,
        site_count: siteCount,
        site_list: siteList,
        suggestions,
        suggestion_count: suggestions.length,
        priority,
        period_start: today,
        period_end: today,
      },
      { onConflict: 'keyword,period_start' }
    )
  }
}
