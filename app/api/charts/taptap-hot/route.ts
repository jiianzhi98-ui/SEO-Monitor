import { NextResponse } from 'next/server'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const ICON_LABEL: Record<number, string> = { 2: '首发', 6: '上升' }

function isSkippable(s: string): boolean {
  if (s.length <= 1) return true
  if (s.startsWith('http') || s.startsWith('0x') || s.startsWith('service=')) return true
  if (['png', 'gif', 'jpg', 'webp', 'jpeg'].includes(s)) return true
  // Skip pure ASCII strings (property keys like "keyword", "url", "width", etc.)
  if (/^[\x00-\x7F]+$/.test(s)) return true
  return false
}

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

    const hsIdx = html.indexOf('"hot_search"')
    if (hsIdx < 0) return NextResponse.json({ items: [] })
    const chunk = html.slice(hsIdx, hsIdx + 8000)

    const items: { rank: number; name: string; labels: string[] }[] = []

    // Find each item by locating its service string, then looking backward for the keyword
    const serviceRe = /"service=[^"]*scenes=[^"]*"/g
    let sm: RegExpExecArray | null

    while ((sm = serviceRe.exec(chunk)) !== null) {
      if (items.length >= 20) break

      // Look backward up to 800 chars from this service string
      const lookback = chunk.slice(Math.max(0, sm.index - 800), sm.index)

      // Find the last non-skippable quoted string — that's the keyword
      const strRe = /"([^"]*)"/g
      let lastKw = ''
      let lastKwEnd = -1
      let kwm: RegExpExecArray | null
      while ((kwm = strRe.exec(lookback)) !== null) {
        if (!isSkippable(kwm[1])) {
          lastKw = kwm[1]
          lastKwEnd = kwm.index + kwm[0].length
        }
      }
      if (!lastKw) continue

      // Check if an icon_type number follows the keyword (indicates badge)
      const afterKw = lookback.slice(lastKwEnd)
      const iconMatch = afterKw.match(/^,([1-9]),\{"url":\d+/)
      const labels: string[] = []
      if (iconMatch) {
        const lbl = ICON_LABEL[parseInt(iconMatch[1])]
        if (lbl) labels.push(lbl)
      }

      items.push({ rank: items.length + 1, name: lastKw, labels })
    }

    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
