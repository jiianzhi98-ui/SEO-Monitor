import { NextResponse } from 'next/server'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export async function GET() {
  try {
    const res = await fetch('https://www.taptap.cn/top/download', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': UA,
      },
      next: { revalidate: 1800 },
    })

    const html = await res.text()

    // Find the hot_search section in Nuxt SSR state
    const hsIdx = html.indexOf('"hot_search"')
    if (hsIdx < 0) {
      return NextResponse.json({ items: [] })
    }
    const chunk = html.slice(hsIdx, hsIdx + 6000)

    // Keywords appear just before {"via":N},"service=...scenes=热搜
    const pattern = /"([^"]{1,80})",(?:0,)?\{"via":\d+\},"service=[^"]*scenes=热搜/g
    const items: { rank: number; name: string; labels: string[] }[] = []
    let m: RegExpExecArray | null
    while ((m = pattern.exec(chunk)) !== null) {
      items.push({ rank: items.length + 1, name: m[1], labels: [] })
      if (items.length >= 20) break
    }

    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
