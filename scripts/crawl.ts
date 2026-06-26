import { createClient } from '@supabase/supabase-js'
import {
  fetchHtmlListPages,
  cleanTitle,
  fetchAizhanData,
  fetchRankChanges,
  type HtmlSource,
} from '../lib/crawler'
import { activityStart, activityEnd, siteLog } from '../lib/activity-log'

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

// 当前 MYT 时间字符串 HH:MM:SS
function ts(): string {
  const d = new Date(Date.now() + 8 * 3600000)
  return d.toISOString().slice(11, 19)
}

// 格式化耗时 ms → "Xm Ys"
function elapsed(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

// 把数组切成指定大小的块
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

// supabase-js 出错时不 throw，只在返回值带 error 字段，需要手动检查
function sbCheck<T extends { error: unknown }>(res: T, label: string): T {
  if (res.error) throw new Error(`[Supabase] ${label}: ${JSON.stringify(res.error)}`)
  return res
}

// Supabase 写入失败时自动重试
async function withRetry<T>(fn: () => Promise<T>, retries = 3, waitMs = 5000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === retries - 1) throw e
      console.warn(`    ${ts()} ↺ 重试 ${i + 1}/${retries}: ${e instanceof Error ? e.message : e}`)
      await delay(waitMs)
    }
  }
  throw new Error('unreachable')
}

