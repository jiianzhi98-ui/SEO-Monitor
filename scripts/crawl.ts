import { createClient } from '@supabase/supabase-js'
import {
  fetchHtmlListPages,
  cleanTitle,
  fetchAizhanData,
  fetchRankChanges,
  type HtmlSource,
} from '../lib/crawler'

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const dayOfWeek = new Date(todayMY).getDay()
  if (frequency === 'daily') return true
  if (frequency === 'every3days') {
    const diffDays = Math.floor((new Date(todayMY).getTime() - new Date(createdAt).getTime()) / 86400000)
    return diffDays % 3 === 0
  }
  if (frequency === 'weekly') return dayOfWeek === 1
  return false
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// Supabase 写入失败时自动重试（网络抖动/短暂限流）
async function withRetry<T>(fn: () => Promise<T>, retries = 3, waitMs = 5000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === retries - 1) throw e
      console.warn(`    [retry ${i + 1}/${retries}] ${e instanceof Error ? e.message : e}`)
      await delay(waitMs)
    }
  }
  throw new Error('unreachable')
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SiteRecord {
  id: string
  domain: string
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  list_url: string | null
  title_selector: string | null
  date_selector: string | null
  source_types: string | null
  enable_version_clean: boolean
  version_suffixes: string[]
  created_at: string
}

// ── Steps ─────────────────────────────────────────────────────────────────────

async function runKeywords(sites: SiteRecord[], today: string, yesterday: string) {
  console.log(`\n═══ KEYWORDS (yesterday=${yesterday}) ═══`)
  for (const site of sites) {
    if (!shouldCrawlToday(site.crawl_frequency, site.created_at)) {
      console.log(`  [skip] ${site.domain} (频率=${site.crawl_frequency})`)
      continue
    }
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
        const urlBlocks = isNew ? listUrl.split(SRC_SEP) : listUrl.split('\n').map((u) => u.trim()).filter(Boolean)
        const titleSels = (site.title_selector || '').split(isNew ? SRC_SEP : '\n').map((s) => s.trim())
        const dateSels = (site.date_selector || '').split(isNew ? SRC_SEP : '\n').map((s) => s.trim())
        const sourceTypesList = (site.source_types || '').split(isNew ? SRC_SEP : '\n').map((s) => s.trim())

        for (let i = 0; i < urlBlocks.length; i++) {
          const srcType = sourceTypesList[i] === 'game' ? 'game' : 'app'
          const srcUrls = isNew
            ? urlBlocks[i].split('\n').map((u) => u.trim()).filter(Boolean)
            : [urlBlocks[i]]
          for (const u of srcUrls) {
            const src: HtmlSource = {
              url: u,
              titleSelector: titleSels[i] || titleSels[0] || '',
              dateSelector: dateSels[i] || dateSels[0] || '',
            }
            const entries = await fetchHtmlListPages([src], htmlCutoff, maxPg)
            for (const e of entries) {
              rawEntries.push({ title: e.title, content_date: parseContentDate(e.date), content_type: srcType })
            }
          }
        }
      }

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
        const batchDates = Array.from(new Set(cleanedEntries.map((e) => e.content_date).filter((d): d is string => !!d)))
        const hasNullDate = cleanedEntries.some((e) => !e.content_date)
        const existingKeys = new Set<string>()

        for (const cd of batchDates) {
          const { data: existing } = await supabase
            .from('raw_keywords').select('keyword').eq('site_id', site.id).eq('content_date', cd).limit(10000)
          for (const row of (existing || []) as { keyword: string }[]) existingKeys.add(`${cd}|${row.keyword}`)
        }

        if (hasNullDate) {
          const todayMYTStart = new Date(new Date(today + 'T16:00:00.000Z').getTime() - 86400000).toISOString()
          const { data: existingNull } = await supabase
            .from('raw_keywords').select('keyword').eq('site_id', site.id).gte('discovered_at', todayMYTStart).is('content_date', null)
          for (const row of (existingNull || []) as { keyword: string }[]) existingKeys.add(`null|${row.keyword}`)
        }

        const newEntries = cleanedEntries.filter((e) => {
          const key = e.content_date ? `${e.content_date}|${e.keyword}` : `null|${e.keyword}`
          return !existingKeys.has(key)
        })
        newCount = newEntries.length

        if (newEntries.length > 0) {
          await withRetry(() =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase.from('raw_keywords') as any).insert(
              newEntries.map((e) => ({
                keyword: e.keyword,
                site_id: site.id,
                discovered_at: new Date().toISOString(),
                content_date: e.content_date || yesterday,
                content_type: e.content_type || 'app',
              }))
            )
          )
        }
      }

      if (hasCrawlConfig) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('daily_stats') as any).upsert(
          { site_id: site.id, stat_date: yesterday, new_count: newCount },
          { onConflict: 'site_id,stat_date' }
        )
        const [appRes, gameRes] = await Promise.all([
          supabase.from('raw_keywords').select('id', { count: 'exact', head: true })
            .eq('site_id', site.id).eq('content_type', 'app').eq('content_date', yesterday).not('keyword', 'like', '%电脑版%'),
          supabase.from('raw_keywords').select('id', { count: 'exact', head: true })
            .eq('site_id', site.id).eq('content_type', 'game').eq('content_date', yesterday).not('keyword', 'like', '%电脑版%'),
        ])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('competitor_kw_stats') as any).upsert(
          { site_id: site.id, stat_date: yesterday, app_count: appRes.count ?? 0, game_count: gameRes.count ?? 0, updated_at: new Date().toISOString() },
          { onConflict: 'site_id,stat_date' }
        )
      }

      console.log(`  [ok] ${site.domain} +${newCount}`)
    } catch (e) {
      console.error(`  [err] ${site.domain}`, e instanceof Error ? e.message : e)
    }
    await delay(3000) // 站点间间隔，避免外部站点和 Supabase 限流
  }

  // 清理旧数据
  await supabase.rpc('delete_old_raw_keywords').maybeSingle()
  await supabase.from('rank_changes').delete().lt('stat_date', getMalaysiaDate(-30))
  await supabase.from('daily_stats').delete().lt('stat_date', getMalaysiaDate(-30))
  await supabase.from('competitor_kw_stats').delete().lt('stat_date', getMalaysiaDate(-10))
  console.log('  [ok] 旧数据清理完成')
}

