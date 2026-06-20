'use strict'

const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

puppeteer.use(StealthPlugin())

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

function getMalaysiaDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function saveScreenshot(page, name) {
  try {
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false })
    console.log(`    [screenshot: ${name}.png]`)
  } catch (e) {
    console.log(`    [screenshot failed: ${e.message}]`)
  }
}

async function extractPageTitles(page, siteName) {
  const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return page.evaluate((escaped) => {
    const re = escaped ? new RegExp(`\\s*[-_|·]\\s*${escaped}\\s*$`, 'i') : null
    return Array.from(document.querySelectorAll('h3.t')).map((el) => {
      const a = el.querySelector('a')
      let title = (a ? a.textContent : el.textContent).trim()
      if (re) title = title.replace(re, '').trim()
      return title
    }).filter(Boolean)
  }, escaped)
}

async function scrapeAllPages(page, siteName, label, maxPages = 50) {
  const allTitles = []

  for (let p = 0; p < maxPages; p++) {
    await delay(1500)
    const titles = await extractPageTitles(page, siteName)
    if (titles.length === 0) {
      const pageTitle = await page.title()
      const url = page.url()
      console.log(`    page ${p + 1}: 0 results — title="${pageTitle}" url=${url.slice(0, 80)}`)
      if (p === 0) await saveScreenshot(page, `${siteName.replace(/[^a-z0-9]/gi, '_')}-${label}-p1`)
      break
    }
    allTitles.push(...titles)
    console.log(`    page ${p + 1}: ${titles.length} titles (total: ${allTitles.length})`)

    const hasNext = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a')).some((a) => /下一页/.test(a.textContent))
    )
    if (!hasNext) break

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => delay(5000)),
      page.evaluate(() => {
        const link = Array.from(document.querySelectorAll('a')).find((a) => /下一页/.test(a.textContent))
        link?.click()
      }),
    ])
  }

  return allTitles
}

async function clickTimeFilter(page, label, siteName) {
  // Open the time filter dropdown
  await page.evaluate(() => {
    const trigger =
      document.querySelector('#timeRlt') ||
      Array.from(document.querySelectorAll('span')).find((s) => /时间不限|一(月|周|天)内/.test(s.textContent.trim()))
    trigger?.click()
  })

  await delay(800)

  const clicked = await page.evaluate((label) => {
    const target = Array.from(document.querySelectorAll('li, span')).find(
      (el) => el.textContent.trim() === label
    )
    if (target) { target.click(); return true }
    return false
  }, label)

  if (!clicked) {
    console.log(`    Warning: could not click "${label}" filter`)
    await saveScreenshot(page, `${siteName.replace(/[^a-z0-9]/gi, '_')}-filter-fail`)
    return false
  }

  await Promise.race([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
    delay(6000),
  ]).catch(() => {})

  await delay(2000)
  return true
}

async function storePeriod(siteId, period, titles, today) {
  if (period === 'month') {
    await supabase.from('baidu_index').delete()
      .eq('site_id', siteId).eq('stat_date', today).eq('period', 'month')
  }
  if (titles.length === 0) return

  const rows = titles.map((title) => ({ site_id: siteId, title, stat_date: today, period }))
  const { error } = await supabase
    .from('baidu_index')
    .upsert(rows, { onConflict: 'site_id,stat_date,period,title', ignoreDuplicates: true })
  if (error) console.error(`    Supabase error (${period}):`, error.message)
}

async function generateChanges(siteId, today) {
  const yesterday = getMalaysiaDate(-1)
  const [{ data: todayData }, { data: yesterdayData }] = await Promise.all([
    supabase.from('baidu_index').select('title, period').eq('site_id', siteId).eq('stat_date', today),
    supabase.from('baidu_index').select('title, period').eq('site_id', siteId).eq('stat_date', yesterday),
  ])

  const todayMap = new Map((todayData || []).map((r) => [r.title, r.period]))
  const yesterdayMap = new Map((yesterdayData || []).map((r) => [r.title, r.period]))

  const changeRows = []
  for (const [title, period] of todayMap) {
    if (!yesterdayMap.has(title)) changeRows.push({ site_id: siteId, title, change_date: today, change_type: 'appeared', period })
  }
  for (const [title, period] of yesterdayMap) {
    if (!todayMap.has(title)) changeRows.push({ site_id: siteId, title, change_date: today, change_type: 'dropped', period })
  }

  if (changeRows.length > 0) {
    const { error } = await supabase
      .from('baidu_index_changes')
      .upsert(changeRows, { onConflict: 'site_id,change_date,title,change_type', ignoreDuplicates: true })
    if (error) console.error('    Change rows error:', error.message)
  }
  return changeRows.length
}

