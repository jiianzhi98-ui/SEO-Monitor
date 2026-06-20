import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import * as iconv from 'iconv-lite'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.baidu.com/',
  'Cache-Control': 'no-cache',
}

async function fetchAndParse(url: string) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000), next: { revalidate: 0 } })
  const buf = Buffer.from(await res.arrayBuffer())
  const html = iconv.decode(buf, 'utf-8')
  const $ = cheerio.load(html)
  const titles = $('h3.t').map((_, el) => $(el).find('a').first().text().trim() || $(el).text().trim()).get().filter(Boolean)
  const allATexts = $('a').map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const nextLinks = allATexts.filter(t => /下一?页/.test(t))
  return { status: res.status, h3Count: titles.length, titles: titles.slice(0, 3), nextLinks }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || 'sjwyx.com'

  const now = Math.floor(Date.now() / 1000)
  const weekGpc = `stf=${now - 604800},${now}|stftype=1`

  const monthUrl = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + domain)}&ie=utf-8&tbs=qdr%3Am`
  const monthPage2Url = `${monthUrl}&pn=10`
  const weekGpcUrl = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + domain)}&ie=utf-8&ct=2097152&si=${encodeURIComponent(domain)}&gpc=${encodeURIComponent(weekGpc)}`
  const weekTbsUrl = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + domain)}&ie=utf-8&tbs=qdr%3Aw&si=${encodeURIComponent(domain)}`

  try {
    const month1 = await fetchAndParse(monthUrl)
    await new Promise(r => setTimeout(r, 2000))
    const month2 = await fetchAndParse(monthPage2Url)
    await new Promise(r => setTimeout(r, 2000))
    const weekGpcResult = await fetchAndParse(weekGpcUrl)
    await new Promise(r => setTimeout(r, 2000))
    const weekTbsResult = await fetchAndParse(weekTbsUrl)

    return NextResponse.json({
      domain,
      month_page1: month1,
      month_page2: month2,
      week_gpc: weekGpcResult,
      week_tbs_with_si: weekTbsResult,
      urls: { monthUrl, monthPage2Url, weekGpcUrl, weekTbsUrl }
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
