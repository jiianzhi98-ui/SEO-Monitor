import { NextResponse } from 'next/server'
import { fetchHtmlList, cleanTitle } from '@/lib/crawler'

interface PreviewBody {
  url: string
  type: string
  titleSelector?: string
  dateSelector?: string
  enableVersionClean?: boolean
  suffixes?: string[]
}

export async function POST(request: Request) {
  try {
    const body: PreviewBody = await request.json()
    const { url, titleSelector = '', dateSelector = '', enableVersionClean = false, suffixes = [] } = body

    const firstUrl = url.split('\n').map((u) => u.trim()).filter(Boolean)[0] || url
    if (!firstUrl) return NextResponse.json({ error: '缺少 URL' }, { status: 400 })
    if (!titleSelector) return NextResponse.json({ error: '缺少标题CSS选择器' }, { status: 400 })

    const entries = await fetchHtmlList(firstUrl, titleSelector, dateSelector)
    const titles = entries.slice(0, 10).map((e) => e.title)

    const items = titles.map((original) => ({
      original,
      cleaned: cleanTitle(original, enableVersionClean, suffixes),
    }))

    return NextResponse.json({ items })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '预览失败' },
      { status: 500 }
    )
  }
}
