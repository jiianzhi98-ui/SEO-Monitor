import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain')
  const tab = searchParams.get('tab') || 'keywords'
  const defaultDate = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10)
  const date = searchParams.get('date') || defaultDate

  if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  const { data: site } = await service
    .from('sites')
    .select('id, domain, has_rank_title')
    .eq('domain', domain)
    .single()

  if (!site) {
    return NextResponse.json({ site: null, date, keywords: [], rankup: [], rankdown: [] })
  }

  if (tab === 'keywords') {
    const { data: keywords } = await service
      .from('raw_keywords')
      .select('keyword, search_volume, source')
      .eq('site_id', site.id)
      .eq('content_date', date)
      .order('search_volume', { ascending: false })
      .limit(300)

    return NextResponse.json({ site, date, keywords: keywords || [], rankup: [], rankdown: [] })
  }

  if (tab === 'ranks') {
    const { data: rows } = await service
      .from('site_rank_keywords')
      .select('keyword, volume, rank_position, title, type')
      .eq('site_id', site.id)
      .eq('platform', 'mobile')
      .eq('stat_date', date)
      .gt('volume', 0)
      .order('volume', { ascending: false })
      .limit(500)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rankup = (rows || []).filter((r: any) => r.type === 'rankup')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rankdown = (rows || []).filter((r: any) => r.type === 'rankdown')

    return NextResponse.json({ site, date, keywords: [], rankup, rankdown })
  }

  return NextResponse.json({ site, date, keywords: [], rankup: [], rankdown: [] })
}
