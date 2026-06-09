'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface SiteRow { id: string; domain: string; name: string }
interface HistoryRow {
  site_id: string
  record_date: string
  pc_weight: number
  mobile_weight: number
  pc_ip: number
  pc_ip_max: number
  mobile_ip: number
  mobile_ip_max: number
}

interface WeightRow {
  site_id: string
  domain: string
  name: string
  pcWeight: number
  mobileWeight: number
  pcWeightChange: number
  mobileWeightChange: number
  pcIpMin: number
  pcIpMax: number
  pcIpAvgChange: number
  mobileIpMin: number
  mobileIpMax: number
  mobileIpAvgChange: number
  trend: { date: string; pc: number }[]
}

function fmt(n: number) {
  return n.toLocaleString()
}

function WeightCell({ value, change }: { value: number; change: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className="text-lg tabular-nums font-medium text-gray-900">{value}</span>
      {change !== 0 && (
        <span className={`text-xs font-medium ${change > 0 ? 'text-green-600' : 'text-red-500'}`}>
          {change > 0 ? `+${change}` : change}
        </span>
      )}
    </div>
  )
}

function IpRangeCell({ min, max }: { min: number; max: number }) {
  if (min === 0 && max === 0) return <span className="text-gray-300 text-sm">-</span>
  return <span className="text-sm text-gray-800 tabular-nums">{fmt(min)} ~ {fmt(max)}</span>
}

function IpChangeCell({ change }: { change: number }) {
  if (change === 0) return <span className="text-gray-300 text-sm">-</span>
  return (
    <span className={`text-sm font-medium ${change > 0 ? 'text-green-600' : 'text-red-500'}`}>
      {change > 0 ? `+${fmt(change)}` : fmt(change)}
    </span>
  )
}

function Sparkline({ data }: { data: { date: string; pc: number }[] }) {
  if (data.length < 2) return <span className="text-gray-300 text-xs">暂无趋势</span>
  return (
    <ResponsiveContainer width={120} height={36}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="pc" stroke="#22c55e" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function WeightMonitorPage() {
  const [rows, setRows] = useState<WeightRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()
      const d30ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

      const [{ data: sitesRaw }, { data: historyRaw }] = await Promise.all([
        supabase.from('sites').select('id, domain, name').eq('is_enabled', true),
        supabase.from('weight_history')
          .select('site_id, record_date, pc_weight, mobile_weight, pc_ip, pc_ip_max, mobile_ip, mobile_ip_max')
          .gte('record_date', d30ago)
          .order('record_date', { ascending: true }),
      ])

      const sites = (sitesRaw || []) as SiteRow[]
      const history = (historyRaw || []) as HistoryRow[]

      const result: WeightRow[] = sites.map((site) => {
        // history is ascending by date
        const siteHistory = history.filter((h) => h.site_id === site.id)
        const latest = siteHistory.length > 0 ? siteHistory[siteHistory.length - 1] : null
        const prev = siteHistory.length > 1 ? siteHistory[siteHistory.length - 2] : null

        const latestAvgPc = latest ? Math.round((latest.pc_ip + latest.pc_ip_max) / 2) : 0
        const latestAvgMobile = latest ? Math.round((latest.mobile_ip + latest.mobile_ip_max) / 2) : 0
        const prevAvgPc = prev ? Math.round((prev.pc_ip + prev.pc_ip_max) / 2) : 0
        const prevAvgMobile = prev ? Math.round((prev.mobile_ip + prev.mobile_ip_max) / 2) : 0

        return {
          site_id: site.id,
          domain: site.domain,
          name: site.name,
          pcWeight: latest?.pc_weight ?? 0,
          mobileWeight: latest?.mobile_weight ?? 0,
          pcWeightChange: prev ? (latest?.pc_weight ?? 0) - prev.pc_weight : 0,
          mobileWeightChange: prev ? (latest?.mobile_weight ?? 0) - prev.mobile_weight : 0,
          pcIpMin: latest?.pc_ip ?? 0,
          pcIpMax: latest?.pc_ip_max ?? 0,
          pcIpAvgChange: prev ? latestAvgPc - prevAvgPc : 0,
          mobileIpMin: latest?.mobile_ip ?? 0,
          mobileIpMax: latest?.mobile_ip_max ?? 0,
          mobileIpAvgChange: prev ? latestAvgMobile - prevAvgMobile : 0,
          trend: siteHistory.map((h) => ({ date: h.record_date, pc: h.pc_weight })),
        }
      })

      setRows(result.sort((a, b) => b.pcWeight - a.pcWeight))
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
        <p className="text-gray-500 text-sm mt-1">各站点PC/移动端权重及来路IP区间，均值变化为与上次记录对比</p>
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
                  <th className="table-th text-center">PC来路IP</th>
                  <th className="table-th text-center">移动来路IP</th>
                  <th className="table-th text-center">PC均值变化</th>
                  <th className="table-th text-center">移动均值变化</th>
                  <th className="table-th text-center">30天趋势</th>
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
                        <WeightCell value={row.pcWeight} change={row.pcWeightChange} />
                      </td>
                      <td className="table-td text-center">
                        <WeightCell value={row.mobileWeight} change={row.mobileWeightChange} />
                      </td>
                      <td className="table-td text-center">
                        <IpRangeCell min={row.pcIpMin} max={row.pcIpMax} />
                      </td>
                      <td className="table-td text-center">
                        <IpRangeCell min={row.mobileIpMin} max={row.mobileIpMax} />
                      </td>
                      <td className="table-td text-center">
                        <IpChangeCell change={row.pcIpAvgChange} />
                      </td>
                      <td className="table-td text-center">
                        <IpChangeCell change={row.mobileIpAvgChange} />
                      </td>
                      <td className="table-td text-center">
                        <Sparkline data={row.trend} />
                      </td>
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
