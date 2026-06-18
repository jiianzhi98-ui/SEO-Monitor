import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || '7xz.com'
  const date = searchParams.get('date') || '2026-06-18'

  const url = `https://baidurank.aizhan.com/mobile/${domain}/rankup/1/${date}/`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://baidurank.aizhan.com/',
    },
    next: { revalidate: 0 },
  })

  const html = await res.text()
  // Return first 3000 chars to see page structure
  return NextResponse.json({ status: res.status, snippet: html.slice(0, 3000) })
}
