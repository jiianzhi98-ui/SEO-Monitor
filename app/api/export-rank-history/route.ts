import { NextResponse } from 'next/server'
import { fetchRankdownWithTitle } from '@/lib/crawler'

export const maxDuration = 120

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')
  const date = searchParams.get('date')

  if (!domain || !date) {
    return NextResponse.json({ error: 'missing domain or date' }, { status: 400 })
  }

  const items = await fetchRankdownWithTitle(domain, date)
  return NextResponse.json({ items })
}
