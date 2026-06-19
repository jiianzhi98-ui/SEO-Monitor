import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const exportAll = searchParams.get('export') === '1'

  const supabase = createServiceClient()

  let query = supabase
    .from('keyword_volume')
    .select('keyword, volume')
    .order('volume', { ascending: false })

  if (q) {
    query = query.ilike('keyword', `%${q}%`)
  }

  if (!exportAll) {
    query = query.limit(50)
  } else {
    query = query.limit(100000)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ keywords: data || [] })
}
