import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import * as iconv from 'iconv-lite'

const BAIDU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.baidu.com/',
  'Cache-Control': 'no-cache',
}

const TBS_MAP: Record<string, string> = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m' }

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || ''
  const period = searchParams.get('period') || 'day'
  const siteName = (searchParams.get('siteName') || '').trim()

  if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 })

  const tbs = TBS_MAP[period] || 'qdr:d'
  const escapedName = siteName ? siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
  const stripRe = escapedName ? new RegExp(`\\s*[-_|]\\s*${escapedName}\\s*$`) : null

  const titles: string[] = []

  for (let page = 0; page < 30; page++) {
    const pn = page * 10
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + domain)}&tbs=${encodeURIComponent(tbs)}&ie=utf-8${pn > 0 ? `&pn=${pn}` : ''}`

    try {
      const res = await fetch(url, {
        headers: BAIDU_HEADERS,
        signal: AbortSignal.timeout(10000),
        next: { revalidate: 0 },
      })
      if (!res.ok) break

      const buffer = Buffer.from(await res.arrayBuffer())
      // Baidu returns UTF-8 but let's detect properly
      const peek = buffer.subarray(0, 2000).toString('ascii')
      const ctCharset = (res.headers.get('content-type') || '').match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase()
      const metaCharset = peek.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i)?.[1]?.toLowerCase()
      const raw = ctCharset || metaCharset || 'utf-8'
      const charset = (raw === 'gb2312' || raw === 'gb18030') ? 'gbk' : raw
      const html = iconv.decode(buffer, charset)

      const $ = cheerio.load(html)
      const pageTitles: string[] = []

      $('h3.t').each((_, el) => {
        let title = $(el).find('a').first().text().trim() || $(el).text().trim()
        if (stripRe) title = title.replace(stripRe, '').trim()
        if (title) pageTitles.push(title)
      })

      if (pageTitles.length === 0) break
      titles.push(...pageTitles)

      // Stop if no "下一页" link
      const hasNext = $('a').filter((_, el) => $(el).text().trim() === '下一页>').length > 0
      if (!hasNext) break

      if (page < 29) await new Promise((r) => setTimeout(r, 300))
    } catch {
      break
    }
  }

  return NextResponse.json({ titles, total: titles.length })
}
