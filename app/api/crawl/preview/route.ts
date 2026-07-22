import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { fetchHtmlList, fetchJsonHtmlPages, cleanTitle } from '@/lib/crawler'

// Block private/link-local IP ranges to prevent SSRF
function isSafeUrl(raw: string): boolean {
  let parsed: URL
  try { parsed = new URL(raw) } catch { return false }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const h = parsed.hostname.toLowerCase()
  if (h === 'localhost') return false
  // IPv4 private/link-local
  if (/^127\./.test(h)) return false
  if (/^10\./.test(h)) return false
  if (/^192\.168\./.test(h)) return false
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false
  if (/^169\.254\./.test(h)) return false
  // IPv6 loopback / link-local
  if (h === '::1' || h.startsWith('fe80:')) return false
  return true
}

interface PreviewBody {
  url: string
  type: string
  titleSelector?: string
  dateSelector?: string
  enableVersionClean?: boolean
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body: PreviewBody = await request.json()
    const { url, titleSelector = '', dateSelector = '', enableVersionClean = false } = body

    const firstUrl = url.split('\n').map((u) => u.trim()).filter(Boolean)[0] || url
    if (!firstUrl) return NextResponse.json({ error: '缺少 URL' }, { status: 400 })
    if (!isSafeUrl(firstUrl)) return NextResponse.json({ error: '不允许的目标 URL' }, { status: 400 })
    if (!titleSelector) return NextResponse.json({ error: '缺少标题CSS选择器' }, { status: 400 })

    let entries
    if (firstUrl.includes('{page}')) {
      // JSON-HTML API mode: fetch only page 1 for preview
      entries = await fetchJsonHtmlPages(firstUrl, titleSelector, dateSelector, undefined, '1970-01-01', 1)
    } else {
      entries = await fetchHtmlList(firstUrl, titleSelector, dateSelector)
    }
    const titles = entries.slice(0, 10).map((e) => e.title)

    const items = titles.map((original) => ({
      original,
      cleaned: cleanTitle(original, enableVersionClean),
    }))

    return NextResponse.json({ items })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '预览失败' },
      { status: 500 }
    )
  }
}
