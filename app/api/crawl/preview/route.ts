import { NextResponse } from 'next/server'
import { fetchSitemap, fetchHtmlList, fetchRss, cleanTitle } from '@/lib/crawler'



interface PreviewBody {
  url: string
  type: 'sitemap' | 'html' | 'rss'
  titleSelector?: string
  dateSelector?: string
  enableVersionClean?: boolean
  suffixes?: string[]
}

export async function POST(request: Request) {
  try {
    const body: PreviewBody = await request.json()
    const { url, type, titleSelector = '', dateSelector = '', enableVersionClean = false, suffixes = [] } = body

    // For HTML type, list_url may have multiple lines — use first URL for preview
    const firstUrl = url.split('\n').map((u) => u.trim()).filter(Boolean)[0] || url
    if (!firstUrl) return NextResponse.json({ error: '缺少 URL' }, { status: 400 })

    let titles: string[] = []

    if (type === 'sitemap') {
      const entries = await fetchSitemap(firstUrl)
      titles = entries.slice(0, 10).map((e) => {
        const parts = e.url.split('/').filter(Boolean)
        const slug = parts[parts.length - 1] || e.url
        return decodeURIComponent(slug.replace(/[-_]/g, ' ').replace(/\.\w+$/, ''))
      })
    } else if (type === 'html') {
      if (!titleSelector) return NextResponse.json({ error: '缺少标题CSS选择器' }, { status: 400 })
      const entries = await fetchHtmlList(firstUrl, titleSelector, dateSelector)
      titles = entries.slice(0, 10).map((e) => e.title)
    } else if (type === 'rss') {
      const entries = await fetchRss(firstUrl)
      titles = entries.slice(0, 10).map((e) => e.title)
    } else {
      return NextResponse.json({ error: '不支持的类型' }, { status: 400 })
    }

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
