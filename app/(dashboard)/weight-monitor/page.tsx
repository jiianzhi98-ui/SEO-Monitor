'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface WeightRow {
  site_id: string
  domain: string
  name: string
  pcToday: number
  mobileToday: number
  pcLastWeek: number
  mobileLastWeek: number
  pcChange: number
  mobileChange: number
  updatedAt: string
}

function WeightBadge({ value, change }: { value: number; change: number }) {
  const color =
    value >= 6 ? 'text-red-600 font-bold' :
    value >= 4 ? 'text-orange-500 font-semibold' :
    value >= 2 ? 'text-yellow-600' :
    'text-gray-400'

  return (
    <span className={`tabular-nums ${color}`}>{value}</span>
  )
}

function ChangeCell({ change }: { change: number }) {
  if (change === 0) return <span className="text-gray-400 text-sm">-</span>
  const isPos = change > 0
  return (
    <span className={`text-sm font-medium ${isPos ? 'text-green-600' : 'text-red-600'}`}>
      {isPos ? '↑' : '↓'}{Math.abs(change)}
    </span>
  )
}

export default function WeightMonitorPage() {
  const [rows, setRows] = useState<WeightRow[]>([])
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
      const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

      const [{ data: sites }, { data: weightToday }, { data: weightLastWeek }] = await Promise.all([
        supabase.from('sites').select('id, domain, name').eq('is_enabled', true),
        supabase.from('weight_history').select('site_id, pc_weight, mobile_weight, record_date').eq('record_date', today),
        supabase.from('weight_history').select('site_id, pc_weight, mobile_weight').eq('record_date', lastWeek),
      ])

      const todayMap = Object.fromEntries((weightToday || []).map((w) => [w.site_id, w]))
      const lastWeekMap = Object.fromEntries((weightLastWeek || []).map((w) => [w.site_id, w]))

      const result: WeightRow[] = (sites || []).map((site) => {
        const t = todayMap[site.id]
        const lw = lastWeekMap[site.id]
        return {
          site_id: site.id,
          domain: site.domain,
          name: site.name,
          pcToday: t?.pc_weight ?? 0,
          mobileToday: t?.mobile_weight ?? 0,
          pcLastWeek: lw?.pc_weight ?? 0,
          mobileLastWeek: lw?.mobile_weight ?? 0,
          pcChange: (t?.pc_weight ?? 0) - (lw?.pc_weight ?? 0),
          mobileChange: (t?.mobile_weight ?? 0) - (lw?.mobile_weight ?? 0),
          updatedAt: t?.record_date ?? '-',
        }
      })

      setRows(result.sort((a, b) => b.pcToday - a.pcToday))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">权重监控</h1>
        <p className="text-gray-500 text-sm mt-1">各站点PC/移动端权重及周变化</p>
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
                  <th className="table-th text-center">PC权重</th>
                  <th className="table-th text-center">移动权重</th>
                  <th className="table-th text-center">上周PC</th>
                  <th className="table-th text-center">上周移动</th>
                  <th className="table-th text-center">PC变化</th>
                  <th className="table-th text-center">移动变化</th>
                  <th className="table-th text-center">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-td text-center text-gray-400 py-10">暂无权重数据</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.site_id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td">
                        <div>
                          <p className="font-medium text-gray-900">{row.domain}</p>
                          <p className="text-xs text-gray-400">{row.name}</p>
                        </div>
                      </td>
                      <td className="table-td text-center">
                        <WeightBadge value={row.pcToday} change={row.pcChange} />
                      </td>
                      <td className="table-td text-center">
                        <WeightBadge value={row.mobileToday} change={row.mobileChange} />
                      </td>
                      <td className="table-td text-center text-gray-500">{row.pcLastWeek}</td>
                      <td className="table-td text-center text-gray-500">{row.mobileLastWeek}</td>
                      <td className="table-td text-center">
                        <ChangeCell change={row.pcChange} />
                      </td>
                      <td className="table-td text-center">
                        <ChangeCell change={row.mobileChange} />
                      </td>
                      <td className="table-td text-center text-xs text-gray-400">{row.updatedAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
