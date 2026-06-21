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

async function safeFetch(url: string) {
  const res = await fetch(url, { headers: HEADERS, cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchTodayGames() {
  try {
    const dayTs = todayDayTs()
    const json = await safeFetch(`${BASE}/webapiv2/calendar/v1/event-list?${UA}&day=${dayTs}`)
    const evData = json?.data ?? {}
    return [
      ...(evData.list_a ?? []),
      ...(evData.list_b ?? []),
      ...(evData.list_c ?? []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ].map((x: any) => parseItem(x))
  } catch {
    return []
  }
}

async function fetchTopEvents() {
  try {
    const json = await safeFetch(`${BASE}/webapiv2/calendar/v1/top-events?${UA}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((json?.data?.list ?? []) as any[]).map((x) => parseItem(x))
  } catch {
    return []
  }
}

async function fetchAllUpcoming() {
  try {
    const results: ReturnType<typeof parseItem>[] = []
    let url: string | null = `${BASE}/webapiv2/calendar/v1/upcoming?${UA}&limit=10&type=1`
    let page = 0
    while (url && page < 10) {
      const json = await safeFetch(url)
      const data = json?.data ?? {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const dayGroup of data.list ?? [] as any[]) {
        const dayLabel = fmtDate(dayGroup.day)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const x of dayGroup.list ?? [] as any[]) {
          results.push(parseItem(x, dayLabel))
        }
      }
      const nextPath: string = data.next_page ?? ''
      url = nextPath ? `${BASE}${nextPath}&${UA}` : null
      page++
    }
    return results
  } catch {
    return []
  }
}

export async function GET() {
  const [todayGames, upcomingGames, topEvents] = await Promise.all([
    fetchTodayGames(),
    fetchAllUpcoming(),
    fetchTopEvents(),
  ])
  return NextResponse.json({ todayGames, upcomingGames, topEvents })
}
