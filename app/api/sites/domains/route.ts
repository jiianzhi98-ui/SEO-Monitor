import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function GET() {
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
