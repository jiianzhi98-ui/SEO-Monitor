import { createClient } from '@supabase/supabase-js'
import { fetchBaiduIndexPages } from '../lib/crawler'

const URLS_PER_JOB = 20

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

function randomDelay(minMs: number, maxMs: number) {
  const ms = minMs + Math.random() * (maxMs - minMs)
  return new Promise<void>((r) => setTimeout(r, ms))
}

function elapsed(ms: number): string {
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}

function parseArg(name: string): number | null {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`))
  if (!arg) return null
  return parseInt(arg.split('=')[1], 10)
}

// Check whether a specific URL is still indexed in Baidu.
// Strategy:
//   1. Plain-text URL search (matches manual user search)
//   2. If not found, fallback to site:url search (no extra si/ct params)
// Returns true  → found (indexed)
//         false → not found (deindexed)
//         null  → inconclusive (captcha / network error)
async function checkUrlIndexed(
  url: string,
  domain: string,
  baiduCookie: string,
): Promise<boolean | null> {
  const urlText = url.replace(/^https?:\/\//i, '')

  function matches(pageUrl: string): boolean {
    return pageUrl === urlText
      || pageUrl.startsWith(urlText + '/')
      || urlText.startsWith(pageUrl + '/')
  }

  // ── Method 1: plain-text search (same as manual user search) ──────────────
  const plainUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(urlText)}&fenlei=256&ie=utf-8`
  const r1 = await fetchBaiduIndexPages(domain, undefined, baiduCookie, plainUrl)

  if (r1.failReason === 'captcha' || r1.failReason === 'http_error') return null
  if (r1.pages.some(p => matches(p.url))) return true

  // ── Method 2: site:url search (no si/ct extra params) ─────────────────────
  const siteUrl = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + urlText)}&ie=utf-8`
  const r2 = await fetchBaiduIndexPages(domain, undefined, baiduCookie, siteUrl)

  if (r2.failReason === 'captcha' || r2.failReason === 'http_error') return null
  if (r2.pages.some(p => matches(p.url))) return true

  return false
}

// ── Mode A: verify pending (verify_needed=true, disappeared_date IS NULL) ─────

async function runVerifyPending(
  siteMap: Map<string, string>,
  today: string,
  baiduCookie: string,
  group: number,
  totalGroups: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase.from('site_indexed_pages') as any)
    .select('id, site_id, url')
    .eq('verify_needed', true)
    .is('disappeared_date', null)
    .order('site_id').order('url')

  if (error) { console.error('  查询失败:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('  ✓ 没有待验证的 URL。'); return }

  const slice = sliceForGroup(rows, group, totalGroups)
  if (slice.length === 0) { console.log(`  ✓ 本 job (${group}/${totalGroups}) 无分配 URL。`); return }

  console.log(`  待验证：共 ${rows.length} 个，本 job 处理 ${slice.length} 个（group=${group}）\n`)

  let confirmed = 0, restored = 0, skipped = 0

  for (const { id, site_id, url } of slice) {
    const domain = siteMap.get(site_id) ?? url.match(/^(?:https?:\/\/)?([^/]+)/)?.[1] ?? ''
    const result = await checkUrlIndexed(url, domain, baiduCookie)

    if (result === null) {
      console.log(`  ⚠  跳过（拦截/网络错误）: ${url}`)
      skipped++
    } else if (result === true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('site_indexed_pages') as any)
        .update({ verify_needed: false, missed_count: 0 })
        .eq('id', id)
      console.log(`  ✓  仍收录（误报清除）: ${url}`)
      restored++
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('site_indexed_pages') as any)
        .update({ disappeared_date: today, verify_needed: false })
        .eq('id', id)
      console.log(`  ✗  确认脱收: ${url}`)
      confirmed++
    }

    await randomDelay(3000, 5000)
  }

  console.log(`\n  完成  确认脱收=${confirmed}  误报清除=${restored}  跳过=${skipped}`)
}

// ── Mode B: recheck disappeared (disappeared_date IS NOT NULL) ────────────────

async function runRecheckDisappeared(
  siteMap: Map<string, string>,
  today: string,
  baiduCookie: string,
  group: number,
  totalGroups: number,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase.from('site_indexed_pages') as any)
    .select('id, site_id, url')
    .not('disappeared_date', 'is', null)
    .order('site_id').order('url')

  if (error) { console.error('  查询失败:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('  ✓ 没有已脱收的 URL。'); return }

  const slice = sliceForGroup(rows, group, totalGroups)
  if (slice.length === 0) { console.log(`  ✓ 本 job (${group}/${totalGroups}) 无分配 URL。`); return }

  console.log(`  已脱收：共 ${rows.length} 个，本 job 处理 ${slice.length} 个（group=${group}）\n`)

  let reindexed = 0, stillGone = 0, skipped = 0

  for (const { id, site_id, url } of slice) {
    const domain = siteMap.get(site_id) ?? url.match(/^(?:https?:\/\/)?([^/]+)/)?.[1] ?? ''
    const result = await checkUrlIndexed(url, domain, baiduCookie)

    if (result === null) {
      console.log(`  ⚠  跳过（拦截/网络错误）: ${url}`)
      skipped++
    } else if (result === true) {
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
      console.log(`  ✓  已重新收录: ${url}`)
      reindexed++
    } else {
      console.log(`  ✗  仍脱收: ${url}`)
      stillGone++
    }

    await randomDelay(3000, 5000)
  }

  console.log(`\n  完成  已重新收录=${reindexed}  仍脱收=${stillGone}  跳过=${skipped}`)
}

// ── Shared util ───────────────────────────────────────────────────────────────

function sliceForGroup<T>(arr: T[], group: number, totalGroups: number): T[] {
  const start = group * URLS_PER_JOB
  return arr.slice(start, start + URLS_PER_JOB)
}

function groupBySite(rows: { id: string; site_id: string; url: string }[]) {
  const map = new Map<string, { id: string; url: string }[]>()
  for (const row of rows) {
    if (!map.has(row.site_id)) map.set(row.site_id, [])
    map.get(row.site_id)!.push({ id: row.id, url: row.url })
  }
  return map
}

// keep groupBySite compiled (used by runRecheckDisappeared's site grouping)
void groupBySite

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const today = getMalaysiaDate()
  const recheck = process.env.RECHECK_DISAPPEARED === 'true'
  const group = parseArg('group') ?? 0
  const totalGroups = parseArg('total-groups') ?? 1
  const start = Date.now()

  console.log(`\n${'▶'.repeat(60)}`)
  console.log(`  Verify De-index  ${today}  mode=${recheck ? 'recheck-disappeared' : 'verify-pending'}`)
  console.log(`  group=${group}/${totalGroups}  urls_per_job=${URLS_PER_JOB}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cookieSetting } = await (supabase.from('app_settings') as any)
    .select('value').eq('key', 'baidu_index_cookie').maybeSingle()
  const baiduCookie: string = (cookieSetting as { value: string } | null)?.value ?? process.env.BAIDU_COOKIE ?? ''
  console.log(`  cookie=${baiduCookie ? `已加载（${baiduCookie.length} chars）` : '⚠ 无 cookie'}`)
  console.log(`${'▶'.repeat(60)}\n`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: siteRows } = await (supabase.from('sites') as any)
    .select('id, domain')
    .eq('has_index_pages', true)

  const siteMap = new Map<string, string>(
    (siteRows || []).map((s: { id: string; domain: string }) => [s.id, s.domain])
  )

  if (recheck) {
    await runRecheckDisappeared(siteMap, today, baiduCookie, group, totalGroups)
  } else {
    await runVerifyPending(siteMap, today, baiduCookie, group, totalGroups)
  }

  const dur = Date.now() - start
  console.log(`  总耗时=${elapsed(dur)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
