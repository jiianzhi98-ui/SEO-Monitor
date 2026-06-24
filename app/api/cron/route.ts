export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import {
  fetchHtmlListPages,
  cleanTitle,
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
  source_types: string | null
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

  const results: { site: string; count: number; error?: string }[] = []

  const { searchParams } = new URL(request.url)
  const siteFilter = searchParams.get('site')
  const step = searchParams.get('step') // 'keywords' | 'rank' | 'weight' | null (all)
  const runKeywords = !step || step === 'keywords'
  const runRank     = !step || step === 'rank'
  const runWeight   = !step || step === 'weight'

  try {
    let query = supabase.from('sites').select('*').eq('is_enabled', true)
    if (siteFilter) query = query.eq('domain', siteFilter)
    const { data: sitesRaw, error: sitesErr } = await query
    if (sitesErr) throw sitesErr
    const sites = (sitesRaw || []) as SiteRecord[]

    if (runKeywords) for (const site of sites) {
      if (!shouldCrawlToday(site.crawl_frequency, site.created_at)) continue

      try {
        type RawEntry = { title: string; content_date: string | null; content_type?: string }
        let rawEntries: RawEntry[] = []
        const hasCrawlConfig = !!(site.list_url && site.title_selector)

        if (hasCrawlConfig) {
          const cutoffDays = site.crawl_frequency === 'weekly' ? 7 : site.crawl_frequency === 'every3days' ? 3 : 1
          const htmlCutoff = getMalaysiaDate(-cutoffDays)
          const maxPg = site.crawl_frequency === 'weekly' ? 10 : site.crawl_frequency === 'every3days' ? 5 : 3
          const SRC_SEP = '|||'
          const listUrl = site.list_url!
          const isNew = listUrl.includes(SRC_SEP)
          const urlBlocks = isNew ? listUrl.split(SRC_SEP) : listUrl.split('\n').map((u: string) => u.trim()).filter(Boolean)
          const titleSels = (site.title_selector || '').split(isNew ? SRC_SEP : '\n').map((s: string) => s.trim())
          const dateSels = (site.date_selector || '').split(isNew ? SRC_SEP : '\n').map((s: string) => s.trim())
          const sourceTypesList = (site.source_types || '').split(isNew ? SRC_SEP : '\n').map((s: string) => s.trim())
          // Process each source separately to track content_type
          for (let i = 0; i < urlBlocks.length; i++) {
            const srcType = sourceTypesList[i] === 'game' ? 'game' : 'app'
            const srcUrls = isNew
              ? urlBlocks[i].split('\n').map((u: string) => u.trim()).filter(Boolean)
              : [urlBlocks[i]]
            for (let urlIdx = 0; urlIdx < srcUrls.length; urlIdx++) {
              const src: HtmlSource = {
                url: srcUrls[urlIdx],
                titleSelector: titleSels[i] || titleSels[0] || '',
                dateSelector: dateSels[i] || dateSels[0] || '',
              }
              const srcEntries = await fetchHtmlListPages([src], htmlCutoff, maxPg)
              for (const e of srcEntries) {
                rawEntries.push({ title: e.title, content_date: parseContentDate(e.date), content_type: srcType })
              }
            }
          }
        }

        // Dedup within this crawl batch by keyword (first source wins, preserves content_type)
        const seenInBatch = new Set<string>()
        const cleanedEntries = rawEntries
          .map((e) => ({
            keyword: cleanTitle(e.title, site.enable_version_clean, site.version_suffixes || []),
            content_date: e.content_date,
            content_type: e.content_type || 'app',
          }))
          .filter((e) => {
            if (e.keyword.length === 0 || seenInBatch.has(e.keyword)) return false
            seenInBatch.add(e.keyword)
            return true
          })

        let newCount = 0

        if (cleanedEntries.length > 0) {
          // Dedup by (keyword, content_date): same keyword on the same website date must not be re-inserted
          const batchDates = Array.from(new Set(cleanedEntries.map(e => e.content_date).filter((d): d is string => !!d)))
          const hasNullDate = cleanedEntries.some(e => !e.content_date)
          const existingKeys = new Set<string>()

          for (const cd of batchDates) {
            const { data: existing } = await supabase
              .from('raw_keywords')
              .select('keyword')
              .eq('site_id', site.id)
              .eq('content_date', cd)
              .limit(10000)
            for (const row of (existing || []) as { keyword: string }[]) {
              existingKeys.add(`${cd}|${row.keyword}`)
            }
          }

          if (hasNullDate) {
            // For undated entries, fall back to same-MYT-day dedup
            const todayMYTStart = new Date(new Date(today + 'T16:00:00.000Z').getTime() - 86400000).toISOString()
            const { data: existingNull } = await supabase
              .from('raw_keywords')
              .select('keyword')
              .eq('site_id', site.id)
              .gte('discovered_at', todayMYTStart)
              .is('content_date', null)
            for (const row of (existingNull || []) as { keyword: string }[]) {
              existingKeys.add(`null|${row.keyword}`)
            }
          }

          const newEntries = cleanedEntries.filter(e => {
            const key = e.content_date ? `${e.content_date}|${e.keyword}` : `null|${e.keyword}`
            return !existingKeys.has(key)
          })
          newCount = newEntries.length

          if (newEntries.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('raw_keywords') as any).insert(
              newEntries.map((e) => ({
                keyword: e.keyword,
                site_id: site.id,
                discovered_at: new Date().toISOString(),
                content_date: e.content_date || yesterday,
                content_type: e.content_type || 'app',
              }))
            )
          }
        }

        // Always write daily_stats for sites with crawl config (even if 0 new)
        if (hasCrawlConfig) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('daily_stats') as any).upsert(
            { site_id: site.id, stat_date: yesterday, new_count: newCount },
            { onConflict: 'site_id,stat_date' }
          )
          // Write per-type counts to competitor_kw_stats, keyed by content_date (website's own date)
          const [appRes, gameRes] = await Promise.all([
            supabase.from('raw_keywords')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', site.id).eq('content_type', 'app')
              .eq('content_date', yesterday)
              .not('keyword', 'like', '%电脑版%'),
            supabase.from('raw_keywords')
              .select('id', { count: 'exact', head: true })
              .eq('site_id', site.id).eq('content_type', 'game')
              .eq('content_date', yesterday)
              .not('keyword', 'like', '%电脑版%'),
          ])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('competitor_kw_stats') as any).upsert(
            { site_id: site.id, stat_date: yesterday, app_count: appRes.count ?? 0, game_count: gameRes.count ?? 0, updated_at: new Date().toISOString() },
            { onConflict: 'site_id,stat_date' }
          )
        }

        results.push({ site: site.domain, count: newCount })
      } catch (siteErr: unknown) {
        results.push({
          site: site.domain,
          count: 0,
          error: siteErr instanceof Error ? siteErr.message : '抓取失败',
        })
      }
    }

    // Fetch rank changes for each site (always daily, independent of crawl_frequency)
    if (runRank) for (const site of sites) {
      try {
        const rankDate = today
        let rankupEntries = await fetchRankChanges(site.domain, rankDate, 'rankup')
        await new Promise((r) => setTimeout(r, 2000))
        let rankdownEntries = await fetchRankChanges(site.domain, rankDate, 'rankdown')
        await new Promise((r) => setTimeout(r, 2000))
        // Retry each type individually if it returned 0 — one may succeed while the other got rate-limited
        if (rankupEntries.length === 0) {
          await new Promise((r) => setTimeout(r, 5000))
          rankupEntries = await fetchRankChanges(site.domain, rankDate, 'rankup')
          await new Promise((r) => setTimeout(r, 2000))
        }
        if (rankdownEntries.length === 0) {
          await new Promise((r) => setTimeout(r, 5000))
          rankdownEntries = await fetchRankChanges(site.domain, rankDate, 'rankdown')
          await new Promise((r) => setTimeout(r, 2000))
        }
        const rankRows = [
          ...rankupEntries.map((e) => ({ site_id: site.id, stat_date: rankDate, type: 'rankup', keyword: e.keyword, volume: e.volume })),
          ...rankdownEntries.map((e) => ({ site_id: site.id, stat_date: rankDate, type: 'rankdown', keyword: e.keyword, volume: e.volume })),
        ]
        if (rankRows.length > 0) {
          await supabase.from('rank_changes').delete().eq('site_id', site.id).eq('stat_date', rankDate)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('rank_changes') as any).insert(rankRows)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('sites') as any).update({ has_rank_data: true }).eq('id', site.id)
        }
        // Upsert rankup keywords to permanent keyword_volume store (one record per keyword)
        const kwWithVol = rankupEntries.filter((e) => e.volume > 0).map((e) => ({ keyword: e.keyword, volume: e.volume, stat_date: rankDate }))
        const kwNoVol = rankupEntries.filter((e) => e.volume <= 0).map((e) => ({ keyword: e.keyword, volume: 0, stat_date: rankDate }))
        if (kwWithVol.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('keyword_volume') as any).upsert(kwWithVol, { onConflict: 'keyword' })
        }
        if (kwNoVol.length > 0) {
          // Insert only — don't overwrite existing volume with 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('keyword_volume') as any).upsert(kwNoVol, { onConflict: 'keyword', ignoreDuplicates: true })
        }
      } catch (rankErr) {
        const msg = rankErr instanceof Error ? rankErr.message : '排名抓取失败'
        results.push({ site: site.domain, count: -1, error: msg })
      }
    }

    // Fetch weight + index snapshot from aizhan (today's reading)
    // Retries up to 2 times on failure (likely rate-limited) with 30s wait each
    if (runWeight) for (const site of sites) {
      let fetched = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 30000))
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
          fetched = true
          break
        } catch {
          // retry on next attempt
        }
      }
      // Always pace between sites — skipping delay on failure causes immediate hammering of the next site
      await new Promise((r) => setTimeout(r, 3000))
      if (!fetched) results.push({ site: site.domain, count: -1, error: '权重抓取失败（3次重试后放弃）' })
    }

    // Cleanup old data (only on keywords step to avoid running 3x per day)
    if (runKeywords) {
      await supabase.rpc('delete_old_raw_keywords').maybeSingle()
      await supabase.from('rank_changes').delete().lt('stat_date', getMalaysiaDate(-30))
      await supabase.from('daily_stats').delete().lt('stat_date', getMalaysiaDate(-30))
      await supabase.from('competitor_kw_stats').delete().lt('stat_date', getMalaysiaDate(-10))
    }

    return NextResponse.json({ date: today, yesterday, results })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '定时任务失败' },
      { status: 500 }
    )
  }
}

