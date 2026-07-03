import * as cheerio from 'cheerio'
import * as iconv from 'iconv-lite'

export interface PageEntry {
  title: string
  date?: string
  url: string
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function randomDelay(minMs: number, maxMs: number) {
  return new Promise((r) => setTimeout(r, minMs + Math.floor(Math.random() * (maxMs - minMs))))
}

function getBrowserHeaders() {
  return {
    'User-Agent': randomUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Referer': 'https://www.baidu.com/',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'cross-site',
    'Sec-Fetch-User': '?1',
  }
}

const DOWNLOAD_KEYWORDS = [
  '手机版', '安卓版', 'ios版', '苹果版', '下载', 'app', 'apk',
  '电脑版', 'pc版', '破解版', '免费版', '中文版', '汉化版',
  '老版本', '网页版', 'h5版', '不用登录', '离线版',
]

// Fetch HTML with automatic charset detection (handles GBK/GB2312 sites)
async function fetchHtmlDecoded(url: string, headers: Record<string, string>): Promise<{ ok: boolean; html: string; status?: number }> {
  try {
    const res = await fetch(url, { headers, next: { revalidate: 0 }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return { ok: false, html: '', status: res.status }
    const buffer = Buffer.from(await res.arrayBuffer())
    // ASCII-safe peek to detect charset without corrupting data
    const peek = buffer.subarray(0, 4096).toString('ascii')
    const ctCharset = (res.headers.get('content-type') || '').match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase()
    const metaCharset = peek.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i)?.[1]?.toLowerCase()
    const raw = ctCharset || metaCharset || 'utf-8'
    const charset = (raw === 'gb2312' || raw === 'gb18030') ? 'gbk' : raw
    return { ok: true, html: iconv.decode(buffer, charset) }
  } catch {
    return { ok: false, html: '' }
  }
}

// Fetch HTML list page and extract titles/dates
export async function fetchHtmlList(
  url: string,
  titleSelector: string,
  dateSelector: string
): Promise<PageEntry[]> {
  const { ok, html, status } = await fetchHtmlDecoded(url, getBrowserHeaders())
  if (!ok) throw new Error(`Failed to fetch HTML list: ${status}`)
  const $ = cheerio.load(html)

  const entries: PageEntry[] = []
  const titleEls = $(titleSelector)

  titleEls.each((_, el) => {
    const title = $(el).text().trim()
    const href = $(el).attr('href') || $(el).closest('a').attr('href') || ''
    const fullUrl = href.startsWith('http') ? href : new URL(href, url).href

    let date: string | undefined
    if (dateSelector) {
      let container = $(el).closest('li, article, .item, tr')
      if (!container.length) container = $(el).closest('div').parent()
      const dateEl = container.find(dateSelector).first()
      if (dateEl.length) date = dateEl.text().trim()
    }

    if (title) entries.push({ title, date, url: fullUrl })
  })

  return entries
}

// Try to find the "next page" link on a page
function findNextPageUrl($: ReturnType<typeof cheerio.load>, currentUrl: string): string | null {
  const nextTexts = ['下一页', '下一頁', '>', '›', '»', 'Next', 'next']
  for (const text of nextTexts) {
    let el = $(`a`).filter((_, node) => $(node).text().trim() === text).first()
    if (!el.length) el = $(`a[class*="next"]`).first()
    if (el.length) {
      const href = el.attr('href')
      if (href && !href.includes('javascript') && !href.startsWith('#')) {
        return href.startsWith('http') ? href : new URL(href, currentUrl).href
      }
    }
  }
  return null
}

// Parse a date string like "2026-06-09 17:04", "2026/06/09", or "26-07-01" to YYYY-MM-DD
function parseEntryDateStr(dateStr: string | undefined): string | null {
  if (!dateStr) return null
  // 4-digit year: 2026-07-01
  const m = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // 2-digit year: 26-07-01 → 2026-07-01
  const m2 = dateStr.match(/^(\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m2) return `20${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`
  return null
}

export interface HtmlSource {
  url: string
  titleSelector: string
  dateSelector: string
}

// Fetch multiple HTML sources (each with own selectors) with auto-pagination
// Stops when all entries on a page are older than cutoffDateStr
export async function fetchHtmlListPages(
  sources: HtmlSource[],
  cutoffDateStr: string,
  maxPages = 5,
  skipPageDelay = false
): Promise<PageEntry[]> {
  const all: PageEntry[] = []

  for (const source of sources) {
    let currentUrl: string | null = source.url
    let page = 0

    while (currentUrl && page < maxPages) {
      page++
      try {
        const { ok, html } = await fetchHtmlDecoded(currentUrl, getBrowserHeaders())
        if (!ok) break
        const $ = cheerio.load(html)

        const pageEntries: PageEntry[] = []
        $(source.titleSelector).each((_, el) => {
          const title = $(el).text().trim()
          const href = $(el).attr('href') || $(el).closest('a').attr('href') || ''
          const fullUrl = href.startsWith('http') ? href : new URL(href, currentUrl!).href
          let date: string | undefined
          if (source.dateSelector) {
            let container = $(el).closest('li, article, .item, tr')
            if (!container.length) container = $(el).closest('div').parent()
            const dateEl = container.find(source.dateSelector).first()
            if (dateEl.length) date = dateEl.text().trim()
          }
          if (title) pageEntries.push({ title, date, url: fullUrl })
        })

        all.push(...pageEntries)

        const datedEntries = pageEntries.map((e) => parseEntryDateStr(e.date)).filter(Boolean) as string[]
        if (datedEntries.length > 0 && datedEntries.every((d) => d < cutoffDateStr)) break

        currentUrl = findNextPageUrl($, currentUrl)
        if (currentUrl && !skipPageDelay) await randomDelay(10000, 15000)
      } catch {
        break
      }
    }
  }

  return all.filter((e) => {
    const d = parseEntryDateStr(e.date)
    return !d || d >= cutoffDateStr
  })
}

// Clean title by removing version numbers and optional suffixes
export function cleanTitle(
  title: string,
  enableVersionClean: boolean,
  suffixes: string[]
): string {
  if (!enableVersionClean) return title

  let cleaned = title

  if (suffixes && suffixes.length > 0) {
    // Remove version + any of the suffixes
    const suffixPattern = suffixes.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const pattern = new RegExp(`[vV]\\d+(?:\\.\\d+)*(?:\\s*(?:${suffixPattern}))*`, 'gi')
    cleaned = cleaned.replace(pattern, '').trim()
  } else {
    // Remove version numbers only
    cleaned = cleaned.replace(/[vV]\d+(?:\.\d+)*/g, '').trim()
  }

  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  return cleaned
}

// Filter keywords that contain download-related attributes
export function filterDownloadKeywords(keywords: string[]): string[] {
  return keywords.filter((kw) =>
    DOWNLOAD_KEYWORDS.some((dk) => kw.toLowerCase().includes(dk.toLowerCase()))
  )
}

function parseIpRange(text: string): { min: number; max: number; avg: number } {
  const parts = text.replace(/,/g, '').split('~').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
  if (parts.length === 0) return { min: 0, max: 0, avg: 0 }
  const min = parts[0]
  const max = parts.length > 1 ? parts[1] : parts[0]
  return { min, max, avg: Math.round((min + max) / 2) }
}

// Fetch weight, index count, and IP data from aizhan.com (single request)
export async function fetchAizhanData(domain: string): Promise<{
  pc: number; mobile: number; indexCount: number
  pcIpMin: number; pcIpMax: number; pcIpAvg: number
  mobileIpMin: number; mobileIpMax: number; mobileIpAvg: number
}> {
  const empty = { pc: 0, mobile: 0, indexCount: 0, pcIpMin: 0, pcIpMax: 0, pcIpAvg: 0, mobileIpMin: 0, mobileIpMax: 0, mobileIpAvg: 0 }
  try {
    const res = await fetch(`https://www.aizhan.com/cha/${domain}/`, {
      headers: { ...getBrowserHeaders(), Referer: 'https://www.aizhan.com/' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return empty
    const html = await res.text()
    const $ = cheerio.load(html)

    const pc = parseInt($('#baidurank_br img').attr('alt') || '0', 10)
    const mobile = parseInt($('#baidurank_mbr img').attr('alt') || '0', 10)
    const indexRaw = $('#shoulu1_baidu a').first().text().replace(/[^0-9]/g, '')
    const indexCount = parseInt(indexRaw || '0', 10)
    const pcRange = parseIpRange($('#baidurank_ip').text())
    const mobileRange = parseIpRange($('#baidurank_m_ip').text())

    return {
      pc: isNaN(pc) ? 0 : pc,
      mobile: isNaN(mobile) ? 0 : mobile,
      indexCount: isNaN(indexCount) ? 0 : indexCount,
      pcIpMin: pcRange.min, pcIpMax: pcRange.max, pcIpAvg: pcRange.avg,
      mobileIpMin: mobileRange.min, mobileIpMax: mobileRange.max, mobileIpAvg: mobileRange.avg,
    }
  } catch {
    return empty
  }
}

function getRankHeaders(ua: string) {
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': 'https://baidurank.aizhan.com/',
  }
}

async function fetchRankPage(
  domain: string,
  type: string,
  rankPos: number,
  date: string,
  page: number,
  cookie = '',
  ua: string,
  isToday = false
): Promise<{ keyword: string; volume: number }[] | null> {
  const suffix = page === 1 ? '' : `${page}/`
  // Today's aizhan URLs omit the date segment for both rankup and rankdown
  const url = isToday
    ? `https://baidurank.aizhan.com/mobile/${domain}/${type}/${rankPos}/${suffix}`
    : `https://baidurank.aizhan.com/mobile/${domain}/${type}/${rankPos}/${date}/${suffix}`
  try {
    const headers: Record<string, string> = { ...getRankHeaders(ua) }
    if (cookie) headers['Cookie'] = cookie

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    })
    if (!res.ok) return []
    const html = await res.text()

    // Detect anti-bot JS challenge: sets a cookie and redirects
    // Handle both first-time (no cookie) and cookie-expiry (new challenge with existing cookie)
    const cookieMatch = html.match(/\.cookie\s*=\s*"([^"]+)"/)
    if (cookieMatch) {
      const challengeCookie = cookieMatch[1].split(';')[0]
      if (challengeCookie === cookie) return []  // same cookie returned — stuck, bail out
      return fetchRankPage(domain, type, rankPos, date, page, challengeCookie, ua, isToday)
    }

    // 检测登录墙：返回了登录页而非排名数据（null = 被拦截，区别于 [] = 无数据）
    if (!html.includes('<tbody') && (html.includes('login_fixedt') || html.includes('wic_login') || html.includes('请登录'))) {
      return null
    }

    const $ = cheerio.load(html)
    const results: { keyword: string; volume: number }[] = []
    $('tbody tr').each((_, tr) => {
      const keyword = $(tr).find('td.title a').first().text().trim()
      const volume = parseInt($(tr).find('td.ip').eq(2).text().trim(), 10) || 0
      if (keyword) results.push({ keyword, volume })
    })
    return results
  } catch {
    return []
  }
}

// Pre-fetch the JS challenge cookie for a domain so all subsequent requests
// can skip the challenge round-trip (aizhan added this protection ~2026-06-19).
// Cookie has path=/ and max-age=300, so it's valid for all pages of the same domain.
async function prefetchRankCookie(domain: string, type: string, date: string, ua: string, overrideUrl?: string): Promise<string> {
  try {
    const url = overrideUrl ?? `https://baidurank.aizhan.com/mobile/${domain}/${type}/1/${date}/`
    const res = await fetch(url, { headers: getRankHeaders(ua), signal: AbortSignal.timeout(8000), next: { revalidate: 0 } })
    const html = await res.text()
    const m = html.match(/\.cookie\s*=\s*"([^"]+)"/)
    return m ? m[1].split(';')[0] : ''
  } catch {
    return ''
  }
}

// Fetch all rank changes (涨入 or 跌出) for a domain on a given date.
// The 5 rank positions run in parallel; within each position pages are fetched
// sequentially with 300ms delay and stop as soon as a page returns empty.
// A single UA is chosen per call so retries (in route.ts) naturally rotate to a fresh UA.
export async function fetchRankChanges(
  domain: string,
  date: string,
  type: 'rankup' | 'rankdown'
): Promise<{ keyword: string; volume: number }[]> {
  const ua = randomUA()
  const todayMY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const isToday = date === todayMY
  const prefetchOverride = isToday
    ? `https://baidurank.aizhan.com/mobile/${domain}/${type}/1/`
    : undefined
  const sharedCookie = await prefetchRankCookie(domain, type, date, ua, prefetchOverride)

  const allResults = await Promise.all(
    [1, 2, 3, 4, 5].map(async (rankPos) => {
      const entries: { keyword: string; volume: number }[] = []
      for (let page = 1; page <= 15; page++) {
        const pageEntries = await fetchRankPage(domain, type, rankPos, date, page, sharedCookie, ua, isToday)
        if (pageEntries === null) throw new Error('AIZHAN_LOGIN_WALL')
        if (pageEntries.length === 0) break
        entries.push(...pageEntries.filter((e) => e.volume > 0))
        if (page < 15) await new Promise((r) => setTimeout(r, 300))
      }
      return entries
    })
  )

  // Dedup by keyword — same keyword can rank in multiple positions, keep highest volume
  const seen = new Map<string, number>()
  for (const e of allResults.flat()) {
    if (!seen.has(e.keyword) || e.volume > (seen.get(e.keyword) ?? 0)) {
      seen.set(e.keyword, e.volume)
    }
  }
  return Array.from(seen.entries()).map(([keyword, volume]) => ({ keyword, volume }))
}

// Fetch one page of rankdown results including the title column (标题).
// Today's aizhan URL omits the date segment: /rankdown/{rankPos}/{page}/
// Past dates include it:                      /rankdown/{rankPos}/{date}/{page}/
async function fetchRankdownPage(
  domain: string,
  rankPos: number,
  date: string,
  page: number,
  cookie = '',
  ua: string,
  isToday = false
): Promise<{ keyword: string; volume: number; title: string }[]> {
  const pageSuffix = page === 1 ? '' : `${page}/`
  const url = isToday
    ? `https://baidurank.aizhan.com/mobile/${domain}/rankdown/${rankPos}/${pageSuffix}`
    : `https://baidurank.aizhan.com/mobile/${domain}/rankdown/${rankPos}/${date}/${pageSuffix}`
  try {
    const headers: Record<string, string> = { ...getRankHeaders(ua) }
    if (cookie) headers['Cookie'] = cookie
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), next: { revalidate: 0 } })
    if (!res.ok) return []
    const html = await res.text()
    const cookieMatch = html.match(/\.cookie\s*=\s*"([^"]+)"/)
    if (cookieMatch) {
      const challengeCookie = cookieMatch[1].split(';')[0]
      if (challengeCookie === cookie) return []
      return fetchRankdownPage(domain, rankPos, date, page, challengeCookie, ua, isToday)
    }
    const $ = cheerio.load(html)
    const results: { keyword: string; volume: number; title: string }[] = []
    $('tbody tr').each((_, tr) => {
      const keyword = $(tr).find('td.title a').first().text().trim()
      const volume = parseInt($(tr).find('td.ip').eq(2).text().trim(), 10) || 0
      // Title is the 6th column (index 5); falls back to last td
      const titleTd = $(tr).find('td').eq(5)
      const title = (titleTd.length ? titleTd : $(tr).find('td').last()).text().trim()
      if (keyword) results.push({ keyword, volume, title })
    })
    return results
  } catch {
    return []
  }
}

