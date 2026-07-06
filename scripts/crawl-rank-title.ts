import { createClient } from '@supabase/supabase-js'
import { fetchRankupWithTitle, fetchRankdownWithTitle } from '../lib/crawler'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
  console.log(`  RANK TITLE CRAWL (Competitor Sites)   日期=${today}   ${ts()} MYT`)
  console.log(`${'▶'.repeat(60)}`)

  // Read sites with has_rank_title=true
  const { data: sitesRaw, error: sitesErr } = await supabase
    .from('sites')
    .select('id, domain')
    .eq('has_rank_title', true)
  if (sitesErr) throw sitesErr

  const sites = (sitesRaw || []) as { id: string; domain: string }[]

  if (sites.length === 0) {
    console.log('  没有开启竞品追踪的站点，退出')
    return
  }

  console.log(`  共 ${sites.length} 个站点: ${sites.map(s => s.domain).join(', ')}`)

  let totalSaved = 0
  let totalFailed = 0

  for (let i = 0; i < sites.length; i++) {
    const { id: siteId, domain } = sites[i]
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  [${i + 1}/${sites.length}] ${domain}  (${ts()})`)

    // Clear today's existing data for this site before re-inserting
    await supabase.from('site_rank_keywords').delete()
      .eq('site_id', siteId).eq('stat_date', today).eq('platform', 'mobile')

    const kwVolumeMap = new Map<string, number>()

    // ── rankup ─────────────────────────────────────────────────────────────────
    try {
      const entries = await fetchRankupWithTitle(domain, today)
      if (entries.length === 0) {
        console.log('    rankup   ⚠  无数据（疑似限流或无涨入词）')
      } else {
        const rows = entries.map(e => ({
          site_id: siteId,
          keyword: e.keyword,
          stat_date: today,
          type: 'rankup',
          platform: 'mobile',
          rank_position: e.rank_position,
          volume: e.volume,
          title: e.title || null,
        }))
        for (const chunk of chunkArray(rows, 500)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('site_rank_keywords') as any)
            .upsert(chunk, { onConflict: 'site_id,keyword,stat_date,type,platform' })
        }
        for (const e of entries) {
          if (e.volume > 0) {
            const cur = kwVolumeMap.get(e.keyword) ?? 0
            if (e.volume > cur) kwVolumeMap.set(e.keyword, e.volume)
          }
        }
        totalSaved += entries.length
        console.log(`    rankup   ✓  ${entries.length} 条`)
      }
    } catch (e) {
      console.error(`    rankup   ✗  ${e instanceof Error ? e.message : String(e)}`)
      totalFailed++
    }

    await delay(2000)

    // ── rankdown ───────────────────────────────────────────────────────────────
    try {
      const entries = await fetchRankdownWithTitle(domain, today)
      if (entries.length === 0) {
        console.log('    rankdown ⚠  无数据（疑似限流或无跌出词）')
      } else {
        const rows = entries.map(e => ({
          site_id: siteId,
          keyword: e.keyword,
          stat_date: today,
          type: 'rankdown',
          platform: 'mobile',
          rank_position: e.rank_position,
          volume: e.volume,
          title: e.title || null,
        }))
        for (const chunk of chunkArray(rows, 500)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('site_rank_keywords') as any)
            .upsert(chunk, { onConflict: 'site_id,keyword,stat_date,type,platform' })
        }
        totalSaved += entries.length
        console.log(`    rankdown ✓  ${entries.length} 条`)
      }
    } catch (e) {
      console.error(`    rankdown ✗  ${e instanceof Error ? e.message : String(e)}`)
      totalFailed++
    }

    // Upsert keyword_volume (rankup only, volume > 0)
    if (kwVolumeMap.size > 0) {
      const volRows = Array.from(kwVolumeMap.entries()).map(([keyword, volume]) => ({
        keyword,
        volume,
        stat_date: today,
      }))
      for (const chunk of chunkArray(volRows, 500)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('keyword_volume') as any)
          .upsert(chunk, { onConflict: 'keyword' })
      }
      console.log(`    keyword_volume ✓  更新 ${kwVolumeMap.size} 条`)
    }

    if (i < sites.length - 1) {
      console.log(`    等待 45s 再抓下一个站点…`)
      await delay(45000)
    }
  }

  console.log(`\n${'✓'.repeat(60)}`)
  console.log(`  完成  总词条=${totalSaved}  失败站=${totalFailed}  耗时=${elapsed(Date.now() - totalStart)}`)
  console.log(`${'✓'.repeat(60)}\n`)
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
