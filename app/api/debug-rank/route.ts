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
    const res = await fetch(url, {
      headers: RANK_HEADERS,
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 0 },
    })

    const status = res.status
    const contentType = res.headers.get('content-type') || ''
    const rawText = await res.text()
    const preview = rawText.slice(0, 2000)

    const hasCookieChallenge = /\.cookie\s*=\s*"([^"]+)"/.test(rawText)
    const hasTbody = rawText.includes('<tbody')
    const trCount = (rawText.match(/<tr/g) || []).length

    return NextResponse.json({
      url,
      status,
      contentType,
      hasCookieChallenge,
      hasTbody,
      trCount,
      preview,
    })
  } catch (err) {
    return NextResponse.json({ url, error: String(err) }, { status: 500 })
  }
}