// Fetch all rankdown (跌出) keywords for a domain on a given date, including page title.
// Crawls all 5 rank positions in parallel, deduped by keyword (highest volume wins).
export async function fetchRankdownWithTitle(
  domain: string,
  date: string,
): Promise<{ keyword: string; volume: number; title: string }[]> {
  const ua = randomUA()
  const todayMY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const isToday = date === todayMY
  const prefetchUrl = isToday
    ? `https://baidurank.aizhan.com/mobile/${domain}/rankdown/1/`
    : undefined
  const sharedCookie = await prefetchRankCookie(domain, 'rankdown', date, ua, prefetchUrl)

  const allResults = await Promise.all(
    [1, 2, 3, 4, 5].map(async (rankPos) => {
      const entries: { keyword: string; volume: number; title: string }[] = []
      for (let page = 1; page <= 15; page++) {
        const pageEntries = await fetchRankdownPage(domain, rankPos, date, page, sharedCookie, ua, isToday)
        if (pageEntries.length === 0) break
        entries.push(...pageEntries.filter(e => e.volume > 0))
        if (page < 15) await new Promise((r) => setTimeout(r, 300))
      }
      return entries
    })
  )

  const seen = new Map<string, { volume: number; title: string }>()
  for (const e of allResults.flat()) {
    const cur = seen.get(e.keyword)
    if (!cur || e.volume > cur.volume) seen.set(e.keyword, { volume: e.volume, title: e.title })
  }
  return Array.from(seen.entries())
    .map(([keyword, { volume, title }]) => ({ keyword, volume, title }))
    .sort((a, b) => b.volume - a.volume)
}

