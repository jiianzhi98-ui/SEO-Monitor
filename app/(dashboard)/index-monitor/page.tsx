'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface SiteRow { id: string; domain: string; name: string }
interface SnapRow { site_id: string; snapshot_date: string; index_count: number }

interface IndexRow {
  site_id: string
  domain: string
  name: string
  latest: number
  weekAgo: number
  weeklyChange: number
  weeklyRate: number
  trend: { date: string; count: number }[]
  status: 'normal' | 'warning' | 'danger'
}

const statusConfig = {
  normal: { label: '正常', className: 'text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs font-medium' },
  warning: { label: '警告', className: 'text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded text-xs font-medium' },
  danger: { label: '危险', className: 'text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs font-medium' },
}

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  if (data.length < 2) return <span className="text-gray-300 text-xs">暂无趋势</span>
  return (
    <ResponsiveContainer width={120} height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function IndexMonitorPage() {
  const [rows, setRows] = useState<IndexRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSite, setSelectedSite] = useState<IndexRow | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()
      const d30ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
      const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

      const [{ data: sitesRaw }, { data: snapsRaw }] = await Promise.all([
        supabase.from('sites').select('id, domain, name').eq('is_enabled', true),
        supabase.from('index_snapshots')
          .select('site_id, snapshot_date, index_count')
          .gte('snapshot_date', d30ago)
          .order('snapshot_date', { ascending: true }),
      ])

      const sites = (sitesRaw || []) as SiteRow[]
      const snaps = (snapsRaw || []) as SnapRow[]

      const result: IndexRow[] = sites.map((site) => {
        const siteSnaps = snaps.filter((s) => s.site_id === site.id)
        const trend = siteSnaps.map((s) => ({ date: s.snapshot_date.slice(5), count: s.index_count }))

        const latest = siteSnaps.length > 0 ? siteSnaps[siteSnaps.length - 1].index_count : 0
        const snap7 = siteSnaps.find((s) => s.snapshot_date <= d7ago)
        const weekAgo = snap7 ? snap7.index_count : 0
        const weeklyChange = latest - weekAgo
        const weeklyRate = weekAgo > 0 ? weeklyChange / weekAgo : 0

        let status: 'normal' | 'warning' | 'danger' = 'normal'
        if (weeklyRate < -0.2) status = 'danger'
        else if (weeklyRate < -0.1) status = 'warning'

        return { site_id: site.id, domain: site.domain, name: site.name, latest, weekAgo, weeklyChange, weeklyRate, trend, status }
      })

      setRows(result.sort((a, b) => b.latest - a.latest))
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
        <p className="text-gray-500 text-sm mt-1">各站点百度收录每日快照，周变化趋势</p>
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
                  <th className="table-th text-right">当前收录</th>
                  <th className="table-th text-right">7天前</th>
                  <th className="table-th text-right">周变化</th>
                  <th className="table-th text-right">变化率</th>
                  <th className="table-th text-center">30天趋势</th>
                  <th className="table-th text-center">状态</th>
                  <th className="table-th text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-td text-center text-gray-400 py-10">暂无收录数据</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const s = statusConfig[row.status]
                    const isPos = row.weeklyChange >= 0
                    return (
                      <tr key={row.site_id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td">
                          <div>
                            <p className="font-medium text-gray-900">{row.domain}</p>
                            <p className="text-xs text-gray-400">{row.name}</p>
                          </div>
                        </td>
                        <td className="table-td text-right font-bold text-gray-900">{row.latest.toLocaleString()}</td>
                        <td className="table-td text-right text-gray-500">{row.weekAgo > 0 ? row.weekAgo.toLocaleString() : '-'}</td>
                        <td className={`table-td text-right font-medium ${isPos ? 'text-green-600' : 'text-red-600'}`}>
                          {row.weekAgo > 0 ? (isPos ? '+' : '') + row.weeklyChange.toLocaleString() : '-'}
                        </td>
                        <td className={`table-td text-right text-sm ${isPos ? 'text-green-600' : 'text-red-600'}`}>
                          {row.weekAgo > 0 ? (isPos ? '+' : '') + (row.weeklyRate * 100).toFixed(1) + '%' : '-'}
                        </td>
                        <td className="table-td text-center">
                          <Sparkline data={row.trend} />
                        </td>
                        <td className="table-td text-center">
                          <span className={s.className}>{s.label}</span>
                        </td>
                        <td className="table-td text-right">
                          <button
                            onClick={() => setSelectedSite(row)}
                            className="text-xs text-gray-500 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                          >
                            详情
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

      {/* Detail Chart Modal */}
      {selectedSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedSite.domain} · 收录趋势</h3>
                <p className="text-xs text-gray-400 mt-0.5">近30天百度收录变化</p>
              </div>
              <button onClick={() => setSelectedSite(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="flex gap-6 mb-4 text-sm">
                <div><span className="text-gray-400">当前收录</span><p className="text-xl font-bold text-gray-900">{selectedSite.latest.toLocaleString()}</p></div>
                <div><span className="text-gray-400">周变化</span><p className={`text-xl font-bold ${selectedSite.weeklyChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>{selectedSite.weekAgo > 0 ? (selectedSite.weeklyChange >= 0 ? '+' : '') + selectedSite.weeklyChange.toLocaleString() : '-'}</p></div>
              </div>
              {selectedSite.trend.length >= 2 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={selectedSite.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={(v) => v >= 10000 ? (v / 10000).toFixed(1) + 'w' : v} />
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">数据积累中，每天跑 cron 后会有更多数据点</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
