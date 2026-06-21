import { NextResponse } from 'next/server'

const HEADERS = {
  'Accept': 'application/json',
  'X-UA': 'V=1&PN=TapTap&VN_CODE=1&LOC=CN&LANG=zh_CN',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

interface TapItem {
  app: { title: string; title_labels?: string[] }
}

async function fetchBatch(from: number): Promise<TapItem[]> {
  const url = `https://www.taptap.cn/webapiv2/app-top/v2/hits?from=${from}&limit=10&type_name=hot`
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 1200 } })
  const json = await res.json()
  return (json?.data?.list ?? []) as TapItem[]
}

export async function GET() {
  try {
    const [first, second] = await Promise.all([fetchBatch(0), fetchBatch(10)])
    const all = [...first, ...second]
    const items = all.map((x, i) => ({
      rank: i + 1,
      name: x.app.title,
      labels: x.app.title_labels ?? [],
    }))
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