// Fetch one page of rankup results including the title column (标题).
async function fetchRankupPage(
  domain: string,
  rankPos: number,
  date: string,
  page: number,
  cookie = '',
  ua: string,
  isToday = false
): Promise<{ keyword: string; volume: number; title: string }[]> {
  const pageSuffix = page === 1 ? '' : `${page}/`
  const url = isToday
    ? `https://baidurank.aizhan.com/mobile/${domain}/rankup/${rankPos}/${pageSuffix}`
    : `https://baidurank.aizhan.com/mobile/${domain}/rankup/${rankPos}/${date}/${pageSuffix}`
  try {
    const headers: Record<string, string> = { ...getRankHeaders(ua) }
    if (cookie) headers['Cookie'] = cookie
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), next: { revalidate: 0 } })
    if (!res.ok) return []
    const html = await res.text()
    const cookieMatch = html.match(/\.cookie\s*=\s*"([^"]+)"/)
    if (cookieMatch) {
      const challengeCookie = cookieMatch[1].split(';')[0]
      if (challengeCookie === cookie) return []
      return fetchRankupPage(domain, rankPos, date, page, challengeCookie, ua, isToday)
    }
    const $ = cheerio.load(html)
    const results: { keyword: string; volume: number; title: string }[] = []
    $('tbody tr').each((_, tr) => {
      const keyword = $(tr).find('td.title a').first().text().trim()
      const volume = parseInt($(tr).find('td.ip').eq(2).text().trim(), 10) || 0
      const titleTd = $(tr).find('td').eq(5)
      const title = (titleTd.length ? titleTd : $(tr).find('td').last()).text().trim()
      if (keyword) results.push({ keyword, volume, title })
    })
    return results
  } catch {
    return []
  }
}

