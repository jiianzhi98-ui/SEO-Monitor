'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface SiteRow {
  id: string
  domain: string
  name: string
  crawl_type: 'sitemap' | 'html' | 'rss'
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  is_enabled: boolean
}

interface LogRow {
  id: string
  domain: string
  name: string
  crawlType: string
  lastContentDate: string | null
  lastIndexDate: string | null
  lastWeightDate: string | null
}

const crawlTypeLabel: Record<string, string> = {
  sitemap: 'Sitemap',
  html: 'HTML列表页',
  rss: 'RSS Feed',
}

export default function CrawlLogPage() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()

      const [
        { data: sitesRaw },
        { data: statsRaw },
        { data: indexRaw },
        { data: weightRaw },
      ] = await Promise.all([
        supabase.from('sites').select('id, domain, name, crawl_type, crawl_frequency, is_enabled').order('created_at', { ascending: true }),
        supabase.from('daily_stats').select('site_id, stat_date').order('stat_date', { ascending: false }),
        supabase.from('index_snapshots').select('site_id, snapshot_date').order('snapshot_date', { ascending: false }),
        supabase.from('weight_history').select('site_id, record_date').order('record_date', { ascending: false }),
      ])

      const sites = (sitesRaw || []) as SiteRow[]

      const latestStat = new Map<string, string>()
      for (const r of (statsRaw || []) as { site_id: string; stat_date: string }[]) {
        if (!latestStat.has(r.site_id)) latestStat.set(r.site_id, r.stat_date)
      }

      const latestIndex = new Map<string, string>()
      for (const r of (indexRaw || []) as { site_id: string; snapshot_date: string }[]) {
        if (!latestIndex.has(r.site_id)) latestIndex.set(r.site_id, r.snapshot_date)
      }

      const latestWeight = new Map<string, string>()
      for (const r of (weightRaw || []) as { site_id: string; record_date: string }[]) {
        if (!latestWeight.has(r.site_id)) latestWeight.set(r.site_id, r.record_date)
      }

      const result: LogRow[] = sites.map((site) => ({
        id: site.id,
        domain: site.domain,
        name: site.name,
        crawlType: crawlTypeLabel[site.crawl_type] ?? site.crawl_type,
        lastContentDate: latestStat.get(site.id) ?? null,
        lastIndexDate: latestIndex.get(site.id) ?? null,
        lastWeightDate: latestWeight.get(site.id) ?? null,
      }))

      setRows(result)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  function DateCell({ date }: { date: string | null }) {
    if (!date) return <span className="text-gray-300 text-sm">未抓取</span>
    return <span className="text-sm text-gray-700">{date}</span>
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">抓取日志</h1>
        <p className="text-gray-500 text-sm mt-1">各站点抓取方式及最近一次数据更新时间</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-700">
        每天 <span className="font-medium">05:00~08:00</span> 随机执行；
        网站新增内容抓取<span className="font-medium">前一天</span>的数据，
        收录数与权重为<span className="font-medium">当天最新快照</span>。
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
                  <th className="table-th">站点</th>
                  <th className="table-th">抓取方式</th>
                  <th className="table-th text-center">更新抓取时间</th>
                  <th className="table-th text-center">收录抓取时间</th>
                  <th className="table-th text-center">权重抓取时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-td text-center text-gray-400 py-10">暂无数据</td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-td">
                        <p className="font-medium text-gray-900">{row.domain}</p>
                        <p className="text-xs text-gray-400">{row.name}</p>
                      </td>
                      <td className="table-td text-sm text-gray-700">{row.crawlType}</td>
                      <td className="table-td text-center"><DateCell date={row.lastContentDate} /></td>
                      <td className="table-td text-center"><DateCell date={row.lastIndexDate} /></td>
                      <td className="table-td text-center"><DateCell date={row.lastWeightDate} /></td>
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