async function getPublicIp(): Promise<string> {
  try {
    const res = await fetch('https://api.ipify.org?format=text', { signal: AbortSignal.timeout(5000) })
    return (await res.text()).trim()
  } catch { return 'unknown' }
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

async function runKeywords(sites: SiteRecord[], today: string, yesterday: string, isMainGroup = true, activityId: string | null = null) {
  const stepStart = Date.now()
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  KEYWORDS   日期=${yesterday}   ${ts()}`)
  console.log(`${'═'.repeat(60)}`)

  let ok = 0, skipped = 0, failed = 0, empty = 0, totalRows = 0

  for (let idx = 0; idx < sites.length; idx++) {
    const site = sites[idx]
    const prefix = `  [${String(idx + 1).padStart(2)}/${sites.length}] ${site.domain.padEnd(30)}`

    if (!shouldCrawlToday(site.crawl_frequency, site.created_at)) {
      console.log(`${prefix} ⊘ 跳过 (${site.crawl_frequency})`)
      skipped++
      if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'skip', detail: site.crawl_frequency })
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
          const rows = newEntries.map((e) => ({
            keyword: e.keyword,
            site_id: site.id,
            discovered_at: new Date().toISOString(),
            content_date: e.content_date || yesterday,
            content_type: e.content_type || 'app',
          }))
          for (const chunk of chunkArray(rows, 500)) {
            await withRetry(async () =>
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              sbCheck(await (supabase.from('raw_keywords') as any).insert(chunk), 'raw_keywords insert')
            )
          }
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

      const isEmptyFetch = hasCrawlConfig && rawEntries.length === 0
      const warn = isEmptyFetch ? '  ⚠ 抓取为空，请检查URL/选择器' : ''
      console.log(`${prefix} ✓  抓到=${String(rawEntries.length).padStart(4)}  新增=${String(newCount).padStart(4)}${warn}`)
      if (hasCrawlConfig) {
        if (isEmptyFetch) {
          empty++
          if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'empty', detail: '页面抓取返回空，请检查URL/选择器' })
        } else {
          ok++
          totalRows += newCount
          if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'ok', rowsWritten: newCount, detail: `新增${newCount}条` })
        }
      } else {
        ok++
      }
    } catch (e) {
      console.error(`${prefix} ✗  ${e instanceof Error ? e.message : e}`)
      failed++
      if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'fail', detail: e instanceof Error ? e.message : String(e) })
    }
    await delay(5000)
  }

  // 清理旧数据（只由 group 0 执行，避免多个 job 同时清理）
  if (isMainGroup) {
    await supabase.rpc('delete_old_raw_keywords').maybeSingle()
    await supabase.from('rank_changes').delete().lt('stat_date', getMalaysiaDate(-30))
    await supabase.from('daily_stats').delete().lt('stat_date', getMalaysiaDate(-30))
    await supabase.from('competitor_kw_stats').delete().lt('stat_date', getMalaysiaDate(-10))
  }

  const durationMs = Date.now() - stepStart
  console.log(`\n  KEYWORDS 完成  ✓${ok}  ⊘${skipped}  ⚠${empty}  ✗${failed}  耗时=${elapsed(durationMs)}`)
  if (activityId) await activityEnd(supabase, activityId, {
    status: failed > 0 ? 'warn' : empty > 0 ? 'warn' : 'done',
    ok, empty, skip: skipped, fail: failed, rowsWritten: totalRows, durationMs,
    summary: `新增关键词 ${totalRows} 条，${empty} 站为空，${failed} 站失败`,
  })
}

async function runRank(sites: SiteRecord[], today: string, activityId: string | null = null) {
  const stepStart = Date.now()
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  RANK   日期=${today}   ${ts()}`)
  console.log(`${'═'.repeat(60)}`)

  let ok = 0, failed = 0, emptyCount = 0, totalRows = 0, consecutiveEmpty = 0
  const retryQueue: SiteRecord[] = [] // 因限流而为空的站，熔断后补抓

  // 将一个站点的抓取结果写入数据库
  async function saveRankResult(s: SiteRecord, up: { keyword: string; volume: number }[], down: { keyword: string; volume: number }[]) {
    const rows = [
      ...up.map((e) => ({ site_id: s.id, stat_date: today, type: 'rankup', keyword: e.keyword, volume: e.volume })),
      ...down.map((e) => ({ site_id: s.id, stat_date: today, type: 'rankdown', keyword: e.keyword, volume: e.volume })),
    ]
    if (rows.length > 0) {
      await withRetry(async () => {
        await supabase.from('rank_changes').delete().eq('site_id', s.id).eq('stat_date', today)
        for (const chunk of chunkArray(rows, 500)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sbCheck(await (supabase.from('rank_changes') as any).insert(chunk), 'rank_changes insert')
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('sites') as any).update({ has_rank_data: true }).eq('id', s.id)
      })
    }
    const kwWithVol = up.filter((e) => e.volume > 0).map((e) => ({ keyword: e.keyword, volume: e.volume, stat_date: today }))
    const kwNoVol = up.filter((e) => e.volume <= 0).map((e) => ({ keyword: e.keyword, volume: 0, stat_date: today }))
    for (const chunk of chunkArray(kwWithVol, 500)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('keyword_volume') as any).upsert(chunk, { onConflict: 'keyword' })
    }
    for (const chunk of chunkArray(kwNoVol, 500)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('keyword_volume') as any).upsert(chunk, { onConflict: 'keyword', ignoreDuplicates: true })
    }
  }

  for (let idx = 0; idx < sites.length; idx++) {
    const site = sites[idx]
    const prefix = `  [${String(idx + 1).padStart(2)}/${sites.length}] ${site.domain.padEnd(30)}`

    // 熔断：连续 3 站均为空，说明 IP 被限流，暂停 5 分钟，然后补抓队列里的站
    if (consecutiveEmpty >= 3) {
      const toRetry = retryQueue.splice(0)
      console.log(`\n  ⏸ 连续 ${consecutiveEmpty} 站为空，疑似 IP 被限流，暂停 5 分钟后补抓 ${toRetry.length} 个站… (${ts()})`)
      await delay(5 * 60 * 1000)
      consecutiveEmpty = 0
      console.log(`  ▶ 恢复，先补抓 ${toRetry.length} 个空站 (${ts()})`)
      for (const rs of toRetry) {
        const rp = `  [补抓] ${rs.domain.padEnd(30)}`
        try {
          const up = await fetchRankChanges(rs.domain, today, 'rankup')
          await delay(2000)
          const down = await fetchRankChanges(rs.domain, today, 'rankdown')
          await saveRankResult(rs, up, down)
          const stillEmpty = up.length === 0 && down.length === 0
          console.log(`${rp} ✓  涨入=${String(up.length).padStart(4)}  跌出=${String(down.length).padStart(4)}${stillEmpty ? '  ⚠ 仍为空' : '  ✓ 已补数据'}`)
        } catch (e) {
          console.error(`${rp} ✗  ${e instanceof Error ? e.message : e}`)
        }
        await delay(30000)
      }
      console.log(`  ▶ 继续主流程 (${ts()})`)
    }

    try {
      let rankupEntries = await fetchRankChanges(site.domain, today, 'rankup')
      await delay(2000)
      let rankdownEntries = await fetchRankChanges(site.domain, today, 'rankdown')
      await delay(2000)

      if (rankupEntries.length === 0) {
        console.log(`${prefix}   ↺ 涨入为空，重试中…`)
        await delay(5000)
        rankupEntries = await fetchRankChanges(site.domain, today, 'rankup')
        await delay(2000)
      }
      if (rankdownEntries.length === 0) {
        console.log(`${prefix}   ↺ 跌出为空，重试中…`)
        await delay(5000)
        rankdownEntries = await fetchRankChanges(site.domain, today, 'rankdown')
        await delay(2000)
      }

      await saveRankResult(site, rankupEntries, rankdownEntries)

      const bothZero = rankupEntries.length === 0 && rankdownEntries.length === 0
      const written = rankupEntries.length + rankdownEntries.length
      if (bothZero) {
        consecutiveEmpty++
        emptyCount++
        retryQueue.push(site)
        console.log(`${prefix} ✓  涨入=   0  跌出=   0  ⚠ 涨跌均为空 (连续${consecutiveEmpty}站)`)
        if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'empty', detail: '涨入0 | 跌出0（疑似限流）' })
      } else {
        consecutiveEmpty = 0
        retryQueue.length = 0
        totalRows += written
        console.log(`${prefix} ✓  涨入=${String(rankupEntries.length).padStart(4)}  跌出=${String(rankdownEntries.length).padStart(4)}`)
        if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'ok', rowsWritten: written, detail: `涨入${rankupEntries.length} | 跌出${rankdownEntries.length}` })
      }
      ok++
    } catch (e) {
      console.error(`${prefix} ✗  ${e instanceof Error ? e.message : e}`)
      failed++
      consecutiveEmpty++
      retryQueue.push(site)
      if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'fail', detail: e instanceof Error ? e.message : String(e) })
    }
    await delay(45000) // 站点间 45s，避免触发爱站限流
  }

  const durationMs = Date.now() - stepStart
  console.log(`\n  RANK 完成  ✓${ok}  ⚠${emptyCount}  ✗${failed}  耗时=${elapsed(durationMs)}`)
  if (activityId) await activityEnd(supabase, activityId, {
    status: failed > 0 ? 'warn' : emptyCount > 0 ? 'warn' : 'done',
    ok: ok - emptyCount, empty: emptyCount, fail: failed, rowsWritten: totalRows, durationMs,
    summary: `涨跌词 ${totalRows} 条，${emptyCount} 站为空，${failed} 站失败`,
  })
}

