import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'
import * as iconv from 'iconv-lite'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const BAIDU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://www.baidu.com/',
  'Cache-Control': 'no-cache',
}

const TBS_MAP: Record<string, string> = { day: 'qdr:d', week: 'qdr:w', month: 'qdr:m' }

function getMalaysiaDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

async function fetchBaiduTitles(domain: string, period: string, siteName: string): Promise<string[]> {
  const tbs = TBS_MAP[period] || 'qdr:m'
  const escapedName = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const stripRe = escapedName ? new RegExp(`\\s*[-_|]\\s*${escapedName}\\s*$`) : null
  const titles: string[] = []

  for (let page = 0; page < 20; page++) {
    const pn = page * 10
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent('site:' + domain)}&tbs=${encodeURIComponent(tbs)}&ie=utf-8${pn > 0 ? `&pn=${pn}` : ''}`
    try {
      const res = await fetch(url, { headers: BAIDU_HEADERS, signal: AbortSignal.timeout(8000), next: { revalidate: 0 } })
      if (!res.ok) break
      const buffer = Buffer.from(await res.arrayBuffer())
      const peek = buffer.subarray(0, 2000).toString('ascii')
      const ctCharset = (res.headers.get('content-type') || '').match(/charset=([^\s;]+)/i)?.[1]?.toLowerCase()
      const metaCharset = peek.match(/<meta[^>]+charset=["']?\s*([^"'\s;>]+)/i)?.[1]?.toLowerCase()
      const raw = ctCharset || metaCharset || 'utf-8'
      const html = iconv.decode(buffer, (raw === 'gb2312' || raw === 'gb18030') ? 'gbk' : raw)
      const $ = cheerio.load(html)
      const pageTitles: string[] = []
      $('h3.t').each((_, el) => {
        let title = $(el).find('a').first().text().trim() || $(el).text().trim()
        if (stripRe) title = title.replace(stripRe, '').trim()
        if (title) pageTitles.push(title)
      })
      if (pageTitles.length === 0) break
      titles.push(...pageTitles)
      const hasNext = $('a').filter((_, el) => $(el).text().trim() === '下一页>').length > 0
      if (!hasNext) break
      if (page < 19) await new Promise((r) => setTimeout(r, 300))
    } catch { break }
  }
  return titles
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || ''
  const period = (searchParams.get('period') || 'month') as 'month' | 'week' | 'day'
  const siteName = (searchParams.get('siteName') || '').trim()
  const siteId = searchParams.get('siteId') || ''

  if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 })

  const today = getMalaysiaDate()
  const supabase = getSupabase()

  // Fetch from Baidu
  const baiduTitles = await fetchBaiduTitles(domain, period, siteName)
  if (baiduTitles.length === 0) return NextResponse.json({ items: [], total: 0 })

  // Get today's existing broader-period titles from DB
  const existingSet = new Set<string>()
  if (siteId && period !== 'month') {
    const broadPeriods = period === 'day' ? ['month', 'week'] : ['month']
    const { data } = await supabase
      .from('baidu_index').select('title')
      .eq('site_id', siteId).eq('stat_date', today).in('period', broadPeriods)
    ;(data || []).forEach((r: { title: string }) => existingSet.add(r.title))
  }

  // Store in DB
  if (siteId) {
    if (period === 'month') {
      await supabase.from('baidu_index').delete()
        .eq('site_id', siteId).eq('stat_date', today).eq('period', 'month')
      const rows = baiduTitles.map((title) => ({ site_id: siteId, title, stat_date: today, period: 'month' }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('baidu_index') as any).upsert(rows, { onConflict: 'site_id,stat_date,period,title', ignoreDuplicates: true })
    } else {
      const exclusive = baiduTitles.filter((t) => !existingSet.has(t))
      if (exclusive.length > 0) {
        const rows = exclusive.map((title) => ({ site_id: siteId, title, stat_date: today, period }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('baidu_index') as any).upsert(rows, { onConflict: 'site_id,stat_date,period,title', ignoreDuplicates: true })
      }
    }
  }

  // Return items with exclusive flag for color coding
  const items = baiduTitles.map((title) => ({
    title,
    exclusive: period !== 'month' && !existingSet.has(title),
  }))

  return NextResponse.json({ items, total: items.length })
}
