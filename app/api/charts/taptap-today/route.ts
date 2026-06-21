import { NextResponse } from 'next/server'

const UA = 'V%3D1%26PN%3DWebApp%26LANG%3Dzh_CN%26VN_CODE%3D102%26LOC%3DCN%26PLT%3DPC%26DS%3DAndroid'
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
}

function dayTs(offsetDays = 0): number {
  const now = new Date()
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000) + offsetDays * 86400
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

async function fetchDay(offset: number) {
  const ts = dayTs(offset)
  const res = await fetch(`https://www.taptap.cn/webapiv2/calendar/v1/event-list?X-UA=${UA}&day=${ts}`, { headers: HEADERS, next: { revalidate: 3600 } })
  const json = await res.json()
  const data = json?.data ?? {}
  const label = fmtDate(ts + 1) // display date (+1 because UTC midnight = CST 08:00 same day)
  return [
    ...(data.list_a ?? []),
    ...(data.list_b ?? []),
    ...(data.list_c ?? []),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ].map((x: any) => parseItem(x, label))
}

export async function GET() {
  try {
    const [todayGames, day1, day2, day3, topRes] = await Promise.all([
      fetchDay(0),
      fetchDay(1),
      fetchDay(2),
      fetchDay(3),
      fetch(`https://www.taptap.cn/webapiv2/calendar/v1/top-events?X-UA=${UA}`, { headers: HEADERS, next: { revalidate: 3600 } }),
    ])

    const topJson = await topRes.json()
    const topEvents = ((topJson?.data?.list ?? []) as object[]).map((x) => parseItem(x))

    const upcomingGames = [...day1, ...day2, ...day3]

    return NextResponse.json({ todayGames, upcomingGames, topEvents })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
