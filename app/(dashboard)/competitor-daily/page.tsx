'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'

interface CompetitorRow {
  site_id: string
  domain: string
  name: string
  focus_level: number
  yesterday: number
  avg7d: number
  status: 'normal' | 'warning' | 'danger'
  hasHtml: boolean
}

interface SiteRow {
  id: string
  domain: string
  name: string
  focus_level: number
  list_url: string | null
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
  content_date: string | null
}

interface CleanedEntry {
  base: string
  variants: string[]
}

interface RankEntry {
  keyword: string
  volume: number
}

interface UnstableEntry {
  keyword: string
  volume: number
  upDays: number
  downDays: number
  totalDays: number
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
  const [expandedBases, setExpandedBases] = useState<Set<string>>(new Set())

  // 排名变动 modal
  const [rankSite, setRankSite] = useState<CompetitorRow | null>(null)
  const [rankType, setRankType] = useState<'rankup' | 'rankdown'>('rankup')
  const [rankDate, setRankDate] = useState('')
  const [rankData, setRankData] = useState<RankEntry[]>([])
  const [rankLoading, setRankLoading] = useState(false)
  const [rankUnstableSet, setRankUnstableSet] = useState<Set<string>>(new Set())

  // 不稳定词 modal
  const [unstableSite, setUnstableSite] = useState<CompetitorRow | null>(null)
  const [unstableData, setUnstableData] = useState<UnstableEntry[]>([])
  const [unstableLoading, setUnstableLoading] = useState(false)

  // 收录 modal
  const [indexSite, setIndexSite] = useState<CompetitorRow | null>(null)
  const [indexPeriod, setIndexPeriod] = useState<'day' | 'week' | 'month'>('day')
  const [indexTitles, setIndexTitles] = useState<string[]>([])
  const [indexLoading, setIndexLoading] = useState(false)

  function getMalaysiaDate(offsetDays = 0) {
    return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
  }

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const supabase = getBrowserClient()
      const yesterday = getMalaysiaDate(-1)
      const d7ago = getMalaysiaDate(-7)

      const [{ data: sitesRaw }, { data: statsRaw }] = await Promise.all([
        supabase.from('sites').select('id, domain, name, focus_level, list_url').eq('is_enabled', true),
        supabase.from('daily_stats').select('site_id, stat_date, new_count').gte('stat_date', d7ago),
      ])
      const sites = (sitesRaw || []) as SiteRow[]
      const stats = (statsRaw || []) as StatRow[]

      const result: CompetitorRow[] = (sites || []).map((site) => {
        const siteStats = stats.filter((s) => s.site_id === site.id)
        const yesterdayStat = siteStats.find((s) => s.stat_date === yesterday)
        const avg7d = siteStats.length > 0
          ? Math.round(siteStats.reduce((sum, s) => sum + s.new_count, 0) / siteStats.length)
          : 0
        const yesterdayVal = yesterdayStat?.new_count ?? 0
        let status: 'normal' | 'warning' | 'danger' = 'normal'
        if (avg7d > 0) {
          const ratio = yesterdayVal / avg7d
          if (ratio < 0.3) status = 'danger'
          else if (ratio < 0.6) status = 'warning'
        }
        return { site_id: site.id, domain: site.domain, name: site.name, focus_level: site.focus_level ?? 3, yesterday: yesterdayVal, avg7d, status, hasHtml: !!site.list_url }
      })

      setRows(result.sort((a, b) => a.focus_level - b.focus_level || b.yesterday - a.yesterday))
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
      const { data, error: err } = await supabase
        .from('raw_keywords')
        .select('keyword, source_url, discovered_at, content_date')
        .eq('site_id', site.site_id)
        .eq('content_date', date)
        .order('keyword', { ascending: true })
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
      const since = new Date(Date.now() - 30 * 86400000).toISOString()

      const { data: kwData } = await supabase
        .from('raw_keywords')
        .select('keyword')
        .eq('site_id', site.site_id)
        .gte('discovered_at', since)
        .limit(5000)