async function runWeight(sites: SiteRecord[], today: string, activityId: string | null = null) {
  const stepStart = Date.now()
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  WEIGHT   日期=${today}   ${ts()}`)
  console.log(`${'═'.repeat(60)}`)

  let ok = 0, failed = 0

  for (let idx = 0; idx < sites.length; idx++) {
    const site = sites[idx]
    const prefix = `  [${String(idx + 1).padStart(2)}/${sites.length}] ${site.domain.padEnd(30)}`

    let fetched = false
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`${prefix}   ↺ 重试 ${attempt}/2，等待 30s…`)
          await delay(30000)
        }
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
        console.log(`${prefix} ✓  pc=${String(pc).padStart(3)}  mobile=${String(mobile).padStart(3)}  index=${indexCount}`)
        if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'ok', rowsWritten: 2, detail: `pc=${pc} mobile=${mobile} index=${indexCount}` })
        fetched = true
        ok++
        break
      } catch (e) {
        if (attempt === 2) {
          console.error(`${prefix} ✗  权重抓取失败（3次）: ${e instanceof Error ? e.message : e}`)
          if (activityId) await siteLog(supabase, activityId, { domain: site.domain, status: 'fail', detail: e instanceof Error ? e.message : '3次重试失败' })
        }
      }
    }
    if (!fetched) failed++
    await delay(3000)
  }

  const durationMs = Date.now() - stepStart
  console.log(`\n  WEIGHT 完成  ✓${ok}  ✗${failed}  耗时=${elapsed(durationMs)}`)
  if (activityId) await activityEnd(supabase, activityId, {
    status: failed > 0 ? 'warn' : 'done',
    ok, fail: failed, rowsWritten: ok * 2, durationMs,
    summary: `权重+收录 ${ok} 站成功，${failed} 站失败`,
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const step = args.find((a) => a.startsWith('--step='))?.split('=')[1] ?? 'all'
  const siteFilter = args.find((a) => a.startsWith('--site='))?.split('=')[1] ?? null
  const group = parseInt(args.find((a) => a.startsWith('--group='))?.split('=')[1] ?? '0', 10)
  const totalGroups = parseInt(args.find((a) => a.startsWith('--total-groups='))?.split('=')[1] ?? '1', 10)

  const totalStart = Date.now()
  const ip = await getPublicIp()
  console.log(`\n${'▶'.repeat(60)}`)
  console.log(`  SEO Monitor Crawl`)
  console.log(`  step=${step}  site=${siteFilter ?? 'all'}  group=${group}/${totalGroups}  ip=${ip}  启动时间=${ts()} MYT`)
  console.log(`${'▶'.repeat(60)}`)

  const today = getMalaysiaDate()
  const yesterday = getMalaysiaDate(-1)

  let query = supabase.from('sites').select('*').eq('is_enabled', true)
  if (siteFilter) query = query.eq('domain', siteFilter)
  const { data: sitesRaw, error } = await query
  if (error) throw error

  const allSites = (sitesRaw || []) as SiteRecord[]
  // 多组时按域名排序确保分组稳定；单组时随机打乱
  const sites = totalGroups > 1
    ? [...allSites].sort((a, b) => a.domain.localeCompare(b.domain)).filter((_, i) => i % totalGroups === group)
    : shuffle(allSites)

  console.log(`  共 ${allSites.length} 个站点，本组 ${sites.length} 个  today=${today}  yesterday=${yesterday}`)

  const logBase = { type: 'cron_task' as const, source: 'github_actions', groupIndex: group, totalGroups, ip }

  if (step === 'keywords' || step === 'all') {
    const aid = await activityStart(supabase, { ...logBase, step: 'keywords' })
    await runKeywords(sites, today, yesterday, group === 0, aid)
  }
  if (step === 'weight' || step === 'all') {
    const aid = await activityStart(supabase, { ...logBase, step: 'weight' })
    await runWeight(sites, today, aid)
  }
  if (step === 'rank' || step === 'all') {
    const aid = await activityStart(supabase, { ...logBase, step: 'rank' })
    await runRank(sites, today, aid)
  }

  console.log(`\n${'✓'.repeat(60)}`)
  console.log(`  全部完成   总耗时=${elapsed(Date.now() - totalStart)}`)
  console.log(`${'✓'.repeat(60)}\n`)
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
