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
// Returns true  → still indexed (don't mark as deindexed)
// Returns false → not found (confirmed deindexed)
// Returns null  → inconclusive (captcha / network error — skip, retry next week)
async function checkUrlIndexed(
  url: string,
  domain: string,
  baiduCookie: string,
): Promise<boolean | null> {
  // site:<full-url> searches for that exact URL/prefix in Baidu
  const searchUrl =
    `https://www.baidu.com/s?wd=${encodeURIComponent(`site:${url}`)}` +
    `&ct=2097152&si=${encodeURIComponent(domain)}&fenlei=256&ie=utf-8`

  const { pages, failReason } = await fetchBaiduIndexPages(domain, undefined, baiduCookie, searchUrl)

  if (failReason === 'captcha' || failReason === 'http_error' || failReason === 'no_content') {
    return null  // inconclusive — skip this URL
  }

  // Check if any returned result matches or starts with our URL
  return pages.some(p => p.url === url || p.url.startsWith(url + '/') || url.startsWith(p.url))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = getMalaysiaDate()
  const baiduCookie = process.env.BAIDU_COOKIE || ''
  const start = Date.now()

  console.log(`\n${'▶'.repeat(60)}`)
  console.log(`  Verify De-index  ${today}  (URL-level Baidu confirmation)`)
  console.log(`${'▶'.repeat(60)}\n`)

  // Fetch all sites that have pages pending verification
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: siteRows } = await (supabase.from('sites') as any)
    .select('id, domain')
    .eq('has_index_pages', true)

  const siteMap = new Map<string, string>(
    (siteRows || []).map((s: { id: string; domain: string }) => [s.id, s.domain])
  )

  // Fetch all pending verify rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendingRows, error } = await (supabase.from('site_indexed_pages') as any)
    .select('id, site_id, url')
    .eq('verify_needed', true)
    .is('disappeared_date', null)
    .order('site_id')

  if (error) {
    console.error('  Failed to fetch pending rows:', error.message)
    process.exit(1)
  }

  if (!pendingRows || pendingRows.length === 0) {
    console.log('  ✓ 没有需要验证的 URL，退出。')
    return
  }

  // Group by site
  const bySite = new Map<string, { id: string; url: string }[]>()
  for (const row of pendingRows as { id: string; site_id: string; url: string }[]) {
    if (!bySite.has(row.site_id)) bySite.set(row.site_id, [])
    bySite.get(row.site_id)!.push({ id: row.id, url: row.url })
  }

  console.log(`  待验证：${pendingRows.length} 个 URL，${bySite.size} 个站点\n`)

  let confirmed = 0   // confirmed deindexed → set disappeared_date
  let restored = 0    // still indexed → clear verify_needed
  let skipped = 0     // inconclusive (captcha etc.) → skip

  for (const [siteId, urls] of Array.from(bySite.entries())) {
    const domain = siteMap.get(siteId) ?? siteId
    console.log(`  [${domain}]  ${urls.length} 个 URL 待验证`)

    for (const { id, url } of urls) {
      const result = await checkUrlIndexed(url, domain, baiduCookie)

      if (result === null) {
        // Captcha or error — skip this URL, retry next week
        console.log(`    ⚠  跳过（百度拦截/网络错误）: ${url}`)
        skipped++
      } else if (result === true) {
        // Still indexed — clear the flag
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('site_indexed_pages') as any)
          .update({ verify_needed: false, missed_count: 0 })
          .eq('id', id)
        console.log(`    ✓  仍收录: ${url}`)
        restored++
      } else {
        // Confirmed deindexed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('site_indexed_pages') as any)
          .update({ disappeared_date: today, verify_needed: false })
          .eq('id', id)
        console.log(`    ✗  确认脱收: ${url}`)
        confirmed++
      }

      // Throttle: 4 seconds between URL checks to avoid Baidu rate limiting
      await delay(4000)
    }
  }

  const dur = Date.now() - start
  console.log(`\n  验证完成  确认脱收=${confirmed}  仍收录=${restored}  跳过=${skipped}  耗时=${elapsed(dur)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