async function processSite(browser, site, today) {
  console.log(`\n--- ${site.domain} (${site.name}) ---`)
  const page = await browser.newPage()

  try {
    await page.setViewport({ width: 1280, height: 900 })
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    })

    // Visit Baidu homepage first to establish cookies/session
    console.log('  Visiting Baidu homepage...')
    await page.goto('https://www.baidu.com/', { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(2000)
    console.log(`  Homepage title: ${await page.title()}`)

    // Search for site:domain
    const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + site.domain)}&ie=utf-8`
    console.log(`  Searching: ${searchUrl}`)
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 })
    await delay(3000)

    const pageTitle = await page.title()
    const h3Count = await page.evaluate(() => document.querySelectorAll('h3.t').length)
    console.log(`  Base: title="${pageTitle}" h3.t=${h3Count}`)

    if (h3Count === 0) {
      await saveScreenshot(page, `${site.domain.replace(/\./g, '_')}-base`)
    }

    // Month
    console.log('  [月] clicking 一月内...')
    await clickTimeFilter(page, '一月内', site.domain)
    const monthTitles = await scrapeAllPages(page, site.name, 'month')
    console.log(`  月: ${monthTitles.length} total`)
    await storePeriod(site.id, 'month', monthTitles, today)
    await delay(2000)

    // Week
    console.log('  [周] clicking 一周内...')
    await clickTimeFilter(page, '一周内', site.domain)
    const weekTitles = await scrapeAllPages(page, site.name, 'week')
    console.log(`  周: ${weekTitles.length} total`)
    const monthSet = new Set(monthTitles)
    const weekExclusive = weekTitles.filter((t) => !monthSet.has(t))
    await storePeriod(site.id, 'week', weekExclusive, today)
    await delay(2000)

    // Day
    console.log('  [日] clicking 一天内...')
    await clickTimeFilter(page, '一天内', site.domain)
    const dayTitles = await scrapeAllPages(page, site.name, 'day')
    console.log(`  日: ${dayTitles.length} total`)
    const weekSet = new Set(weekExclusive)
    const dayExclusive = dayTitles.filter((t) => !monthSet.has(t) && !weekSet.has(t))
    await storePeriod(site.id, 'day', dayExclusive, today)

    const changeCount = await generateChanges(site.id, today)
    console.log(`  变化记录: ${changeCount}`)

    return { domain: site.domain, month: monthTitles.length, week: weekTitles.length, day: dayTitles.length, changes: changeCount }
  } catch (err) {
    console.error(`  Error: ${err.message}`)
    await saveScreenshot(page, `${site.domain.replace(/\./g, '_')}-error`).catch(() => {})
    return { domain: site.domain, month: 0, week: 0, day: 0, error: err.message }
  } finally {
    await page.close()
  }
}

async function main() {
  const today = getMalaysiaDate()
  const domainFilter = process.argv[2] || null
  console.log(`=== Baidu Index Puppeteer Crawl: ${today} ===`)
  if (domainFilter) console.log(`Filtering to domain: ${domainFilter}`)

  let sitesQuery = supabase.from('sites').select('id, domain, name').eq('is_enabled', true)
  if (domainFilter) sitesQuery = sitesQuery.eq('domain', domainFilter)
  const { data: sitesRaw, error: sitesError } = await sitesQuery
  if (sitesError) { console.error('Failed to load sites:', sitesError); process.exit(1) }

  const sites = sitesRaw || []
  console.log(`Found ${sites.length} sites`)

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
      '--lang=zh-CN',
    ],
  })

  const summary = []
  for (const site of sites) {
    const result = await processSite(browser, site, today)
    summary.push(result)
    await delay(5000)
  }

  await browser.close()

  // Cleanup
  await supabase.from('baidu_index').delete().lt('stat_date', getMalaysiaDate(-3))
  await supabase.from('baidu_index_changes').delete().lt('change_date', getMalaysiaDate(-30))

  console.log('\n=== Summary ===')
  for (const r of summary) {
    const s = r.error ? `ERROR: ${r.error}` : `月:${r.month} 周:${r.week} 日:${r.day} 变:${r.changes}`
    console.log(`  ${r.domain}: ${s}`)
  }
  console.log('=== Done ===')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
