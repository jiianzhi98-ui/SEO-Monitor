import { NextResponse } from 'next/server'
import { fetchAizhanData } from '@/lib/crawler'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain') || 'ddooo.com'
  try {
    const data = await fetchAizhanData(domain)
    return NextResponse.json({ domain, ...data })
  } catch (err) {
    return NextResponse.json({ domain, error: String(err) }, { status: 500 })
  }
}
