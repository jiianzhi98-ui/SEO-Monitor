'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface IndexRow {
  site_id: string
  domain: string
  name: string
  today: number
  yesterday: number
  change: number
  changeRate: number
  status: 'normal' | 'warning' | 'danger'
}

interface SiteRow { id: string; domain: string; name: string }
interface SnapRow { site_id: string; index_count: number }

const statusConfig = {
  normal: { label: '正常', className: 'text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs font-medium' },
  warning: { label: '警告', className: 'text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded text-xs font-medium' },
  danger: { label: '危险', className: 'text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs font-medium' },
}

export default function IndexMonitorPage() {
  const [rows, setRows] = useState<IndexRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

      const [{ data: sitesRaw }, { data: snapTodayRaw }, { data: snapYesterdayRaw }] = await Promise.all([
        supabase.from('sites').select('id, domain, name').eq('is_enabled', true),
        supabase.from('index_snapshots').select('site_id, index_count').eq('snapshot_date', today),
        supabase.from('index_snapshots').select('site_id, index_count').eq('snapshot_date', yesterday),
      ])
      const sites = (sitesRaw || []) as SiteRow[]
      const snapToday = (snapTodayRaw || []) as SnapRow[]
      const snapYesterday = (snapYesterdayRaw || []) as SnapRow[]

      const todayMap = Object.fromEntries(snapToday.map((s) => [s.site_id, s.index_count]))
      const yesterdayMap = Object.fromEntries(snapYesterday.map((s) => [s.site_id, s.index_count]))

      const result: IndexRow[] = sites.map((site) => {
        const todayVal = todayMap[site.id] ?? 0
        const yesterdayVal = yesterdayMap[site.id] ?? 0
        const change = todayVal - yesterdayVal
        const changeRate = yesterdayVal > 0 ? change / yesterdayVal : 0

        let status: 'normal' | 'warning' | 'danger' = 'normal'
        if (changeRate < -0.2) status = 'danger'
        else if (changeRate < -0.1) status = 'warning'

        return { site_id: site.id, domain: site.domain, name: site.name, today: todayVal, yesterday: yesterdayVal, change, changeRate, status }
      })

      setRows(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">收录监控</h1>
        <p className="text-gray-500 text-sm mt-1">各站点Baidu/Google收录数量对比</p>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-3">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            加载中...
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-th">域名</th>
                  <th className="table-th text-right">今日收录</th>
                  <th className="table-th text-right">昨日收录</th>
                  <th className="table-th text-right">变化数</th>
                  <th className="table-th text-right">变化率</th>
                  <th className="table-th text-center">状态</th>
                  <th className="table-th text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-td text-center text-gray-400 py-10">暂无收录数据</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const s = statusConfig[row.status]
                    const isPositive = row.change >= 0
                    return (
                      <tr key={row.site_id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td">
                          <div>
                            <p className="font-medium text-gray-900">{row.domain}</p>
                            <p className="text-xs text-gray-400">{row.name}</p>
                          </div>
                        </td>
                        <td className="table-td text-right font-medium">{row.today.toLocaleString()}</td>
                        <td className="table-td text-right text-gray-600">{row.yesterday.toLocaleString()}</td>
                        <td className={`table-td text-right font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {isPositive ? '+' : ''}{row.change.toLocaleString()}
                        </td>
                        <td className={`table-td text-right text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                          {isPositive ? '+' : ''}{(row.changeRate * 100).toFixed(1)}%
                        </td>
                        <td className="table-td text-center">
                          <span className={s.className}>{s.label}</span>
                        </td>
                        <td className="table-td text-right">
                          <button
                            className="text-xs text-gray-500 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                            onClick={() => window.open(`https://www.baidu.com/s?wd=site:${row.domain}`, '_blank')}
                          >
                            查询
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