async function runRank(sites: SiteRecord[], today: string) {
  console.log(`\n═══ RANK (date=${today}) ═══`)
  for (const site of sites) {
    try {
      let rankupEntries = await fetchRankChanges(site.domain, today, 'rankup')
      await delay(2000)
      let rankdownEntries = await fetchRankChanges(site.domain, today, 'rankdown')
      await delay(2000)

      if (rankupEntries.length === 0) {
        await delay(5000)
        rankupEntries = await fetchRankChanges(site.domain, today, 'rankup')
        await delay(2000)
      }
      if (rankdownEntries.length === 0) {
        await delay(5000)
        rankdownEntries = await fetchRankChanges(site.domain, today, 'rankdown')
        await delay(2000)
      }

      const rankRows = [
        ...rankupEntries.map((e) => ({ site_id: site.id, stat_date: today, type: 'rankup', keyword: e.keyword, volume: e.volume })),
        ...rankdownEntries.map((e) => ({ site_id: site.id, stat_date: today, type: 'rankdown', keyword: e.keyword, volume: e.volume })),
      ]
      if (rankRows.length > 0) {
        await withRetry(async () => {
          await supabase.from('rank_changes').delete().eq('site_id', site.id).eq('stat_date', today)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('rank_changes') as any).insert(rankRows)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('sites') as any).update({ has_rank_data: true }).eq('id', site.id)
        })
      }

      const kwWithVol = rankupEntries.filter((e) => e.volume > 0).map((e) => ({ keyword: e.keyword, volume: e.volume, stat_date: today }))
      const kwNoVol = rankupEntries.filter((e) => e.volume <= 0).map((e) => ({ keyword: e.keyword, volume: 0, stat_date: today }))
      if (kwWithVol.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('keyword_volume') as any).upsert(kwWithVol, { onConflict: 'keyword' })
      }
      if (kwNoVol.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('keyword_volume') as any).upsert(kwNoVol, { onConflict: 'keyword', ignoreDuplicates: true })
      }

      console.log(`  [ok] ${site.domain}  涨入=${rankupEntries.length} 跌出=${rankdownEntries.length}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  [err] ${site.domain}`, msg)
    }
    await delay(10000) // 站点间间隔 10s
  }
}

async function runWeight(sites: SiteRecord[], today: string) {
  console.log(`\n═══ WEIGHT (date=${today}) ═══`)
  for (const site of sites) {
    let fetched = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await delay(30000)
        const { pc, mobile, indexCount, pcIpMin, pcIpMax, mobileIpMin, mobileIpMax } = await fetchAizhanData(site.domain)
        await Promise.all([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from('weight_history') as any).upsert(
            { site_id: site.id, record_date: today, pc_weight: pc, mobile_weight: mobile, pc_ip: pcIpMin, pc_ip_max: pcIpMax, mobile_ip: mobileIpMin, mobile_ip_max: mobileIpMax },
            { onConflict: 'site_id,record_date' }
          ),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase.from('index_snapshots') as any).upsert(
            { site_id: site.id, snapshot_date: today, index_count: indexCount },
            { onConflict: 'site_id,snapshot_date' }
          ),
        ])
        console.log(`  [ok] ${site.domain}  pc=${pc} mobile=${mobile} index=${indexCount}`)
        fetched = true
        break
      } catch {
        console.warn(`  [retry ${attempt + 1}/3] ${site.domain}`)
      }
    }
    if (!fetched) console.error(`  [err] ${site.domain} 权重抓取失败（3次重试）`)
    await delay(3000)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const step = args.find((a) => a.startsWith('--step='))?.split('=')[1] ?? 'all'
  const siteFilter = args.find((a) => a.startsWith('--site='))?.split('=')[1] ?? null

  console.log(`\n▶ crawl.ts  step=${step}  site=${siteFilter ?? 'all'}`)
  console.log(`  Supabase: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)

  const today = getMalaysiaDate()
  const yesterday = getMalaysiaDate(-1)

  let query = supabase.from('sites').select('*').eq('is_enabled', true)
  if (siteFilter) query = query.eq('domain', siteFilter)
  const { data: sitesRaw, error } = await query
  if (error) throw error

  const sites = shuffle((sitesRaw || []) as SiteRecord[])
  console.log(`  共 ${sites.length} 个站点`)

  if (step === 'keywords' || step === 'all') await runKeywords(sites, today, yesterday)
  if (step === 'weight'   || step === 'all') await runWeight(sites, today)
  if (step === 'rank'     || step === 'all') await runRank(sites, today)

  console.log('\n✓ 完成')
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
