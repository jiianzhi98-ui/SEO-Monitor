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
    // Step 1: fetch Baidu homepage to get session cookies
    const homeRes = await fetch('https://www.baidu.com/', { headers: HEADERS, signal: AbortSignal.timeout(10000), next: { revalidate: 0 } })
    const setCookieHeader = homeRes.headers.get('set-cookie') || ''
    // Extract key cookies: BAIDUID, BDORZ
    const cookiePairs = setCookieHeader.split(/,(?=[A-Z])/).map(s => s.split(';')[0].trim()).filter(Boolean)
    const sessionCookie = cookiePairs.join('; ')

    await new Promise(r => setTimeout(r, 1500))

    // Step 2: fetch month page with session cookie
    const headersWithCookie = { ...HEADERS, ...(sessionCookie ? { Cookie: sessionCookie } : {}) }
    const res1 = await fetch(monthUrl, { headers: headersWithCookie, signal: AbortSignal.timeout(10000), next: { revalidate: 0 } })
    const html1 = iconv.decode(Buffer.from(await res1.arrayBuffer()), 'utf-8')
    const $1 = cheerio.load(html1)
    const month1Titles = $1('h3.t').map((_, el) => $1(el).find('a').first().text().trim()).get().filter(Boolean)
    const nextHref = $1('a').filter((_, el) => /下一页\s*>/.test($1(el).text().trim())).first().attr('href')
    const nextPageUrl = nextHref ? (nextHref.startsWith('/') ? `https://www.baidu.com${nextHref}` : nextHref) : null

    await new Promise(r => setTimeout(r, 2000))

    // Step 3: follow next page link with cookie
    let month2Result = { h3Count: -1, titles: [] as string[] }
    if (nextPageUrl) {
      const res2 = await fetch(nextPageUrl, { headers: headersWithCookie, signal: AbortSignal.timeout(10000), next: { revalidate: 0 } })
      const html2 = iconv.decode(Buffer.from(await res2.arrayBuffer()), 'utf-8')
      const $2 = cheerio.load(html2)
      month2Result = { h3Count: $2('h3.t').length, titles: $2('h3.t').map((_, el) => $2(el).text().trim()).get().slice(0, 3) }
    }

    await new Promise(r => setTimeout(r, 2000))

    // Step 4: try week with cookie
    const weekRes = await fetch(weekGpcUrl, { headers: headersWithCookie, signal: AbortSignal.timeout(10000), next: { revalidate: 0 } })
    const weekHtml = iconv.decode(Buffer.from(await weekRes.arrayBuffer()), 'utf-8')
    const $w = cheerio.load(weekHtml)
    const weekResult = { h3Count: $w('h3.t').length, titles: $w('h3.t').map((_, el) => $w(el).text().trim()).get().slice(0, 3) }

    return NextResponse.json({
      domain,
      sessionCookie: sessionCookie.slice(0, 100),
      month_page1: { h3Count: month1Titles.length, titles: month1Titles.slice(0, 3), nextPageUrl },
      month_page2_with_cookie: month2Result,
      week_gpc_with_cookie: weekResult,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
