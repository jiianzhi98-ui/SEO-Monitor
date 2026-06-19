import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function getMalaysiaDate(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const siteId = searchParams.get('siteId') || ''
  if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 })

  const since = getMalaysiaDate(-30)
  const supabase = getSupabase()

  const { data } = await supabase
    .from('baidu_index_changes')
    .select('*')
    .eq('site_id', siteId)
    .gte('change_date', since)
    .order('change_date', { ascending: false })

  return NextResponse.json({ changes: data || [] })
}
