import { createClient } from '@supabase/supabase-js'
import { fetchRankPositions } from '../lib/crawler'

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
  console.log(`  RANK POSITIONS (Own Sites)   日期=${today}   ${ts()} MYT`)
  console.log(`${'▶'.repeat(60)}`)

  // 1. Get all unique domains from task_groups.associated_domains
  const { data: groups, error: groupsErr } = await supabase
    .from('task_groups')
    .select('associated_domains')
  if (groupsErr) throw groupsErr

  const allDomains = new Set<string>()
  for (const g of (groups || []) as { associated_domains: string[] | null }[]) {
    for (const d of g.associated_domains || []) {
      if (d?.trim()) allDomains.add(d.trim())
    }
  }

  if (allDomains.size === 0) {
    console.log('  没有分组关联域名，退出')
    return
  }

  // 2. Find matching site records
  const { data: sitesRaw } = await supabase
    .from('sites')
    .select('id, domain')
    .in('domain', Array.from(allDomains))

  const domainToSiteId = new Map<string, string>()
  for (const s of (sitesRaw || []) as { id: string; domain: string }[]) {
    domainToSiteId.set(s.domain, s.id)
  }

  const validDomains = Array.from(allDomains).filter(d => {
    if (!domainToSiteId.has(d)) {
      console.warn(`  ⚠ 域名 ${d} 未在 sites 表中找到，跳过`)
      return false
    }
    return true
  })

  console.log(`  关联域名共 ${allDomains.size} 个，有效 ${validDomains.length} 个: ${validDomains.join(', ')}`)

  if (validDomains.length === 0) {
    console.log('  无有效域名，退出')
    return
  }

  const platforms: ('mobile' | 'pc')[] = ['mobile', 'pc']
  const types: ('rankup' | 'rankdown')[] = ['rankup', 'rankdown']

  let totalSaved = 0
  let totalFailed = 0

  for (const domain of validDomains) {
    const siteId = domainToSiteId.get(domain)!
    console.log(`\n${'─'.repeat(50)}`)
    console.log(`  ${domain}  (${ts()})`)

    // Clear today's existing data for this site before re-inserting
    await supabase.from('site_keyword_ranks').delete().eq('site_id', siteId).eq('stat_date', today)

    // keyword_volume: collect best volume per keyword across all combinations
    const kwVolumeMap = new Map<string, number>()

    for (const platform of platforms) {
      for (const type of types) {
        const label = `${platform}/${type}`
        try {
          const entries = await fetchRankPositions(domain, today, type, platform)

          if (entries.length === 0) {
            console.log(`    ${label.padEnd(16)} ⚠  无数据（疑似限流或该方向无变化）`)
            continue
          }

          // Save all entries to site_keyword_ranks (including volume=0)
          const rows = entries.map(e => ({
            site_id: siteId,
            keyword: e.keyword,
            stat_date: today,
            platform,
            type,
            rank_position: e.rank_position,
            prev_rank: e.prev_rank,
            volume: e.volume,
          }))

          for (const chunk of chunkArray(rows, 500)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.from('site_keyword_ranks') as any)
              .upsert(chunk, { onConflict: 'site_id,keyword,stat_date,platform,type' })
          }

          // Collect volume > 0 for keyword_volume enrichment
          for (const e of entries) {
            if (e.volume > 0) {
              const cur = kwVolumeMap.get(e.keyword) ?? 0
              if (e.volume > cur) kwVolumeMap.set(e.keyword, e.volume)
            }
          }

          totalSaved += entries.length
          console.log(`    ${label.padEnd(16)} ✓  ${entries.length} 条`)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error(`    ${label.padEnd(16)} ✗  ${msg}`)
          totalFailed++
        }

        await delay(3000)
      }
    }

    // Upsert keyword_volume so 首页快报 and 分组任务 can find these volumes
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
      console.log(`    keyword_volume   ✓  更新 ${kwVolumeMap.size} 条`)
    }

    // Wait between domains to avoid rate-limiting
    if (validDomains.indexOf(domain) < validDomains.length - 1) {
      console.log(`    等待 60s 再抓下一个域名…`)
      await delay(60000)
    }
  }

  console.log(`\n${'✓'.repeat(60)}`)
  console.log(`  完成  总词条=${totalSaved}  失败组=${totalFailed}  耗时=${elapsed(Date.now() - totalStart)}`)
  console.log(`${'✓'.repeat(60)}\n`)
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1) })
