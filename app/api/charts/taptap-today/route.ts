import { NextResponse } from 'next/server'

const BASE = 'https://www.taptap.cn'
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
  const h = d.getUTCHours() + 8
  return `${String(h % 24).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseItem(x: any, dateLabel?: string) {
  const a = x.app_card_info ?? {}
  const score = a.stat?.rating?.score
  return {
    title: a.title ?? '',
    tag: x.sub_event_type_title ?? '',
    startDate: dateLabel ?? fmtDate(x.start_time),
    startTime: fmtTime(x.start_time),
    endDate: x.end_time ? fmtDate(x.end_time) : '',
    rating: score && parseFloat(score) > 0 ? parseFloat(score) : null,
    labels: (a.title_labels ?? []) as string[],
    icon: a.icon?.small_url ?? '',
  }
}

async function fetchAllUpcoming() {
  const results: ReturnType<typeof parseItem>[] = []
  let url: string | null = `${BASE}/webapiv2/calendar/v1/upcoming?${UA}&limit=10&type=1`
  let page = 0
  while (url && page < 10) {
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } })
    const json = await res.json()
    const data = json?.data ?? {}
    for (const dayGroup of data.list ?? []) {
      const dayLabel = fmtDate(dayGroup.day)
      for (const x of dayGroup.list ?? []) {
        results.push(parseItem(x, dayLabel))
      }
    }
    const nextPath: string = data.next_page ?? ''
    url = nextPath ? `${BASE}${nextPath}&${UA}` : null
    page++
  }
  return results
}

export async function GET() {
  try {
    const dayTs = todayDayTs()
    const [todayRes, upcomingGames, topRes] = await Promise.all([
      fetch(`${BASE}/webapiv2/calendar/v1/event-list?${UA}&day=${dayTs}`, { headers: HEADERS, next: { revalidate: 3600 } }),
      fetchAllUpcoming(),
      fetch(`${BASE}/webapiv2/calendar/v1/top-events?${UA}`, { headers: HEADERS, next: { revalidate: 3600 } }),
    ])

    const [todayJson, topJson] = await Promise.all([todayRes.json(), topRes.json()])
    const evData = todayJson?.data ?? {}
    const todayGames = [
      ...(evData.list_a ?? []),
      ...(evData.list_b ?? []),
      ...(evData.list_c ?? []),
    ].map((x) => parseItem(x))

    const topEvents = ((topJson?.data?.list ?? []) as object[]).map((x) => parseItem(x))

    return NextResponse.json({ todayGames, upcomingGames, topEvents })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
