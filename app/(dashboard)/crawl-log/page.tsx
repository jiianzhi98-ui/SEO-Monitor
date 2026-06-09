'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface SiteRow {
  id: string
  domain: string
  name: string
  crawl_type: 'sitemap' | 'html' | 'rss'
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  list_url: string | null
  is_enabled: boolean
  enable_version_clean: boolean
  created_at: string
}

interface StatRow {
  site_id: string
  stat_date: string
  new_count: number
}

interface LogRow {
  id: string
  domain: string
  name: string
  crawlType: string
  frequency: string
  listUrl: string | null
  isEnabled: boolean
  versionClean: boolean
  lastCrawlDate: string | null
  lastCrawlCount: number | null
  totalDays: number
  createdAt: string
}

const crawlTypeLabel: Record<string, string> = {
  sitemap: 'Sitemap',
  html: 'HTML列表页',
  rss: 'RSS Feed',
}

const frequencyLabel: Record<string, string> = {
  daily: '每天',
  every3days: '每3天',
  weekly: '每周一',
}

const frequencyDesc: Record<string, string> = {
  daily: '每日 UTC 01:00（北京时间 09:00）自动执行',
  every3days: '从创建日起每满3天执行一次',
  weekly: '每周一 UTC 01:00（北京时间 09:00）执行',
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

      const [{ data: sitesRaw }, { data: statsRaw }] = await Promise.all([
        supabase.from('sites').select('*').order('created_at', { ascending: true }),
        supabase.from('daily_stats').select('site_id, stat_date, new_count').order('stat_date', { ascending: false }),
      ])

      const sites = (sitesRaw || []) as SiteRow[]
      const stats = (statsRaw || []) as StatRow[]

      const result: LogRow[] = sites.map((site) => {
        const siteStats = stats.filter((s) => s.site_id === site.id)
        const latest = siteStats[0] ?? null
        const totalDays = new Set(siteStats.map((s) => s.stat_date)).size

        return {
          id: site.id,
          domain: site.domain,
          name: site.name,
          crawlType: crawlTypeLabel[site.crawl_type] ?? site.crawl_type,
          frequency: frequencyLabel[site.crawl_frequency] ?? site.crawl_frequency,
          frequencyKey: site.crawl_frequency,
          listUrl: site.list_url,
          isEnabled: site.is_enabled,
          versionClean: site.enable_version_clean,
          lastCrawlDate: latest?.stat_date ?? null,
          lastCrawlCount: latest?.new_count ?? null,
          totalDays,
          createdAt: site.created_at.slice(0, 10),
        } as LogRow & { frequencyKey: string }
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
        <h1 className="text-2xl font-bold text-gray-900">抓取日志</h1>
        <p className="text-gray-500 text-sm mt-1">各站点抓取配置、频率设置及最近执行记录</p>
      </div>

      {/* Cron schedule info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 text-sm text-blue-700">
        <span className="font-medium">Cron 调度：</span>
        每天 UTC 01:00（北京时间 09:00）自动触发，根据各站点频率决定是否执行。Vercel Hobby 计划不支持自动 Cron，需外部服务定时调用
        <code className="ml-1 bg-blue-100 px-1.5 py-0.5 rounded text-xs">/api/cron</code>。
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
                  <th className="table-th">抓取频率</th>
                  <th className="table-th">执行时间规则</th>
                  <th className="table-th text-center">版本清洗</th>
                  <th className="table-th text-center">状态</th>
                  <th className="table-th text-right">最新抓取</th>
                  <th className="table-th text-right">最新新增词</th>
                  <th className="table-th text-right">累计抓取天数</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="table-td text-center text-gray-400 py-10">暂无数据</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const r = row as LogRow & { frequencyKey: string }
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td">
                          <div>
                            <p className="font-medium text-gray-900">{row.domain}</p>
                            <p className="text-xs text-gray-400">{row.name}</p>
                            <p className="text-xs text-gray-300 mt-0.5">创建于 {row.createdAt}</p>
                          </div>
                        </td>
                        <td className="table-td">
                          <span className="text-sm text-gray-700">{row.crawlType}</span>
                          {row.listUrl && (
                            <a
                              href={row.listUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-blue-500 hover:underline truncate max-w-[160px] mt-0.5"
                            >
                              {row.listUrl}
                            </a>
                          )}
                        </td>
                        <td className="table-td">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            r.frequencyKey === 'daily' ? 'bg-green-50 text-green-700' :
                            r.frequencyKey === 'every3days' ? 'bg-yellow-50 text-yellow-700' :
                            'bg-purple-50 text-purple-700'
                          }`}>
                            {row.frequency}
                          </span>
                        </td>
                        <td className="table-td text-xs text-gray-500 max-w-[200px]">
                          {frequencyDesc[r.frequencyKey]}
                        </td>
                        <td className="table-td text-center">
                          {row.versionClean ? (
                            <span className="text-green-600 text-xs font-medium">启用</span>
                          ) : (
                            <span className="text-gray-300 text-xs">关闭</span>
                          )}
                        </td>
                        <td className="table-td text-center">
                          {row.isEnabled ? (
                            <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs font-medium">启用</span>
                          ) : (
                            <span className="text-gray-400 bg-gray-100 px-2 py-0.5 rounded text-xs font-medium">停用</span>
                          )}
                        </td>
                        <td className="table-td text-right text-sm">
                          {row.lastCrawlDate ? (
                            <span className="text-gray-700">{row.lastCrawlDate}</span>
                          ) : (
                            <span className="text-gray-300">未执行</span>
                          )}
                        </td>
                        <td className="table-td text-right">
                          {row.lastCrawlCount !== null ? (
                            <span className="font-medium text-gray-900">{row.lastCrawlCount.toLocaleString()}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="table-td text-right">
                          <span className="text-gray-600">{row.totalDays} 天</span>
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
