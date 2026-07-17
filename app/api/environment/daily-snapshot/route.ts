export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

// 中国大陆法定节假日（不含调休）2025-2027
// 更新方式：每年国务院通知发布后在此追加
const PUBLIC_HOLIDAYS = new Set([
  // 2025
  '2025-01-01',
  '2025-01-28','2025-01-29','2025-01-30','2025-01-31','2025-02-01','2025-02-02','2025-02-03',
  '2025-04-04','2025-04-05','2025-04-06',
  '2025-05-01','2025-05-02','2025-05-03','2025-05-04','2025-05-05',
  '2025-05-31','2025-06-01','2025-06-02',
  '2025-10-01','2025-10-02','2025-10-03','2025-10-04','2025-10-05','2025-10-06','2025-10-07','2025-10-08',
  // 2026
  '2026-01-01',
  '2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-21','2026-02-22','2026-02-23',
  '2026-04-05','2026-04-06',
  '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05',
  '2026-06-19','2026-06-20','2026-06-21',
  '2026-09-25','2026-09-26','2026-09-27',
  '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07',
  // 2027
  '2027-01-01',
  '2027-02-06','2027-02-07','2027-02-08','2027-02-09','2027-02-10','2027-02-11','2027-02-12',
  '2027-04-05',
  '2027-05-01','2027-05-02','2027-05-03','2027-05-04','2027-05-05',
  '2027-07-09','2027-07-10','2027-07-11',
  '2027-09-15','2027-09-16','2027-09-17',
  '2027-10-01','2027-10-02','2027-10-03','2027-10-04','2027-10-05','2027-10-06','2027-10-07',
])

// 学生放假期间（近似，按国内学制）
function isSchoolHoliday(dateStr: string): boolean {
  const d = new Date(dateStr + 'T00:00:00Z')
  const m = d.getMonth() + 1
  const day = d.getDate()
  if (m === 7 || m === 8) return true          // 暑假
  if (m === 1 && day >= 20) return true         // 寒假开始（约1月20日后）
  if (m === 2) return true                      // 寒假（含春节）
  if (PUBLIC_HOLIDAYS.has(dateStr)) return true // 法定假日同步放假
  return false
}

async function handler(req: Request) {
  // 支持 Bearer CRON_SECRET（GitHub Actions 调用）或 admin/super 用户 session
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  let authed = !!(cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!authed) {
    const authClient = createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any
    const { data: profile } = await svc.from('user_profiles').select('role').eq('id', user.id).single()
    if (['super', 'admin'].includes(profile?.role)) authed = true
  }
  if (!authed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any

  // 目标日期：MYT 当前日期的前一天（抓取完成后才跑）
  // 支持 ?date=YYYY-MM-DD 手动指定
  const url = new URL(req.url)
  const targetDate = url.searchParams.get('date') ?? (() => {
    const myt = new Date(Date.now() + 8 * 3600000)
    myt.setDate(myt.getDate() - 1)
    return myt.toISOString().slice(0, 10)
  })()

  const prevDate = (() => {
    const d = new Date(targetDate + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  // 并行查询
  const [rankRes, todayIndexRes, prevIndexRes] = await Promise.all([
    // 全站当日涨跌词数
    service
      .from('rank_changes')
      .select('type, site_id')
      .eq('stat_date', targetDate),

    // 当日各站收录数
    service
      .from('index_snapshots')
      .select('site_id, index_count')
      .eq('snapshot_date', targetDate),

    // 前日各站收录数（用于计算变化率）
    service
      .from('index_snapshots')
      .select('site_id, index_count')
      .eq('snapshot_date', prevDate),
  ])

  // 计算排名信号
  const rankRows: { type: string; site_id: string }[] = rankRes.data ?? []
  const total_rankup   = rankRows.filter(r => r.type === 'rankup').length
  const total_rankdown = rankRows.filter(r => r.type === 'rankdown').length
  const sites_with_rank_data = new Set(rankRows.map(r => r.site_id)).size
  const crawl_anomaly = total_rankup + total_rankdown === 0

  // 计算收录变化率
  const todayMap = new Map<string, number>(
    (todayIndexRes.data ?? []).map((r: { site_id: string; index_count: number }) => [r.site_id, r.index_count])
  )
  const prevMap = new Map<string, number>(
    (prevIndexRes.data ?? []).map((r: { site_id: string; index_count: number }) => [r.site_id, r.index_count])
  )

  let changeSum = 0, changeCount = 0
  for (const [siteId, todayCount] of Array.from(todayMap)) {
    const prevCount = prevMap.get(siteId)
    if (prevCount && prevCount > 0) {
      changeSum += (todayCount - prevCount) / prevCount * 100
      changeCount++
    }
  }
  const avg_index_change_pct = changeCount > 0
    ? Math.round(changeSum / changeCount * 100) / 100
    : null
  const sites_with_index_data = todayMap.size

  // 日期属性
  const d = new Date(targetDate + 'T00:00:00')
  const weekday = d.getDay() // 0=周日
  const is_holiday = PUBLIC_HOLIDAYS.has(targetDate)
  const is_school_holiday = isSchoolHoliday(targetDate)

  // 写入（upsert，重复日期不报错）
  const { error } = await service.from('environment_daily').upsert({
    date: targetDate,
    weekday,
    is_holiday,
    is_school_holiday,
    total_rankup,
    total_rankdown,
    sites_with_rank_data,
    avg_index_change_pct,
    sites_with_index_data,
    crawl_anomaly,
  }, { onConflict: 'date' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    date: targetDate,
    weekday,
    is_holiday,
    is_school_holiday,
    total_rankup,
    total_rankdown,
    sites_with_rank_data,
    avg_index_change_pct,
    sites_with_index_data,
    crawl_anomaly,
  })
}

export const GET  = handler
export const POST = handler
