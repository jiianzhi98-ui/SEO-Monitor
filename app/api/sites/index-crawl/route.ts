export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { fetchBaiduIndexPages } from '@/lib/crawler'

function getMYDate(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

// POST /api/sites/index-crawl  { domain: string }
// Crawls Baidu site: for given domain, upserts into site_indexed_pages for the matching site.
// Does NOT mark disappeared pages (manual crawl is supplemental, not authoritative).
export async function POST(req: Request) {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any
  const { data: profile } = await service.from('user_profiles').select('role').eq('id', user.id).single()
  const role = profile?.role ?? 'normal'
  if (role === 'normal') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const rawDomain = (body.domain || '').trim()
  if (!rawDomain) return NextResponse.json({ error: '请输入域名' }, { status: 400 })

  // Normalize: strip protocol + www/m prefix
  const domain = rawDomain.replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/\/$/, '')
  if (!domain) return NextResponse.json({ error: '域名格式不正确' }, { status: 400 })

  // Find matching site: exact match first, then suffix match (e.g. "sjwyx.com" matches "m.sjwyx.com")
  const { data: exactSites } = await service.from('sites').select('id, domain').eq('domain', domain).limit(1)
  const exactSite = (exactSites || [])[0]
  const site = exactSite ?? await (async () => {
    const { data: fuzzy } = await service.from('sites').select('id, domain').ilike('domain', `%${domain}%`).limit(5)
    return (fuzzy || []).find((s: { domain: string }) => s.domain.endsWith(domain) || domain.endsWith(s.domain))
  })()
  if (!site) return NextResponse.json({ error: `未找到域名 "${domain}" 对应的站点，请先在站点管理中添加` }, { status: 404 })

  const today = getMYDate()

  let totalFound = 0
  let totalNew = 0

  const { pages, failReason } = await fetchBaiduIndexPages(domain)

  if (failReason === 'captcha' || failReason === 'http_error') {
    return NextResponse.json({ error: '百度返回安全验证或HTTP错误，抓取被拦截', failReason }, { status: 502 })
  }

  if (pages.length === 0) {
    return NextResponse.json({ found: 0, newCount: 0, domain, failReason: failReason ?? 'empty_results' })
  }

  totalFound = pages.length

  for (const chunk of chunkArray(pages, 500)) {
    const rows = chunk.map(p => ({
      site_id: site.id,
      url: p.url,
      title: p.title,
      snippet: p.snippet,
      baidu_date_str: p.baiduDateStr,
      first_seen_date: today,
      last_seen_date: today,
      disappeared_date: null,
      updated_at: new Date().toISOString(),
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (service.from('site_indexed_pages') as any).upsert(rows, {
      onConflict: 'site_id,url',
      ignoreDuplicates: false,
    }).select('first_seen_date')
    const inserted = ((res.data || []) as { first_seen_date: string }[])
    totalNew += inserted.filter(r => r.first_seen_date === today).length
  }

  return NextResponse.json({ found: totalFound, newCount: totalNew, domain: site.domain })
}
