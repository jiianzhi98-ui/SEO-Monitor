import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const maxDuration = 30

function getMY(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

interface NewWordRow { keyword: string; site_count: number; total_count: number; sites: string[] }
interface RankWordRow { keyword: string; site_count: number; max_volume: number; sites: string[] }

export async function GET() {
  const supabase = createServiceClient()
  const since = getMY(-30)

  const [{ data: newWordsRaw }, { data: rankWordsRaw }] = await Promise.all([
    supabase.rpc('get_hot_new_words', { p_since: since }),
    supabase.rpc('get_hot_rank_words', { p_since: since }),
  ])

  const newWords = ((newWordsRaw || []) as NewWordRow[]).map((r) => ({
    keyword: r.keyword,
    count: Number(r.total_count),
    siteCount: Number(r.site_count),
    sites: r.sites || [],
  }))

  const rankWords = ((rankWordsRaw || []) as RankWordRow[]).map((r) => ({
    keyword: r.keyword,
    siteCount: Number(r.site_count),
    volume: Number(r.max_volume),
    sites: r.sites || [],
  }))

  return NextResponse.json({ newWords, rankWords })
}
