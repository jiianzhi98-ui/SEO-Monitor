import { NextResponse } from 'next/server'

const UA = 'V%3D1%26PN%3DWebApp%26LANG%3Dzh_CN%26VN_CODE%3D102%26LOC%3DCN%26PLT%3DPC%26DS%3DAndroid'
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

function todayDayTs(): number {
  const now = new Date()
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000)
}

function fmtDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}

function fmtTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const h = d.getUTCHours() + 8 // CST offset
  return `${String(h % 24).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseItem(x: any) {
  const a = x.app_card_info ?? {}
  const score = a.stat?.rating?.score
  return {
    title: a.title ?? '',
    tag: x.sub_event_type_title ?? '',
    startDate: fmtDate(x.start_time),
    startTime: fmtTime(x.start_time),
    endDate: x.end_time ? fmtDate(x.end_time) : '',
    rating: score && parseFloat(score) > 0 ? parseFloat(score) : null,
    labels: (a.title_labels ?? []) as string[],
    icon: a.icon?.small_url ?? '',
  }
}

export async function GET() {
  try {
    const dayTs = todayDayTs()
    const [evRes, topRes] = await Promise.all([
      fetch(`https://www.taptap.cn/webapiv2/calendar/v1/event-list?X-UA=${UA}&day=${dayTs}`, { headers: HEADERS, next: { revalidate: 3600 } }),
      fetch(`https://www.taptap.cn/webapiv2/calendar/v1/top-events?X-UA=${UA}`, { headers: HEADERS, next: { revalidate: 3600 } }),
    ])
    const [evJson, topJson] = await Promise.all([evRes.json(), topRes.json()])

    const evData = evJson?.data ?? {}
    const todayGames = [
      ...(evData.list_a ?? []),
      ...(evData.list_b ?? []),
      ...(evData.list_c ?? []),
    ].map(parseItem)

    const topEvents = ((topJson?.data?.list ?? []) as object[]).map(parseItem)

    return NextResponse.json({ todayGames, topEvents, total: evData.game_total ?? todayGames.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