      // Deduplicate across days, filter 电脑版, sort shortest first for prefix matching
      const keywords = Array.from(
        new Set(
          ((kwData || []) as { keyword: string }[])
            .map((r) => r.keyword)
            .filter((k) => !k.includes('电脑版'))
        )
      ).sort((a, b) => a.length - b.length)

      // Auto-group by prefix: if keyword A is a prefix of keyword B, they belong to the same group
      const groups = new Map<string, string[]>()
      for (const k of keywords) {
        let matched = false
        for (const base of Array.from(groups.keys())) {
          if (k.startsWith(base) && k !== base) {
            groups.get(base)!.push(k)
            matched = true
            break
          }
        }
        if (!matched) groups.set(k, [k])
      }

      const entries: CleanedEntry[] = Array.from(groups.entries())
        .map(([base, variants]) => ({ base, variants }))
        .filter((e) => e.variants.length > 1)
        .sort((a, b) => b.variants.length - a.variants.length)

      setCleanedEntries(entries)
    } catch {
      setCleanedEntries([])
    } finally {
      setCleanLoading(false)
    }
  }

  async function fetchRankData(site: CompetitorRow, type: 'rankup' | 'rankdown', date: string) {
    setRankLoading(true)
    setRankData([])
    try {
      const supabase = getBrowserClient()
      const { data } = await supabase
        .from('rank_changes')
        .select('keyword, volume')
        .eq('site_id', site.site_id)
        .eq('stat_date', date)
        .eq('type', type)
        .order('volume', { ascending: false })
      setRankData((data || []) as RankEntry[])
    } catch {
      setRankData([])
    } finally {
      setRankLoading(false)
    }
  }

  async function openRankModal(site: CompetitorRow) {
    const today = getMalaysiaDate(0)
    setRankType('rankup')
    setRankDate(today)
    setRankSite(site)
    fetchRankData(site, 'rankup', today)

    // Compute unstable keyword set from last 30 days
    try {
      const supabase = getBrowserClient()
      const since = getMalaysiaDate(-30)
      const { data } = await supabase
        .from('rank_changes')
        .select('keyword, type, stat_date')
        .eq('site_id', site.site_id)
        .gte('stat_date', since)

      type RawRow = { keyword: string; type: string; stat_date: string }
      const rows = (data || []) as RawRow[]
      const upSet = new Map<string, Set<string>>()
      const downSet = new Map<string, Set<string>>()
      for (const row of rows) {
        if (row.type === 'rankup') {
          if (!upSet.has(row.keyword)) upSet.set(row.keyword, new Set())
          upSet.get(row.keyword)!.add(row.stat_date)
        } else {
          if (!downSet.has(row.keyword)) downSet.set(row.keyword, new Set())
          downSet.get(row.keyword)!.add(row.stat_date)
        }
      }
      const unstable = new Set<string>()
      for (const kw of Array.from(upSet.keys())) {
        const up = upSet.get(kw)!.size
        const down = downSet.get(kw)?.size ?? 0
        if (down > 0 && up + down >= 3) unstable.add(kw)
      }
      setRankUnstableSet(unstable)
    } catch {
      setRankUnstableSet(new Set())
    }
  }

  async function openUnstableModal(site: CompetitorRow) {
    setUnstableSite(site)
    setUnstableLoading(true)
    setUnstableData([])
    try {
      const supabase = getBrowserClient()
      const since = getMalaysiaDate(-30)
      const { data } = await supabase
        .from('rank_changes')
        .select('keyword, volume, type, stat_date')
        .eq('site_id', site.site_id)
        .gte('stat_date', since)

      type RawRow = { keyword: string; volume: number; type: string; stat_date: string }
      const rows = (data || []) as RawRow[]

      const kwMap = new Map<string, { upDays: Set<string>; downDays: Set<string>; volumes: number[] }>()
      for (const row of rows) {
        if (!kwMap.has(row.keyword)) kwMap.set(row.keyword, { upDays: new Set(), downDays: new Set(), volumes: [] })
        const entry = kwMap.get(row.keyword)!
        if (row.type === 'rankup') entry.upDays.add(row.stat_date)
        else entry.downDays.add(row.stat_date)
        if (row.volume > 0) entry.volumes.push(row.volume)
      }

      const results: UnstableEntry[] = []
      for (const [keyword, { upDays, downDays, volumes }] of Array.from(kwMap.entries())) {
        if (upDays.size > 0 && downDays.size > 0 && upDays.size + downDays.size >= 3) {
          const volume = volumes.length > 0 ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length) : 0
          results.push({ keyword, volume, upDays: upDays.size, downDays: downDays.size, totalDays: upDays.size + downDays.size })
        }
      }

      setUnstableData(results.sort((a, b) => b.totalDays - a.totalDays))
    } catch {
      setUnstableData([])
    } finally {
      setUnstableLoading(false)
    }
  }

  async function openIndexModal(site: CompetitorRow, period: 'day' | 'week' | 'month') {
    setIndexSite(site)
    setIndexPeriod(period)
    setIndexLoading(true)
    setIndexTitles([])
    try {
      const res = await fetch(`/api/baidu-site?domain=${encodeURIComponent(site.domain)}&period=${period}&siteName=${encodeURIComponent(site.name)}`)
      const data = await res.json()
      setIndexTitles(data.titles || [])
    } catch {
      setIndexTitles([])
    } finally {
      setIndexLoading(false)
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
                  <th className="table-th text-right">昨日新增</th>
                  <th className="table-th text-right">7日均值</th>
                  <th className="table-th text-center">状态</th>
                  <th className="table-th text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="table-td text-center text-gray-400 py-10">暂无数据</td>
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
                        <td className="table-td text-right font-bold text-green-600">{row.yesterday.toLocaleString()}</td>
                        <td className="table-td text-right text-gray-600">{row.avg7d.toLocaleString()}</td>
                        <td className="table-td text-center">
                          <span className={s.className}>{s.label}</span>
                        </td>
                        <td className="table-td text-right">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => row.hasHtml && viewYesterdayKeywords(row)}
                                disabled={!row.hasHtml}
                                className={`text-xs px-2 py-1 rounded transition-colors ${row.hasHtml ? 'text-gray-500 hover:text-green-600 hover:bg-gray-100' : 'text-gray-300 cursor-not-allowed'}`}
                              >
                                昨日新词
                              </button>
                              <button
                                onClick={() => row.hasHtml && viewCleanedKeywords(row)}
                                disabled={!row.hasHtml}
                                className={`text-xs px-2 py-1 rounded transition-colors ${row.hasHtml ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50' : 'text-gray-300 cursor-not-allowed'}`}
                              >
                                更新词库
                              </button>
                              <button
                                onClick={() => openRankModal(row)}
                                className="text-xs text-purple-500 hover:text-purple-700 px-2 py-1 rounded hover:bg-purple-50 transition-colors"
                              >
                                排名变动
                              </button>
                              <button
                                onClick={() => openUnstableModal(row)}
                                className="text-xs text-orange-500 hover:text-orange-700 px-2 py-1 rounded hover:bg-orange-50 transition-colors"
                              >
                                不稳定词
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openIndexModal(row, 'month')}
                                className="text-xs text-teal-500 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 transition-colors"
                              >
                                月收录
                              </button>
                              <button
                                onClick={() => openIndexModal(row, 'week')}
                                className="text-xs text-teal-500 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 transition-colors"
                              >
                                周收录
                              </button>
                              <button
                                onClick={() => openIndexModal(row, 'day')}
                                className="text-xs text-teal-500 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 transition-colors"
                              >
                                日收录
                              </button>
                            </div>
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
                        {(kw.content_date ?? kwDate).slice(5).replace('-', '/')}
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
                <p className="text-xs text-gray-400 mt-0.5">近30天持续更新的词条，按出现天数排序</p>
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
                <div className="divide-y divide-gray-50">
                  {cleanedEntries.map((entry, i) => {
                    const expanded = expandedBases.has(entry.base)
                    return (
                      <div key={i} className="py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-900">{entry.base}</span>
                          <button
                            onClick={() => setExpandedBases((prev) => {
                              const next = new Set(prev)
                              next.has(entry.base) ? next.delete(entry.base) : next.add(entry.base)
                              return next
                            })}
                            className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
                          >
                            {entry.variants.length}条
                          </button>
                        </div>
                        {expanded && (
                          <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                            {entry.variants.join('、')}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* 排名变动 Modal */}
      {rankSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-gray-900">{rankSite.domain} · 排名变动</h3>
                <input
                  type="date"
                  value={rankDate}
                  max={getMalaysiaDate(0)}
                  onChange={(e) => {
                    setRankDate(e.target.value)
                    fetchRankData(rankSite, rankType, e.target.value)
                  }}
                  className="text-sm border border-gray-200 rounded px-2 py-0.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <button onClick={() => setRankSite(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-5">
              {(['rankup', 'rankdown'] as const).map((t) => {
                const isActive = rankType === t
                const label = t === 'rankup' ? '涨入' : '跌出'
                const activeClass = t === 'rankup'
                  ? 'border-green-500 text-green-600'
                  : 'border-red-500 text-red-600'
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setRankType(t)
                      fetchRankData(rankSite, t, rankDate)
                    }}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors mr-2 ${
                      isActive ? activeClass : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {label}
                    {isActive && !rankLoading && rankData.length > 0 && (
                      <span className="ml-1.5 text-xs text-gray-400">({rankData.length})</span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {rankLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">抓取中，请稍候...</span>
                </div>
              ) : rankData.length === 0 ? (
                <p className="text-center text-gray-400 py-16 text-sm">无数据</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium text-gray-500">关键词</th>
                      <th className="px-5 py-2.5 text-right font-medium text-gray-500">搜索量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rankData.map((entry, i) => {
                      const isUnstable = rankUnstableSet.has(entry.keyword)
                      return (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className={`px-5 py-2 ${isUnstable ? 'text-red-500 font-medium' : 'text-gray-900'}`}>
                            {entry.keyword}
                          </td>
                          <td className="px-5 py-2 text-right text-gray-600">{entry.volume.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 不稳定词 Modal */}
      {unstableSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">{unstableSite.domain} · 不稳定词</h3>
                <p className="text-xs text-gray-400 mt-0.5">近30天在涨入和跌出均出现过的词，按波动天数排序</p>
              </div>
              <button onClick={() => setUnstableSite(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {unstableLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">加载中...</span>
                </div>
              ) : unstableData.length === 0 ? (
                <p className="text-center text-gray-400 py-16 text-sm">暂无不稳定词（需积累多天数据）</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium text-gray-500">关键词</th>
                      <th className="px-4 py-2.5 text-right font-medium text-gray-500">搜索量</th>
                      <th className="px-4 py-2.5 text-right font-medium text-green-600">涨入天</th>
                      <th className="px-4 py-2.5 text-right font-medium text-red-500">跌出天</th>
                      <th className="px-4 py-2.5 text-right font-medium text-gray-500">波动天</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {unstableData.map((entry, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-2 text-gray-900">{entry.keyword}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{entry.volume > 0 ? entry.volume.toLocaleString() : '-'}</td>
                        <td className="px-4 py-2 text-right text-green-600 font-medium">{entry.upDays}</td>
                        <td className="px-4 py-2 text-right text-red-500 font-medium">{entry.downDays}</td>
                        <td className="px-4 py-2 text-right text-gray-700 font-bold">{entry.totalDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {/* 收录 Modal */}
      {indexSite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {indexSite.domain} · {indexPeriod === 'month' ? '月收录' : indexPeriod === 'week' ? '周收录' : '日收录'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  百度 site: 搜索结果（{indexPeriod === 'month' ? '近30天' : indexPeriod === 'week' ? '近7天' : '今天'}）
                </p>
              </div>
              <button onClick={() => setIndexSite(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {indexLoading ? (
                <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">抓取中，请稍候...</span>
                </div>
              ) : indexTitles.length === 0 ? (
                <p className="text-center text-gray-400 py-16 text-sm">无收录数据</p>
              ) : (
                <div>
                  <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                    共 <span className="font-semibold text-gray-700">{indexTitles.length}</span> 条
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {indexTitles.map((title, i) => (
                      <li key={i} className="px-5 py-2.5 text-sm text-gray-800 hover:bg-gray-50">{title}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
