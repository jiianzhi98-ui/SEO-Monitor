import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('sites')
      .select('domain')
      .eq('is_enabled', true)
      .order('focus_level', { ascending: true })
    if (error) throw error
    return NextResponse.json((data || []).map((s: { domain: string }) => s.domain))
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
