'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface CompetitorRow {
  site_id: string
  domain: string
  name: string
  today: number
  yesterday: number
  avg7d: number
  status: 'normal' | 'warning' | 'danger'
}

interface SiteRow {
  id: string
  domain: string
  name: string
}

interface StatRow {
  site_id: string
  stat_date: string
  new_count: number
}

interface Keyword {
  keyword: string
  source_url: string | null
  discovered_at: string
}

interface CleanedEntry {
  base: string
  variants: string[]
}

const statusConfig = {
  normal: { label: '正常', className: 'text-green-600 bg-green-50 px-2 py-0.5 rounded text-xs font-medium' },
  warning: { label: '偏低', className: 'text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded text-xs font-medium' },
  danger: { label: '异常', className: 'text-red-600 bg-red-50 px-2 py-0.5 rounded text-xs font-medium' },
}

// Client-side version of cleanTitle — strips standalone suffix from end of title
function cleanTitleClient(title: string, suffixes: string[]): string {
  if (suffixes.length === 0) return title
  const escaped = suffixes.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`\\s*(${escaped.join('|')})$`, 'i')
  return title.replace(pattern, '').replace(/\s{2,}/g, ' ').trim() || title
}

export default function CompetitorDailyPage() {
  const [rows, setRows] = useState<CompetitorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 昨日新词 modal
  const [selectedSite, setSelectedSite] = useState<CompetitorRow | null>(null)
  const [siteKeywords, setSiteKeywords] = useState<Keyword[]>([])
  const [kwLoading, setKwLoading] = useState(false)
  const [kwDate, setKwDate] = useState('')

  // 更新词库 modal
  const [cleanSite, setCleanSite] = useState<CompetitorRow | null>(null)
  const [cleanedEntries, setCleanedEntries] = useState<CleanedEntry[]>([])
  const [cleanLoading, setCleanLoading] = useState(false)

  function getMalaysiaDate(offsetDays = 0) {
    return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
  }

  function utcRangeForMalaysiaDate(date: string) {
    return {
      start: new Date(date + 'T00:00:00+08:00').toISOString(),
      end: new Date(date + 'T23:59:59.999+08:00').toISOString(),
    }
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()
      const today = new Date().toISOString().slice(0, 10)
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)

      const [{ data: sitesRaw }, { data: statsRaw }] = await Promise.all([
        supabase.from('sites').select('id, domain, name').eq('is_enabled', true),
        supabase.from('daily_stats').select('site_id, stat_date, new_count').gte('stat_date', d7ago),
      ])
      const sites = (sitesRaw || []) as SiteRow[]
      const stats = (statsRaw || []) as StatRow[]

      const result: CompetitorRow[] = (sites || []).map((site) => {
        const siteStats = stats.filter((s) => s.site_id === site.id)
        const todayStat = siteStats.find((s) => s.stat_date === today)
        const yesterdayStat = siteStats.find((s) => s.stat_date === yesterday)
        const avg7d = siteStats.length > 0
          ? Math.round(siteStats.reduce((sum, s) => sum + s.new_count, 0) / siteStats.length)
          : 0
        const todayVal = todayStat?.new_count ?? 0
        const yesterdayVal = yesterdayStat?.new_count ?? 0
        let status: 'normal' | 'warning' | 'danger' = 'normal'
        if (avg7d > 0) {
          const ratio = todayVal / avg7d
          if (ratio < 0.3) status = 'danger'
          else if (ratio < 0.6) status = 'warning'
        }
        return { site_id: site.id, domain: site.domain, name: site.name, today: todayVal, yesterday: yesterdayVal, avg7d, status }
      })

      setRows(result.sort((a, b) => b.today - a.today))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  async function fetchKeywordsForDate(site: CompetitorRow, date: string) {
    setKwLoading(true)
    setSiteKeywords([])
    try {
      const supabase = getBrowserClient()
      const { start, end } = utcRangeForMalaysiaDate(date)
      const { data, error: err } = await supabase
        .from('raw_keywords')
        .select('keyword, source_url, discovered_at')
        .eq('site_id', site.site_id)
        .gte('discovered_at', start)
        .lte('discovered_at', end)
        .order('discovered_at', { ascending: false })
        .limit(500)
      if (err) throw err
      setSiteKeywords(((data || []) as Keyword[]).filter((kw) => !kw.keyword.includes('电脑版')))
    } catch {
      setSiteKeywords([])
    } finally {
      setKwLoading(false)
    }
  }

  function viewYesterdayKeywords(site: CompetitorRow) {
    const date = getMalaysiaDate(-1)
    setSelectedSite(site)
    setKwDate(date)
    fetchKeywordsForDate(site, date)
  }

  function handleKwDateChange(date: string) {
    setKwDate(date)
    if (selectedSite) fetchKeywordsForDate(selectedSite, date)
  }

  async function viewCleanedKeywords(site: CompetitorRow) {
    setCleanSite(site)
    setCleanLoading(true)
    setCleanedEntries([])
    try {
      const supabase = getBrowserClient()
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [{ data: kwData }, { data: siteData }] = await Promise.all([
        supabase
          .from('raw_keywords')
          .select('keyword')
          .eq('site_id', site.site_id)
          .gte('discovered_at', since)
          .limit(500),
        supabase
          .from('sites')
          .select('enable_version_clean, version_suffixes')
          .eq('id', site.site_id)
          .single(),
      ])

      const suffixes: string[] = (siteData as { version_suffixes?: string[] } | null)?.version_suffixes ?? []
      const keywords = (kwData || []).map((r) => (r as { keyword: string }).keyword)

      // Group by cleaned base name
      const map = new Map<string, string[]>()
      for (const kw of keywords) {
        const base = cleanTitleClient(kw, suffixes)
        if (!map.has(base)) map.set(base, [])
        if (!map.get(base)!.includes(kw)) map.get(base)!.push(kw)
      }

      const entries: CleanedEntry[] = Array.from(map.entries())
        .map(([base, variants]) => ({ base, variants }))
        .sort((a, b) => b.variants.length - a.variants.length)

      setCleanedEntries(entries)
    } catch {
      setCleanedEntries([])
    } finally {
      setCleanLoading(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">竞品日收</h1>
        <p className="text-gray-500 text-sm mt-1">各站点每日新增关键词数量对比</p>
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
                  <th className="table-th text-right">今日新增</th>
                  <th className="table-th text-right">昨日新增</th>
                  <th className="table-th text-right">7日均值</th>
                  <th className="table-th text-center">状态</th>
                  <th className="table-th text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="table-td text-center text-gray-400 py-10">暂无数据</td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const s = statusConfig[row.status]
                    return (
                      <tr key={row.site_id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td">
                          <div>
                            <p className="font-medium text-gray-900">{row.domain}</p>
                            <p className="text-xs text-gray-400">{row.name}</p>
                          </div>
                        </td>
                        <td className="table-td text-right font-bold text-gray-900">{row.today.toLocaleString()}</td>
                        <td className="table-td text-right text-gray-600">{row.yesterday.toLocaleString()}</td>
                        <td className="table-td text-right text-gray-600">{row.avg7d.toLocaleString()}</td>
                        <td className="table-td text-center">
                          <span className={s.className}>{s.label}</span>
                        </td>
                        <td className="table-td text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => viewYesterdayKeywords(row)}
                              className="text-xs text-gray-500 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                            >
                              昨日新词
                            </button>
                            <button
                              onClick={() => viewCleanedKeywords(row)}
                              className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                            >
                              更新词库
                            </button>
                          </div>
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

      {/* 昨日新词 Modal */}
      {selectedSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900">{selectedSite.domain} · 新词</h3>
                <input
                  type="date"
                  value={kwDate}
                  max={getMalaysiaDate(0)}
                  onChange={(e) => handleKwDateChange(e.target.value)}
                  className="text-sm border border-gray-200 rounded px-2 py-0.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <button onClick={() => setSelectedSite(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {kwLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  加载中...
                </div>
              ) : siteKeywords.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">该日期暂无新词</p>
              ) : (
                <ul className="space-y-2">
                  {siteKeywords.map((kw, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-50">
                      <span className="text-sm text-gray-900">{kw.keyword}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(new Date(kw.discovered_at).getTime() + 8 * 3600000).toISOString().slice(5, 10).replace('-', '/')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 更新词库 Modal */}
      {cleanSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">{cleanSite.domain} · 更新词库</h3>
                <p className="text-xs text-gray-400 mt-0.5">昨日新词去重后的基础词条（按版本后缀归并）</p>
              </div>
              <button onClick={() => setCleanSite(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cleanLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  加载中...
                </div>
              ) : cleanedEntries.length === 0 ? (
                <p className="text-center text-gray-400 py-10 text-sm">暂无数据</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-gray-400 mb-3">共 {cleanedEntries.length} 个基础词条</p>
                  {cleanedEntries.map((entry, i) => (
                    <div key={i} className="py-2 border-b border-gray-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900">{entry.base}</span>
                        {entry.variants.length > 1 && (
                          <span className="text-xs text-blue-500 flex-shrink-0">{entry.variants.length} 个版本</span>
                        )}
                      </div>
                      {entry.variants.length > 1 && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{entry.variants.join('、')}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
