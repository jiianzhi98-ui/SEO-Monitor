import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import * as iconv from 'iconv-lite'
import { Element } from 'domhandler'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.3839.com/',
  'Upgrade-Insecure-Requests': '1',
}

export interface HaoyouItem {
  name: string
  tags: string[]
  score: string
  status: string
  url: string
  btnText: string
  date: string
}

export interface HaoyouHotItem {
  rank: number
  name: string
  tags: string[]
}

async function loadPage() {
  try {
    const res = await fetch('https://www.3839.com/timeline.html', {
      headers: HEADERS,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const peek = buf.subarray(0, 4096).toString('ascii')
    const meta = peek.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i)?.[1]?.toLowerCase() ?? 'utf-8'
    const charset = (meta === 'gb2312' || meta === 'gb18030') ? 'gbk' : meta
    return cheerio.load(iconv.decode(buf, charset))
  } catch { return null }
}

const PC_TAGS = ['pc游戏', '主机游戏', '3ds', 'ps4', 'ps5', 'xbox', 'switch']

function isPc($: ReturnType<typeof cheerio.load>, li: Element): boolean {
  if ($(li).find('.g-type-pc').length) return true
  const tags = $(li).find('p.tags .it').map((_, el) => $(el).text().toLowerCase()).get()
  return tags.some(t => PC_TAGS.includes(t))
}

function isPaid($: ReturnType<typeof cheerio.load>, li: Element): boolean {
  return $(li).find('a.btn').text().includes('¥')
}

function parseItem($: ReturnType<typeof cheerio.load>, li: Element): HaoyouItem | null {
  const name = $(li).find('.name em').text().trim()
  if (!name) return null

  const href = $(li).find('a').first().attr('href') ?? ''
  const url = href.startsWith('http') ? href : 'https:' + href

  const tags = $(li).find('p.tags .it').map((_, el) => $(el).text().trim()).get()

  const score = $(li).find('.score').text().replace(/[^\d.]/g, '').trim()

  // Status is the non-score span inside .info
  let status = ''
  $(li).find('.info span').each((_, el) => {
    if (!$(el).hasClass('score') && !$(el).find('i').length) {
      const t = $(el).text().trim()
      if (t) status = t
    }
  })

  const btnText = $(li).find('a.btn').text().trim()

  return { name, tags, score, status, url, btnText }
}

function parseTab($: ReturnType<typeof cheerio.load>, rel: string): HaoyouItem[] {
  const items: HaoyouItem[] = []
  const panel = $(`.panelList[rel="${rel}"]`)
  let currentDate = ''

  // Walk in document order: .foredate updates currentDate, li items get stamped with it
  panel.find('.foredate, .foreList li').each((_, el) => {
    const $el = $(el)
    if ($el.hasClass('foredate')) {
      const m = $el.text().trim().match(/(\d+)月(\d+)日/)
      if (m) currentDate = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}`
      return
    }
    if (isPc($, el) || isPaid($, el)) return
    const item = parseItem($, el)
    if (item) items.push({ ...item, date: currentDate })
  })
  return items
}

async function fetchHotChart(): Promise<HaoyouHotItem[]> {
  try {
    const res = await fetch('https://www.3839.com/top/hot.html', {
      headers: HEADERS,
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return []
    const buf = Buffer.from(await res.arrayBuffer())
    const peek = buf.subarray(0, 4096).toString('ascii')
    const meta = peek.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i)?.[1]?.toLowerCase() ?? 'utf-8'
    const charset = (meta === 'gb2312' || meta === 'gb18030') ? 'gbk' : meta
    const $h = cheerio.load(iconv.decode(buf, charset))

    const items: HaoyouHotItem[] = []
    $h('ul.foreList li, ol li, .rankList li, .list li').each((_, el) => {
      if (items.length >= 20) return false as unknown as void
      const $el = $h(el)
      const name = $el.find('.name em').first().text().trim()
        || $el.find('em').first().text().trim()
        || $el.find('a').first().text().trim()
      if (!name || name.length < 2) return
      const tags = $el.find('p.tags .it').map((_, t) => $h(t).text().trim()).get()
      items.push({ rank: items.length + 1, name, tags })
    })
    return items
  } catch { return [] }
}

export async function GET() {
  const $ = await loadPage()
  if (!$) return NextResponse.json({ upcoming: [], updates: [], hotItems: [] })

  const [hotItems] = await Promise.all([fetchHotChart()])

  return NextResponse.json({
    upcoming: parseTab($, '1'),  // 即将上线
    updates: parseTab($, '3'),   // 即将更新
    hotItems,
  })
}
