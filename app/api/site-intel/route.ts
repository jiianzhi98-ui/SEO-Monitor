import { NextResponse } from 'next/server'
import { fetchAizhanData } from '@/lib/crawler'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const domain = searchParams.get('domain')?.trim()
  if (!domain) return NextResponse.json({ error: '缺少域名' }, { status: 400 })
  try {
    const data = await fetchAizhanData(domain)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ pc: 0, mobile: 0, indexCount: 0, pcIpMin: 0, pcIpMax: 0, pcIpAvg: 0, mobileIpMin: 0, mobileIpMax: 0, mobileIpAvg: 0 })
  }
}
