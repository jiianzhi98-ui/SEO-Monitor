import * as cheerio from 'cheerio'
import { parseStringPromise } from 'xml2js'

export interface SitemapEntry {
  url: string
  lastmod?: string
}

export interface PageEntry {
  title: string
  date?: string
  url: string
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
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

const DOWNLOAD_KEYWORDS = [
  '手机版', '安卓版', 'ios版', '苹果版', '下载', 'app', 'apk',
  '电脑版', 'pc版', '破解版', '免费版', '中文版', '汉化版',
  '老版本', '网页版', 'h5版', '不用登录', '离线版',
]

// Fetch and parse sitemap.xml
export async function fetchSitemap(url: string): Promise<SitemapEntry[]> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Failed to fetch sitemap: ${res.status}`)
  const xml = await res.text()
  const parsed = await parseStringPromise(xml, { explicitArray: false })

  const entries: SitemapEntry[] = []

  // Handle sitemap index
  if (parsed.sitemapindex?.sitemap) {
    const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap]
    for (const sm of sitemaps.slice(0, 3)) {
      try {
        const sub = await fetchSitemap(sm.loc)
        entries.push(...sub)
      } catch {
        // skip broken sub-sitemaps
      }
    }
    return entries
  }

  // Handle regular sitemap
  const urls = parsed.urlset?.url
  if (!urls) return entries
  const urlArr = Array.isArray(urls) ? urls : [urls]
  for (const u of urlArr) {
    entries.push({ url: u.loc, lastmod: u.lastmod })
  }
  return entries
}

// Fetch HTML list page and extract titles/dates
export async function fetchHtmlList(
  url: string,
  titleSelector: string,
  dateSelector: string
): Promise<PageEntry[]> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Failed to fetch HTML list: ${res.status}`)
  const html = await res.text()
  const $ = cheerio.load(html)

  const entries: PageEntry[] = []
  const titleEls = $(titleSelector)

  titleEls.each((i, el) => {
    const title = $(el).text().trim()
    const href = $(el).attr('href') || $(el).closest('a').attr('href') || ''
    const fullUrl = href.startsWith('http') ? href : new URL(href, url).href

    let date: string | undefined
    if (dateSelector) {
      const dateEl = $(el).closest('li, article, .item, tr').find(dateSelector).first()
      if (dateEl.length) date = dateEl.text().trim()
    }

    if (title) entries.push({ title, date, url: fullUrl })
  })

  return entries
}

// Fetch and parse RSS feed
export async function fetchRss(url: string): Promise<PageEntry[]> {
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`Failed to fetch RSS: ${res.status}`)
  const xml = await res.text()
  const parsed = await parseStringPromise(xml, { explicitArray: false })

  const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || []
  const itemArr = Array.isArray(items) ? items : [items]

  return itemArr.map((item: Record<string, unknown>) => ({
    title: String(item.title || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim(),
    date: String(item.pubDate || item.updated || item['dc:date'] || '').trim() || undefined,
    url: String(item.link || item.id || '').trim(),
  }))
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

  // Clean up extra spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim()
  return cleaned
}

// Filter keywords that contain download-related attributes
export function filterDownloadKeywords(keywords: string[]): string[] {
  return keywords.filter((kw) =>
    DOWNLOAD_KEYWORDS.some((dk) => kw.toLowerCase().includes(dk.toLowerCase()))
  )
}

// Fetch Baidu PC + mobile weight from aizhan.com
export async function fetchAizhanWeight(domain: string): Promise<{ pc: number; mobile: number }> {
  try {
    const res = await fetch(`https://www.aizhan.com/cha/${domain}/`, {
      headers: {
        ...BROWSER_HEADERS,
        Referer: 'https://www.aizhan.com/',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { pc: 0, mobile: 0 }
    const html = await res.text()
    const $ = cheerio.load(html)

    const pc = parseInt($('#baidurank_br img').attr('alt') || '0', 10)
    const mobile = parseInt($('#baidurank_mbr img').attr('alt') || '0', 10)
    return { pc: isNaN(pc) ? 0 : pc, mobile: isNaN(mobile) ? 0 : mobile }
  } catch {
    return { pc: 0, mobile: 0 }
  }
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
