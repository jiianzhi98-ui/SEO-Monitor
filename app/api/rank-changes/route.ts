import { NextResponse } from 'next/server'
import { fetchRankChanges } from '@/lib/crawler'

// On-demand endpoint (used for manual refresh or backfill)
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

  const entries = await fetchRankChanges(domain, date, type as 'rankup' | 'rankdown')
  return NextResponse.json(entries.sort((a, b) => b.volume - a.volume))
}
