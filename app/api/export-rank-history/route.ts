import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { fetchRankdownWithTitle } from '@/lib/crawler'

export const maxDuration = 120

export async function GET(request: Request) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')
  const date = searchParams.get('date')

  if (!domain || !date) {
    return NextResponse.json({ error: 'missing domain or date' }, { status: 400 })
  }

  const items = await fetchRankdownWithTitle(domain, date)
  return NextResponse.json({ items })
}
