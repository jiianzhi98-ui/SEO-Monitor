import { NextResponse } from 'next/server'
import { fetchAizhanData } from '@/lib/crawler'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain') || 'baidu.com'
  const result = await fetchAizhanData(domain)
  return NextResponse.json({ domain, ...result })
}
