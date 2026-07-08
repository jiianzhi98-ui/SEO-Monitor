import { createClient } from '@supabase/supabase-js'
import { fetchBaiduIndexPages } from '../lib/crawler'

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMalaysiaDate(offsetDays = 0): string {
  const ms = Date.now() + 8 * 3600000 + offsetDays * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function elapsed(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

// Check whether a specific URL is still indexed in Baidu by searching site:<url>.
// Returns true  → still indexed
// Returns false → not found
// Returns null  → inconclusive (captcha / network error — skip)
async function checkUrlIndexed(
  url: string,
  domain: string,
  baiduCookie: string,
): Promise<boolean | null> {
  const searchUrl =
    `https://www.baidu.com/s?wd=${encodeURIComponent(`site:${url}`)}` +
    `&ct=2097152&si=${encodeURIComponent(domain)}&fenlei=256&ie=utf-8`

  const { pages, failReason } = await fetchBaiduIndexPages(domain, undefined, baiduCookie, searchUrl)

  if (failReason === 'captcha' || failReason === 'http_error' || failReason === 'no_content') {
    return null
  }

  return pages.some(p => p.url === url || p.url.startsWith(url + '/') || url.startsWith(p.url))
}

// ── Mode A: verify pending (verify_needed=true, disappeared_date IS NULL) ─────

async function runVerifyPending(
  siteMap: Map<string, string>,
  today: string,
  baiduCookie: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase.from('site_indexed_pages') as any)
    .select('id, site_id, url')
    .eq('verify_needed', true)
    .is('disappeared_date', null)
    .order('site_id')

  if (error) { console.error('  查询失败:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('  ✓ 没有待验证的 URL。'); return }

  const bySite = groupBySite(rows)
  console.log(`  待验证：${rows.length} 个 URL，${bySite.size} 个站点\n`)

  let confirmed = 0, restored = 0, skipped = 0

  for (const [siteId, urls] of Array.from(bySite.entries())) {
    const domain = siteMap.get(siteId) ?? siteId
    console.log(`  [${domain}]  ${urls.length} 个 URL`)

    for (const { id, url } of urls) {
      const result = await checkUrlIndexed(url, domain, baiduCookie)
      if (result === null) {
        console.log(`    ⚠  跳过（拦截/网络错误）: ${url}`)
        skipped++
      } else if (result === true) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('site_indexed_pages') as any)
          .update({ verify_needed: false, missed_count: 0 })
          .eq('id', id)
        console.log(`    ✓  仍收录: ${url}`)
        restored++
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('site_indexed_pages') as any)
          .update({ disappeared_date: today, verify_needed: false })
          .eq('id', id)
        console.log(`    ✗  确认脱收: ${url}`)
        confirmed++
      }
      await delay(4000)
    }
  }

  console.log(`\n  完成  确认脱收=${confirmed}  仍收录（误报清除）=${restored}  跳过=${skipped}`)
}

// ── Mode B: recheck disappeared (disappeared_date IS NOT NULL) ────────────────

async function runRecheckDisappeared(
  siteMap: Map<string, string>,
  today: string,
  baiduCookie: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase.from('site_indexed_pages') as any)
    .select('id, site_id, url')
    .not('disappeared_date', 'is', null)
    .order('site_id')

  if (error) { console.error('  查询失败:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('  ✓ 没有已脱收的 URL。'); return }

  const bySite = groupBySite(rows)
  console.log(`  已脱收：${rows.length} 个 URL，${bySite.size} 个站点\n`)

  let reindexed = 0, stillGone = 0, skipped = 0

  for (const [siteId, urls] of Array.from(bySite.entries())) {
    const domain = siteMap.get(siteId) ?? siteId
    console.log(`  [${domain}]  ${urls.length} 个 URL`)

    for (const { id, url } of urls) {
      const result = await checkUrlIndexed(url, domain, baiduCookie)
      if (result === null) {
        console.log(`    ⚠  跳过（拦截/网络错误）: ${url}`)
        skipped++
      } else if (result === true) {
        // Page has been re-indexed — clear disappeared_date and mark reindexed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('site_indexed_pages') as any)
          .update({
            disappeared_date: null,
            reindexed_at: today,
            last_seen_date: today,
            missed_count: 0,
            verify_needed: false,
          })
          .eq('id', id)
        console.log(`    ✓  已重新收录: ${url}`)
        reindexed++
      } else {
        console.log(`    ✗  仍脱收: ${url}`)
        stillGone++
      }
      await delay(4000)
    }
  }

  console.log(`\n  完成  已重新收录=${reindexed}  仍脱收=${stillGone}  跳过=${skipped}`)
}

// ── Shared util ───────────────────────────────────────────────────────────────

function groupBySite(rows: { id: string; site_id: string; url: string }[]) {
  const map = new Map<string, { id: string; url: string }[]>()
  for (const row of rows) {
    if (!map.has(row.site_id)) map.set(row.site_id, [])
    map.get(row.site_id)!.push({ id: row.id, url: row.url })
  }
  return map
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = getMalaysiaDate()
  const baiduCookie = process.env.BAIDU_COOKIE || ''
  const recheck = process.env.RECHECK_DISAPPEARED === 'true'
  const start = Date.now()

  console.log(`\n${'▶'.repeat(60)}`)
  console.log(`  Verify De-index  ${today}  mode=${recheck ? 'recheck-disappeared' : 'verify-pending'}`)
  console.log(`${'▶'.repeat(60)}\n`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: siteRows } = await (supabase.from('sites') as any)
    .select('id, domain')
    .eq('has_index_pages', true)

  const siteMap = new Map<string, string>(
    (siteRows || []).map((s: { id: string; domain: string }) => [s.id, s.domain])
  )

  if (recheck) {
    await runRecheckDisappeared(siteMap, today, baiduCookie)
  } else {
    await runVerifyPending(siteMap, today, baiduCookie)
  }

  const dur = Date.now() - start
  console.log(`  总耗时=${elapsed(dur)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
