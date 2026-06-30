import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getMY(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

interface NewWordRow { keyword: string; site_count: number; total_count: number; sites: string[] }
interface RankWordRow { keyword: string; site_count: number; max_volume: number; sites: string[] }
interface StreakWordRow { keyword: string; domain: string; streak: number; volume: number }

export async function GET() {
  const supabase = createServiceClient()
  const since = getMY(-30)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const [{ data: newWordsRaw }, { data: rankWordsRaw }, { data: streakWordsRaw }] = await Promise.all([
    db.rpc('get_hot_new_words', { p_since: since }),
    db.rpc('get_hot_rank_words', { p_since: since }),
    db.rpc('get_hot_streak_words', { p_since: since }),
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

  const streakWords = ((streakWordsRaw || []) as StreakWordRow[]).map((r) => ({
    keyword: r.keyword,
    streak: Number(r.streak),
    domain: r.domain,
    volume: Number(r.volume),
  }))

  return NextResponse.json({ newWords, rankWords, streakWords })
}
