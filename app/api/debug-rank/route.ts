import { NextResponse } from 'next/server'

const RANK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Referer': 'https://baidurank.aizhan.com/',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || 'lbwbw.com'
  const type = searchParams.get('type') || 'rankup'
  const date = searchParams.get('date') || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
  const rankPos = searchParams.get('pos') || '1'

  const url = `https://baidurank.aizhan.com/mobile/${domain}/${type}/${rankPos}/${date}/`

  try {
    // Step 1: first request
    const res1 = await fetch(url, {
      headers: RANK_HEADERS,
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 0 },
    })
    const status1 = res1.status
    const html1 = await res1.text()
    const cookieMatch = html1.match(/\.cookie\s*=\s*"([^"]+)"/)
    const challengeCookie = cookieMatch ? cookieMatch[1].split(';')[0] : null

    if (!challengeCookie) {
      // No challenge — return result directly
      return NextResponse.json({
        url, step: 1, status: status1,
        hasTbody: html1.includes('<tbody'),
        trCount: (html1.match(/<tr/g) || []).length,
        preview: html1.slice(0, 2000),
      })
    }

    // Step 2: retry with cookie
    const res2 = await fetch(url, {
      headers: { ...RANK_HEADERS, Cookie: challengeCookie },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 0 },
    })
    const status2 = res2.status
    const html2 = await res2.text()
    const hasCookieChallenge2 = /\.cookie\s*=\s*"([^"]+)"/.test(html2)

    return NextResponse.json({
      url,
      step1: { status: status1, hasCookieChallenge: true, challengeCookie },
      step2: {
        status: status2,
        hasCookieChallenge: hasCookieChallenge2,
        hasTbody: html2.includes('<tbody'),
        trCount: (html2.match(/<tr/g) || []).length,
        preview: html2.slice(0, 2000),
      },
    })
  } catch (err) {
    return NextResponse.json({ url, error: String(err) }, { status: 500 })
  }
}
