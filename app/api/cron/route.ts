import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import {
  fetchSitemap,
  fetchHtmlList,
  fetchRss,
  cleanTitle,
  fetchBaiduSuggestion,
} from '@/lib/crawler'

interface SiteRecord {
  id: string
  domain: string
  crawl_type: 'sitemap' | 'html' | 'rss'
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  list_url: string | null
  title_selector: string | null
  date_selector: string | null
  enable_version_clean: boolean
  version_suffixes: string[]
  created_at: string
}

function shouldCrawlToday(frequency: string, createdAt: string): boolean {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun

  if (frequency === 'daily') return true
  if (frequency === 'every3days') {
    const created = new Date(createdAt)
    const diffDays = Math.floor((today.getTime() - created.getTime()) / 86400000)
    return diffDays % 3 === 0
  }
  if (frequency === 'weekly') return dayOfWeek === 1 // Monday
  return false
}

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const results: { site: string; count: number; error?: string }[] = []

  const { searchParams } = new URL(request.url)
  const siteFilter = searchParams.get('site')

  try {
    // 1. Fetch enabled sites (optionally filtered by domain)
    let query = supabase.from('sites').select('*').eq('is_enabled', true)
    if (siteFilter) query = query.eq('domain', siteFilter)
    const { data: sitesRaw, error: sitesErr } = await query
    if (sitesErr) throw sitesErr
    const sites = (sitesRaw || []) as SiteRecord[]

    for (const site of sites) {
      if (!shouldCrawlToday(site.crawl_frequency, site.created_at)) continue

      try {
        // 2. Fetch raw entries based on crawl type
        let rawTitles: string[] = []

        if (site.crawl_type === 'sitemap' && site.list_url) {
          const entries = await fetchSitemap(site.list_url)
          rawTitles = entries.map((e) => {
            const parts = e.url.split('/').filter(Boolean)
            const slug = parts[parts.length - 1] || e.url
            return decodeURIComponent(slug.replace(/[-_]/g, ' ').replace(/\.\w+$/, ''))
          })
        } else if (site.crawl_type === 'html' && site.list_url && site.title_selector) {
          const entries = await fetchHtmlList(site.list_url, site.title_selector, site.date_selector || '')
          rawTitles = entries.map((e) => e.title)
        } else if (site.crawl_type === 'rss' && site.list_url) {
          const entries = await fetchRss(site.list_url)
          rawTitles = entries.map((e) => e.title)
        }

        // 3. Clean titles
        const cleaned = rawTitles.map((t) =>
          cleanTitle(t, site.enable_version_clean, site.version_suffixes || [])
        )

        // 4. Filter out empty titles
        const validKeywords = cleaned.filter((k) => k.length > 0)

        if (validKeywords.length === 0) {
          results.push({ site: site.domain, count: 0 })
          continue
        }

        // 5. Check which keywords are new (not in raw_keywords in last 7 days)
        const { data: existing } = await supabase
          .from('raw_keywords')
          .select('keyword')
          .eq('site_id', site.id)
          .gte('discovered_at', new Date(Date.now() - 7 * 86400000).toISOString())

        const existingSet = new Set((existing || []).map((e) => (e as { keyword: string }).keyword))
        const newKeywords = validKeywords.filter((k) => !existingSet.has(k))

        if (newKeywords.length === 0) {
          results.push({ site: site.domain, count: 0 })
          continue
        }

        // 6. Insert new raw_keywords
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('raw_keywords') as any).insert(
          newKeywords.map((keyword) => ({
            keyword,
            site_id: site.id,
            discovered_at: new Date().toISOString(),
          }))
        )

        // 7. Upsert daily_stats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('daily_stats') as any).upsert(
          { site_id: site.id, stat_date: today, new_count: newKeywords.length },
          { onConflict: 'site_id,stat_date' }
        )

        results.push({ site: site.domain, count: newKeywords.length })
      } catch (siteErr: unknown) {
        results.push({
          site: site.domain,
          count: 0,
          error: siteErr instanceof Error ? siteErr.message : '抓取失败',
        })
      }
    }

    // 8. Aggregate hot_keywords from today's raw_keywords across all sites
    await aggregateHotKeywords(supabase, today)

    // 9. Clean up old data
    await supabase.rpc('delete_old_raw_keywords').maybeSingle()
    await supabase.rpc('delete_old_hot_keywords').maybeSingle()

    return NextResponse.json({ date: today, results })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '定时任务失败' },
      { status: 500 }
    )
  }
}

async function aggregateHotKeywords(
  supabase: ReturnType<typeof createServiceClient>,
  today: string
) {
  // Fetch all today's keywords with site info
  const { data: todayKws } = await supabase
    .from('raw_keywords')
    .select('keyword, site_id, sites(domain)')
    .gte('discovered_at', today + 'T00:00:00')

  if (!todayKws || todayKws.length === 0) return

  type KwRow = { keyword: string; site_id: string; sites: { domain: string } | null }
  const rows = todayKws as unknown as KwRow[]

  // Group by keyword
  const kwMap = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!kwMap.has(row.keyword)) kwMap.set(row.keyword, new Set())
    if (row.sites?.domain) kwMap.get(row.keyword)!.add(row.sites.domain)
  }

  // Only keep keywords appearing on 2+ sites
  const hotEntries = Array.from(kwMap.entries())
    .filter(([, sites]) => sites.size >= 2)
    .sort(([, a], [, b]) => b.size - a.size)
    .slice(0, 200)

  for (const [keyword, siteSet] of hotEntries) {
    const siteList = Array.from(siteSet)
    const siteCount = siteList.length

    // Fetch Baidu suggestions (rate-limit: one per keyword)
    let suggestions: string[] = []
    try {
      suggestions = await fetchBaiduSuggestion(keyword)
      await new Promise((r) => setTimeout(r, 300)) // polite delay
    } catch {
      // ignore suggestion errors
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
