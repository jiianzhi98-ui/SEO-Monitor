import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://baidurank.aizhan.com/',
}

async function fetchOnePage(
  domain: string,
  type: string,
  rankPos: number,
  date: string,
  page: number
): Promise<{ keyword: string; volume: number }[]> {
  const suffix = page === 1 ? '' : `${page}/`
  const url = `https://baidurank.aizhan.com/mobile/${domain}/${type}/${rankPos}/${date}/${suffix}`
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 0 },
    })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)

    const results: { keyword: string; volume: number }[] = []
    $('tbody tr').each((_, tr) => {
      const keyword = $(tr).find('td.title a').first().text().trim()
      const volumeText = $(tr).find('td.ip').eq(2).text().trim()
      const volume = parseInt(volumeText, 10) || 0
      if (keyword) results.push({ keyword, volume })
    })
    return results
  } catch {
    return []
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || ''
  const date = searchParams.get('date') || ''
  const type = searchParams.get('type') || 'rankup'

  if (!domain || !date) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }
  if (type !== 'rankup' && type !== 'rankdown') {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  }

  // Fetch rank positions 1-5 in parallel; sub-pages sequential within each
  const allResults = await Promise.all(
    [1, 2, 3, 4, 5].map(async (rankPos) => {
      const entries: { keyword: string; volume: number }[] = []
      for (let page = 1; page <= 15; page++) {
        const pageEntries = await fetchOnePage(domain, type, rankPos, date, page)
        if (pageEntries.length === 0) break  // truly empty page = no more data
        entries.push(...pageEntries.filter((e) => e.volume > 0))
      }
      return entries
    })
  )

  const all = allResults.flat()

  // Deduplicate and sort by volume desc
  const seen = new Set<string>()
  const filtered = all
    .filter((e) => {
      if (seen.has(e.keyword)) return false
      seen.add(e.keyword)
      return true
    })
    .sort((a, b) => b.volume - a.volume)

  return NextResponse.json(filtered)
}