// Fetch all rankup (涨入) keywords for a domain on a given date, including page title.
export async function fetchRankupWithTitle(
  domain: string,
  date: string,
): Promise<{ keyword: string; volume: number; title: string }[]> {
  const ua = randomUA()
  const todayMY = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const isToday = date === todayMY
  const prefetchUrl = isToday
    ? `https://baidurank.aizhan.com/mobile/${domain}/rankup/1/`
    : undefined
  const sharedCookie = await prefetchRankCookie(domain, 'rankup', date, ua, prefetchUrl)

  const allResults = await Promise.all(
    [1, 2, 3, 4, 5].map(async (rankPos) => {
      const entries: { keyword: string; volume: number; title: string }[] = []
      for (let page = 1; page <= 15; page++) {
        const pageEntries = await fetchRankupPage(domain, rankPos, date, page, sharedCookie, ua, isToday)
        if (pageEntries.length === 0) break
        entries.push(...pageEntries.filter(e => e.volume > 0))
        if (page < 15) await new Promise((r) => setTimeout(r, 300))
      }
      return entries
    })
  )

  const seen = new Map<string, { volume: number; title: string }>()
  for (const e of allResults.flat()) {
    const cur = seen.get(e.keyword)
    if (!cur || e.volume > cur.volume) seen.set(e.keyword, { volume: e.volume, title: e.title })
  }
  return Array.from(seen.entries())
    .map(([keyword, { volume, title }]) => ({ keyword, volume, title }))
    .sort((a, b) => b.volume - a.volume)
}

