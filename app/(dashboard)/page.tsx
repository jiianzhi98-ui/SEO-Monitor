'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface StatCards {
  todayNewWords: number
  multiSiteWords: number
  indexAlertSites: number
  weightChangeSites: number
}

interface HotKeyword {
  id: string
  keyword: string
  site_count: number
  suggestion_count: number
  priority: 'urgent' | 'today' | 'queue'
  period_start: string
  period_end: string
}

const priorityLabel: Record<string, { label: string; className: string }> = {
  urgent: { label: '紧急', className: 'badge-urgent' },
  today: { label: '今日', className: 'badge-today' },
  queue: { label: '待处理', className: 'badge-queue' },
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatCards | null>(null)
  const [keywords, setKeywords] = useState<HotKeyword[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    async function load() {
      try {
        const supabase = getBrowserClient()

        // Today's hot keywords
        const { data: hotData, error: hotErr } = await supabase
          .from('hot_keywords')
          .select('*')
          .eq('period_start', today)
          .order('site_count', { ascending: false })
          .limit(20)
        if (hotErr) throw hotErr

        // Today's raw_keywords count (total)
        const { count: todayCount } = await supabase
          .from('raw_keywords')
          .select('*', { count: 'exact', head: true })
          .gte('discovered_at', today + 'T00:00:00')

        // Multi-site keywords (site_count > 1)
        const { count: multiCount } = await supabase
          .from('hot_keywords')
          .select('*', { count: 'exact', head: true })
          .eq('period_start', today)
          .gt('site_count', 1)

        // Index alert sites (placeholder — would compare snapshots)
        const { data: snapYesterday } = await supabase
          .from('index_snapshots')
          .select('site_id, index_count')
          .eq('snapshot_date', getPrevDate(1))

        const { data: snapToday } = await supabase
          .from('index_snapshots')
          .select('site_id, index_count')
          .eq('snapshot_date', today)

        let indexAlerts = 0
        if (snapYesterday && snapToday) {
          const mapYesterday = Object.fromEntries(snapYesterday.map((s) => [s.site_id, s.index_count]))
          for (const s of snapToday) {
            const prev = mapYesterday[s.site_id]
            if (prev && prev > 0 && (s.index_count - prev) / prev < -0.1) indexAlerts++
          }
        }

        // Weight change sites
        const { data: weightToday } = await supabase
          .from('weight_history')
          .select('site_id, pc_weight, mobile_weight')
          .eq('record_date', today)

        const { data: weightLastWeek } = await supabase
          .from('weight_history')
          .select('site_id, pc_weight, mobile_weight')
          .eq('record_date', getPrevDate(7))

        let weightChanges = 0
        if (weightToday && weightLastWeek) {
          const mapLastWeek = Object.fromEntries(weightLastWeek.map((w) => [w.site_id, w]))
          for (const w of weightToday) {
            const prev = mapLastWeek[w.site_id]
            if (prev && (w.pc_weight !== prev.pc_weight || w.mobile_weight !== prev.mobile_weight)) {
              weightChanges++
            }
          }
        }

        setStats({
          todayNewWords: todayCount ?? 0,
          multiSiteWords: multiCount ?? 0,
          indexAlertSites: indexAlerts,
          weightChangeSites: weightChanges,
        })
        setKeywords((hotData as HotKeyword[]) || [])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [today])

  function getPrevDate(days: number) {
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString().slice(0, 10)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          加载中...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">首页快报</h1>
        <p className="text-gray-500 text-sm mt-1">{today} · 今日数据汇总</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="今日新词总数" value={stats?.todayNewWords ?? 0} color="green" icon="📝" />
        <StatCard title="多站重复词数" value={stats?.multiSiteWords ?? 0} color="blue" icon="🔁" />
        <StatCard title="收录异常站数" value={stats?.indexAlertSites ?? 0} color="red" icon="⚠️" />
        <StatCard title="权重变动站数" value={stats?.weightChangeSites ?? 0} color="yellow" icon="📊" />
      </div>

      {/* Today's Hot Keywords */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">今日热词列表</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th w-12">排名</th>
                <th className="table-th">关键词</th>
                <th className="table-th text-center">出现站数</th>
                <th className="table-th text-center">下拉词数</th>
                <th className="table-th text-center">优先级</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {keywords.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-td text-center text-gray-400 py-10">
                    今日暂无热词数据
                  </td>
                </tr>
              ) : (
                keywords.map((kw, index) => {
                  const p = priorityLabel[kw.priority]
                  return (
                    <tr key={kw.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td text-gray-400 font-medium">{index + 1}</td>
                      <td className="table-td font-medium text-gray-900">{kw.keyword}</td>
                      <td className="table-td text-center">{kw.site_count}</td>
                      <td className="table-td text-center">{kw.suggestion_count}</td>
                      <td className="table-td text-center">
                        <span className={p.className}>{p.label}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  color,
  icon,
}: {
  title: string
  value: number
  color: 'green' | 'blue' | 'red' | 'yellow'
  icon: string
}) {
  const colors = {
    green: 'text-green-600 bg-green-50',
    blue: 'text-blue-600 bg-blue-50',
    red: 'text-red-600 bg-red-50',
    yellow: 'text-yellow-600 bg-yellow-50',
  }
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <span className={`text-2xl p-2 rounded-lg ${colors[color]}`}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm text-gray-500 mt-1">{title}</p>
    </div>
  )
}
