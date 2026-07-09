import { createClient } from '@supabase/supabase-js'
import { fetchRankupWithTitle, fetchRankdownWithTitle } from '../lib/crawler'
import { activityStart, activityEnd, siteLog } from '../lib/activity-log'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const cliArgs = process.argv.slice(2)
const group = parseInt(cliArgs.find(a => a.startsWith('--group='))?.split('=')[1] ?? '0', 10)
const totalGroups = parseInt(cliArgs.find(a => a.startsWith('--total-groups='))?.split('=')[1] ?? '1', 10)

function getMalaysiaDate(offsetDays = 0): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000 + offsetDays * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function ts(): string {
  const d = new Date(Date.now() + 8 * 3600000)
  return d.toISOString().slice(11, 19)
}

function elapsed(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function main() {
  const today = getMalaysiaDate()
  const totalStart = Date.now()

  console.log(`\n${'▶'.repeat(60)}`)
  console.log(`  RANK CRAWL (All Sites)   日期=${today}   ${ts()} MYT`)
  console.log(`${'▶'.repeat(60)}`)

  // Get runner IP
  let ip: string | null = null
  try {
    const r = await fetch('https://api.ipify.org?format=text', { signal: AbortSignal.timeout(5000) })
    ip = (await r.text()).trim()
  } catch { /* ignore */ }

  const { data: sitesRaw, error: sitesErr } = await supabase
    .from('sites')
    .select('id, domain')
    .eq('has_rank_title', true)
  if (sitesErr) throw sitesErr

  const allSites = (sitesRaw || []) as { id: string; domain: string }[]

  if (allSites.length === 0) {
    console.log('  没有开启排名追踪的站点，退出')
    return
  }

  const sites = totalGroups > 1
    ? [...allSites].sort((a, b) => a.domain.localeCompare(b.domain)).filter((_, i) => i % totalGroups === group)
    : allSites

  console.log(`  共 ${allSites.length} 个站点，本组 ${sites.length} 个（group ${group + 1}/${totalGroups}）: ${sites.map(s => s.domain).join(', ')}`)

  // Start activity log
  const activityId = await activityStart(supabase, {
    type: 'cron_task',
    source: 'github_actions',
    step: 'rank-title',
    groupIndex: group,
    totalGroups,
    ip: ip ?? undefined,
  })

  const platforms: ('mobile' | 'pc')[] = ['mobile', 'pc']
  const types: ('rankup' | 'rankdown')[] = ['rankup', 'rankdown']

  let totalSaved = 0
  let totalFailed = 0
  let okSites = 0
  let emptySites = 0
  let failSites = 0

  for (let i = 0; i < sites.length; i++) {
    const { id: siteId, domain } = sites[i]
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  [${i + 1}/${sites.length}] ${domain}  (${ts()})`)

    // Clear today's existing data for this site (both platforms)
    await supabase.from('site_keyword_ranks').delete()
      .eq('site_id', siteId).eq('stat_date', today)

    // keyword_volume: collect best volume per keyword from mobile rankup only
    const kwVolumeMap = new Map<string, number>()

    let siteSaved = 0
    let siteAnyData = false
    let siteFailed = false
    const siteDetails: string[] = []

    for (const platform of platforms) {
      for (const type of types) {
        const label = `${platform}/${type}`
        try {
          const entries = type === 'rankup'
            ? await fetchRankupWithTitle(domain, today, platform)
            : await fetchRankdownWithTitle(domain, today, platform)

          if (entries.length === 0) {
            console.log(`    ${label.padEnd(16)} ⚠  无数据（疑似限流或无词）`)
            siteDetails.push(`${label}=0`)
            await delay(2000)
            continue
          }

          const rows = entries.map(e => ({
            site_id: siteId,
            keyword: e.keyword,
            stat_date: today,
            type,
            platform,
            rank_position: e.rank_position,
            prev_rank: e.prev_rank,
            volume: e.volume,
            title: e.title || null,
            url: e.url || null,
          }))

          for (const chunk of chunkArray(rows, 500)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('site_keyword_ranks') as any)
              .upsert(chunk, { onConflict: 'site_id,keyword,stat_date,platform,type' })
          }

          siteSaved += rows.length
          totalSaved += rows.length
          siteAnyData = true
          siteDetails.push(`${label}=${rows.length}`)
          console.log(`    ${label.padEnd(16)} ✓  ${rows.length} 条`)

          // Collect keyword_volume from mobile rankup, volume > 0 only
          if (platform === 'mobile' && type === 'rankup') {
            for (const e of entries) {
              if (e.volume > 0) {
                const cur = kwVolumeMap.get(e.keyword) ?? 0
                if (e.volume > cur) kwVolumeMap.set(e.keyword, e.volume)
              }
            }
          }
        } catch (e) {
          console.error(`    ${label.padEnd(16)} ✗  ${e instanceof Error ? e.message : String(e)}`)
          siteDetails.push(`${label}=ERR`)
          siteFailed = true
          totalFailed++
        }

        await delay(2000)
      }
    }

    // Upsert keyword_volume (mobile rankup only, volume > 0)
    if (kwVolumeMap.size > 0) {
      const volRows = Array.from(kwVolumeMap.entries()).map(([keyword, volume]) => ({
        keyword, volume, stat_date: today,
      }))
      for (const chunk of chunkArray(volRows, 500)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('keyword_volume') as any)
          .upsert(chunk, { onConflict: 'keyword' })
      }
      console.log(`    keyword_volume   ✓  更新 ${kwVolumeMap.size} 条`)
    }

    // Per-site log
    const siteStatus = siteFailed ? 'fail' : siteAnyData ? 'ok' : 'empty'
    if (siteStatus === 'ok') okSites++
    else if (siteStatus === 'empty') emptySites++
    else failSites++

    if (activityId) {
      await siteLog(supabase, activityId, {
        domain,
        status: siteStatus,
        rowsWritten: siteSaved,
        detail: siteDetails.join(' '),
      })
    }

    if (i < sites.length - 1) {
      console.log(`    等待 60s 再抓下一个站点…`)
      await delay(60000)
    }
  }

  const dur = Date.now() - totalStart
  console.log(`\n${'✓'.repeat(60)}`)
  console.log(`  完成  总词条=${totalSaved}  失败=${totalFailed}  耗时=${elapsed(dur)}`)
  console.log(`${'✓'.repeat(60)}\n`)

  // End activity log
  if (activityId) {
    await activityEnd(supabase, activityId, {
      status: failSites > 0 ? 'warn' : emptySites === sites.length ? 'warn' : 'done',
      ok: okSites,
      empty: emptySites,
      fail: failSites,
      rowsWritten: totalSaved,
      durationMs: dur,
      summary: `${totalSaved} 条词，${sites.length} 站`,
    })
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
