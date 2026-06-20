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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || 'lbwbw.com'
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + domain)}&tbs=qdr%3Am&ie=utf-8`

  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000), next: { revalidate: 0 } })
    const status = res.status
    const buffer = Buffer.from(await res.arrayBuffer())
    const peek = buffer.subarray(0, 4096).toString('ascii')
    const ctCharset = (res.headers.get('content-type') || '').match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase()
    const metaCharset = peek.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i)?.[1]?.toLowerCase()
    const raw = ctCharset || metaCharset || 'utf-8'
    const charset = (raw === 'gb2312' || raw === 'gb18030') ? 'gbk' : raw
    const html = iconv.decode(buffer, charset)

    const hasH3t = html.includes('h3 class="t"') || html.includes('h3class="t"') || /<h3[^>]*\bt\b/.test(html)
    const hasVerify = html.includes('verify') || html.includes('captcha') || html.includes('安全验证') || html.includes('百度安全')
    const titleMatch = html.match(/<title>(.*?)<\/title>/)
    const title = titleMatch ? titleMatch[1] : ''

    // Find any h3 tags to see what classes they have
    const h3matches = Array.from(html.matchAll(/<h3[^>]*>/g)).slice(0, 5).map(m => m[0])

    // Try cheerio extraction the same way fetchBaiduIndexTitles does
    const $ = cheerio.load(html)
    const extractedTitles: string[] = []
    $('h3.t').each((_, el) => {
      const linkText = $(el).find('a').first().text().trim()
      const fullText = $(el).text().trim()
      extractedTitles.push(linkText || fullText || '[empty]')
    })

    // Check pagination — find all <a> tags near the bottom that look like page nav
    const allATexts = $('a').map((_, el) => $(el).text().trim()).get().filter(Boolean)
    const hasNextExact = allATexts.includes('下一页>')
    const pageNavLinks = allATexts.filter(t => /下一页|next|›|»|第\d+页/.test(t))

    // Also check week results
    const weekUrl = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + domain)}&tbs=qdr%3Aw&ie=utf-8`
    let weekCount = -1
    try {
      await new Promise(r => setTimeout(r, 3000))
      const res2 = await fetch(weekUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000), next: { revalidate: 0 } })
      const buf2 = Buffer.from(await res2.arrayBuffer())
      const html2 = iconv.decode(buf2, 'utf-8')
      const $2 = cheerio.load(html2)
      weekCount = $2('h3.t').length
    } catch { weekCount = -1 }

    return NextResponse.json({
      url, status, charset,
      pageTitle: title,
      hasVerify,
      h3Count: $('h3.t').length,
      extractedTitles: extractedTitles.slice(0, 5),
      pagination: { hasNextExact, pageNavLinks },
      weekH3Count: weekCount,
    })
  } catch (err) {
    return NextResponse.json({ url, error: String(err) }, { status: 500 })
  }
}