// @deprecated use fetchAizhanData instead
export async function fetchAizhanWeight(domain: string): Promise<{ pc: number; mobile: number }> {
  const { pc, mobile } = await fetchAizhanData(domain)
  return { pc, mobile }
}

export interface BaiduIndexedPage {
  url: string          // display URL from cite (e.g. "www.example.com/page/title")
  title: string        // page title
  snippet: string      // description snippet (≤200 chars)
  baiduDateStr: string | null  // raw Baidu date label (e.g. "2天前", "2026年6月1日")
}

// Fetch Baidu site: search results to discover indexed pages.
// Uses 一年内 (tl=4) so results are sorted by date — newest first.
// Paginates up to maxPages (each page = 10 results).
export async function fetchBaiduIndexPages(
  domain: string,
  maxPages = 5
): Promise<BaiduIndexedPage[]> {
  const results: BaiduIndexedPage[] = []
  const seenUrls = new Set<string>()
  const seenTitles = new Set<string>()
  const domainRoot = domain.replace(/^www\./i, '').toLowerCase()
  const datePattern = /^\d+(?:天|小时|分钟)前$|^昨天$|^\d{4}年\d{1,2}月\d{1,2}日$|^\d{4}-\d{2}-\d{2}$/

  for (let page = 0; page < maxPages; page++) {
    const pn = page * 10
    const searchUrl = `https://www.baidu.com/s?wd=${encodeURIComponent(`site:${domain}`)}&tl=4&pn=${pn}&rn=10`
    try {
      const referer = page === 0
        ? 'https://www.baidu.com/'
        : `https://www.baidu.com/s?wd=${encodeURIComponent(`site:${domain}`)}&tl=4&pn=${(page - 1) * 10}`
      const { ok, html } = await fetchHtmlDecoded(searchUrl, { ...getBrowserHeaders(), Referer: referer })
      if (!ok || !html) break
      // Check for CAPTCHA / empty result page
      if (!html.includes('content_left') || html.includes('百度安全验证')) break

      const $ = cheerio.load(html)
      let pageCount = 0

      $('#content_left .result, #content_left .result-op').each((_, el) => {
        const $el = $(el)

        // Title from first h3 a
        const titleText = $el.find('h3 a').first().text().replace(/\s+/g, ' ').trim()
        if (!titleText || seenTitles.has(titleText)) return

        // Display URL from cite element — must belong to this domain
        const citeText = $el.find('cite').first().text().replace(/\s+/g, '').trim()
          .replace(/^https?:\/\//i, '')
        if (!citeText || !citeText.toLowerCase().includes(domainRoot)) return
        if (seenUrls.has(citeText)) return

        seenUrls.add(citeText)
        seenTitles.add(titleText)

        // Snippet: first sizeable text block that isn't title/URL
        let snippet = $el.find('.c-abstract').first().text().replace(/\s+/g, ' ').trim()
        if (!snippet) {
          $el.find('p, span').each((_, p) => {
            const t = $(p).text().replace(/\s+/g, ' ').trim()
            if (t.length > 20 && t.length > snippet.length && !t.includes(domainRoot)) snippet = t
          })
        }
        if (snippet.length > 200) snippet = snippet.slice(0, 200) + '…'

        // Date: scan for date-like text in spans/em
        let baiduDateStr: string | null = null
        $el.find('span, em').each((_, dateEl) => {
          if (baiduDateStr) return false
          const t = $(dateEl).text().trim()
          if (datePattern.test(t)) baiduDateStr = t
        })

        results.push({ url: citeText, title: titleText, snippet, baiduDateStr })
        pageCount++
      })

      if (pageCount === 0) break
      if (page < maxPages - 1) await randomDelay(2000, 4000)
    } catch {
      break
    }
  }

  return results
}

// Fetch Baidu search suggestions for a keyword
export async function fetchBaiduSuggestion(keyword: string): Promise<string[]> {
  try {
    const encoded = encodeURIComponent(keyword)
    const url = `https://suggestion.baidu.com/su?wd=${encoded}&cb=window.bd__cbs__callback&json=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEOMonitor/1.0)',
        Referer: 'https://www.baidu.com',
      },
      signal: AbortSignal.timeout(5000),
    })
    const text = await res.text()

    // Parse JSONP response: window.bd__cbs__callback({...})
    const match = text.match(/\((\{.*?\})\)/)
    if (!match) return []
    const data = JSON.parse(match[1])
    const suggestions: string[] = data?.s || []

    // Filter to keep only download-related suggestions
    return filterDownloadKeywords(suggestions)
  } catch {
    return []
  }
}
