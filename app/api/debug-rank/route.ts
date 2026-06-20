import { NextResponse } from 'next/server'
import { fetchRankChanges } from '@/lib/crawler'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain') || 'lbwbw.com'
  const type = (searchParams.get('type') || 'rankup') as 'rankup' | 'rankdown'
  const date = searchParams.get('date') || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)

  const start = Date.now()
  try {
    const entries = await fetchRankChanges(domain, date, type)
    const elapsed = Date.now() - start
    return NextResponse.json({
      domain, date, type,
      count: entries.length,
      elapsed_ms: elapsed,
      sample: entries.slice(0, 5),
    })
  } catch (err) {
    return NextResponse.json({ domain, date, type, error: String(err) }, { status: 500 })
  }
}
