import { NextResponse } from 'next/server'
import { fetchAizhanData } from '@/lib/crawler'
import { createServiceClient } from '@/lib/supabase-server'

function getMalaysiaDate(): string {
  const ms = Date.now() + 8 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain') || 'ddooo.com'
  const write = searchParams.get('write') === '1'

  const aizhanData = await fetchAizhanData(domain)
  const result: Record<string, unknown> = { domain, ...aizhanData }

  if (write) {
    const supabase = createServiceClient()
    const today = getMalaysiaDate()

    const { data: siteData, error: siteErr } = await supabase
      .from('sites').select('id').eq('domain', domain).single()

    if (siteErr || !siteData) {
      result.dbError = siteErr?.message || '找不到站点'
    } else {
      const siteId = (siteData as { id: string }).id
      const [wRes, iRes] = await Promise.all([
        (supabase.from('weight_history') as any).upsert(
          { site_id: siteId, record_date: today, pc_weight: aizhanData.pc, mobile_weight: aizhanData.mobile, pc_ip: aizhanData.pcIpMin, pc_ip_max: aizhanData.pcIpMax, mobile_ip: aizhanData.mobileIpMin, mobile_ip_max: aizhanData.mobileIpMax },
          { onConflict: 'site_id,record_date' }
        ),
        (supabase.from('index_snapshots') as any).upsert(
          { site_id: siteId, snapshot_date: today, index_count: aizhanData.indexCount },
          { onConflict: 'site_id,snapshot_date' }
        ),
      ])
      result.siteId = siteId
      result.date = today
      result.weightError = wRes.error?.message ?? null
      result.indexError = iRes.error?.message ?? null
      result.written = !wRes.error && !iRes.error
    }
  }

  return NextResponse.json(result)
}
