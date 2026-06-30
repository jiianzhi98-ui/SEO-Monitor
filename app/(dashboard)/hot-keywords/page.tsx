'use client'

import { useEffect, useState, useMemo } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { buildGroupMaps } from '@/lib/company-groups'

// ── Interfaces ────────────────────────────────────────────────────────────────

interface WordEntry {
  keyword: string; count: number; siteCount: number; sites: string[]
  last_date: string; first_date: string
}
interface RankEntry {
  keyword: string; siteCount: number; volume: number; sites: string[]
  last_date: string; first_date: string
}
interface CrossEntry {
  keyword: string; dims: string[]; volume: number | null
  newSites: string[]; rankSites: string[]; sites: string[]
  last_date: string; first_date: string
}
interface StreakEntry {
  keyword: string; streak: number; domain: string; volume: number
  last_date: string; first_date: string
}
interface StreakGrouped {
  keyword: string; streak: number; domains: string[]; volume: number
  last_date: string; first_date: string
}
interface RadarData { newWords: WordEntry[]; rankWords: RankEntry[]; streakWords: StreakEntry[] }
interface WeightInfo { pc: number; mobile: number; pcChg: number; mobileChg: number }
interface DetailRow  { date: string; domain: string }

type Tab      = 'cross' | 'new' | 'rank' | 'streak'
type PageSize = 50 | 100 | 500
const PAGE_SIZES: PageSize[] = [50, 100, 500]

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getMYDate(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

type Badge = 'new' | 'updated' | null
function getBadge(first_date: string, last_date: string, today: string): Badge {
  if (last_date !== today) return null
  return first_date === today ? 'new' : 'updated'
}

function badgePriority(first_date: string, last_date: string, today: string): number {
  if (last_date !== today) return 2
  return first_date === today ? 0 : 1
}

function sortByDate<T extends { last_date: string; first_date: string }>(
  list: T[],
  today: string,
  secondary: (a: T, b: T) => number
): T[] {
  return [...list].sort((a, b) => {
    if (a.last_date !== b.last_date) return b.last_date.localeCompare(a.last_date)
    const bp = badgePriority(a.first_date, a.last_date, today) - badgePriority(b.first_date, b.last_date, today)
    if (bp !== 0) return bp
    return secondary(a, b)
  })
}

function fmtDate(d: string): string {
  if (!d) return '—'
  return d.slice(5).replace('-', '/')
}

function fmtVolume(v: number): string {
  if (v <= 0) return '—'
  return v.toLocaleString()
}

// ── Small components ──────────────────────────────────────────────────────────

const DIM_LABELS: Record<string, { label: string; cls: string }> = {
  new:  { label: '新增', cls: 'bg-blue-50 text-blue-600' },
  rank: { label: '涨排', cls: 'bg-orange-50 text-orange-600' },
}

function BadgeChip({ badge }: { badge: Badge }) {
  if (!badge) return null
  if (badge === 'new')
    return <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold bg-green-500 text-white leading-none">今日</span>
  return <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold bg-amber-400 text-white leading-none">更新</span>
}

function DateCell({ last_date, first_date, today }: { last_date: string; first_date: string; today: string }) {
  const isToday = last_date === today
  const badge = getBadge(first_date, last_date, today)
  return (
    <td className="table-td whitespace-nowrap w-20">
      <div className={`flex items-center gap-1 ${isToday ? 'text-green-600' : 'text-gray-400'}`}>
        <span className={`text-xs ${isToday ? 'font-semibold' : ''}`}>{fmtDate(last_date)}</span>
        <BadgeChip badge={badge} />
      </div>
    </td>
  )
}

function PaginationBar({ page, total, pageSize, onPageChange }: {
  page: number; total: number; pageSize: PageSize; onPageChange: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-gray-100 text-xs">
      <button disabled={page === 0} onClick={() => onPageChange(0)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">«</button>
      <button disabled={page === 0} onClick={() => onPageChange(page - 1)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">‹</button>
      <span className="px-2 text-gray-500">{page + 1} / {totalPages}</span>
      <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">›</button>
      <button disabled={page >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">»</button>
    </div>
  )
}

// ── SiteBadge / SiteBadges ────────────────────────────────────────────────────

function SiteBadge({ domain, weight, borderColor }: {
  domain: string; weight?: WeightInfo; borderColor?: string
}) {
  return (
    <span
      className="inline-flex flex-col text-xs bg-gray-100 rounded px-1.5 py-1 min-w-0 flex-shrink-0"
      style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : undefined}
    >
      <span className="text-gray-700 truncate max-w-[130px]">{domain}</span>
      {weight && (
        <span className="text-[10px] flex items-center gap-1 mt-px">
          <span className="text-gray-400">PC</span>
          <span className="text-gray-600 font-medium">{weight.pc}</span>
          {weight.pcChg !== 0 && <span className={weight.pcChg > 0 ? 'text-green-500' : 'text-red-500'}>{weight.pcChg > 0 ? '↑' : '↓'}</span>}
          <span className="text-gray-300">·</span>
          <span className="text-gray-400">M</span>
          <span className="text-gray-600 font-medium">{weight.mobile}</span>
          {weight.mobileChg !== 0 && <span className={weight.mobileChg > 0 ? 'text-green-500' : 'text-red-500'}>{weight.mobileChg > 0 ? '↑' : '↓'}</span>}
        </span>
      )}
    </span>
  )
}

function sortSitesByWeight(sites: string[], weightMap: Map<string, WeightInfo>, idMap: Map<string, number>): string[] {
  const score = (d: string) => { const w = weightMap.get(d); return w ? (w.pc + w.mobile) / 2 : -1 }
  const groupMax = new Map<number, number>()
  for (const d of sites) {
    const gid = idMap.get(d)
    if (gid !== undefined) {
      const s = score(d)
      if (!groupMax.has(gid) || s > groupMax.get(gid)!) groupMax.set(gid, s)
    }
  }
  return [...sites].sort((a, b) => {
    const gidA = idMap.get(a), gidB = idMap.get(b)
    const anchorA = gidA !== undefined ? (groupMax.get(gidA) ?? score(a)) : score(a)
    const anchorB = gidB !== undefined ? (groupMax.get(gidB) ?? score(b)) : score(b)
    if (anchorA !== anchorB) return anchorB - anchorA
    if (gidA !== gidB) return (gidA ?? 999999) - (gidB ?? 999999)
    return score(b) - score(a)
  })
}

function SiteBadges({ sites, weightMap, idMap, colorMap }: {
  sites: string[]; weightMap: Map<string, WeightInfo>
  idMap: Map<string, number>; colorMap: Map<string, string>
}) {
  const sorted = useMemo(() => sortSitesByWeight(sites, weightMap, idMap), [sites, weightMap, idMap])
  return (
    <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'thin' }}>
      {sorted.map((d) => (
        <SiteBadge key={d} domain={d} weight={weightMap.get(d)} borderColor={colorMap.get(d)} />
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TAB_CONFIG: { key: Tab; label: string }[] = [
  { key: 'cross',  label: '交叉词' },
  { key: 'new',    label: '共新增词' },
  { key: 'rank',   label: '竞品涨排名' },
  { key: 'streak', label: '连续上涨词' },
]

export default function HotRadarPage() {
  const [data, setData]           = useState<RadarData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('cross')
  const [minSites, setMinSites]   = useState(2)
  const [minStreak, setMinStreak] = useState(2)
  const [filterSite, setFilterSite]       = useState('')
  const [filterKeyword, setFilterKeyword] = useState('')
  const [page, setPage]         = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [weightMap, setWeightMap]     = useState<Map<string, WeightInfo>>(new Map())
  const [siteIdMap, setSiteIdMap]     = useState<Map<string, string>>(new Map())
  const [groupIdMap, setGroupIdMap]   = useState<Map<string, number>>(new Map())
  const [groupColorMap, setGroupColorMap] = useState<Map<string, string>>(new Map())
  const [copied, setCopied]           = useState(false)
  const [detailKw, setDetailKw]       = useState<string | null>(null)
  const [detailRows, setDetailRows]   = useState<DetailRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const today = useMemo(() => getMYDate(), [])

  // ── Fetch ────────────────────────────────────────────────────────────────

  async function fetchWeights() {
    const db = getBrowserClient()
    const d14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
    const [{ data: siteRows }, { data: whRows }] = await Promise.all([
      db.from('sites').select('id, domain, friend_links'),
      db.from('weight_history').select('site_id, record_date, pc_weight, mobile_weight')
        .gte('record_date', d14).order('record_date'),
    ])
    const sites = (siteRows || []) as { id: string; domain: string; friend_links?: string[] | null }[]
    const idToDomain = new Map(sites.map(s => [s.id, s.domain]))
    setSiteIdMap(idToDomain)

    const { idMap, colorMap } = buildGroupMaps(sites)
    setGroupIdMap(idMap)
    setGroupColorMap(colorMap)

    const byId = new Map<string, { pc: number; mobile: number }[]>()
    for (const r of ((whRows || []) as { site_id: string; pc_weight: number; mobile_weight: number }[])) {
      if (!byId.has(r.site_id)) byId.set(r.site_id, [])
      byId.get(r.site_id)!.push({ pc: r.pc_weight, mobile: r.mobile_weight })
    }
    const map = new Map<string, WeightInfo>()
    for (const [sid, recs] of Array.from(byId.entries())) {
      const domain = idToDomain.get(sid)
      if (!domain) continue
      const latest = recs[recs.length - 1]
      const prev   = recs.length >= 2 ? recs[recs.length - 2] : null
      map.set(domain, {
        pc: latest.pc, mobile: latest.mobile,
        pcChg: prev ? latest.pc - prev.pc : 0,
        mobileChg: prev ? latest.mobile - prev.mobile : 0,
      })
    }
    setWeightMap(map)
  }

  async function openDetail(keyword: string) {
    setDetailKw(keyword)
    setDetailLoading(true)
    setDetailRows([])
    const db = getBrowserClient()
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    try {
      const rows: DetailRow[] = []
      if (activeTab === 'new' || activeTab === 'cross') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: raw } = await (db.from('raw_keywords') as any)
          .select('site_id, content_date')
          .eq('keyword', keyword).gte('content_date', since)
          .order('content_date', { ascending: false })
        for (const r of (raw || [])) {
          const domain = siteIdMap.get(r.site_id)
          if (domain) rows.push({ date: String(r.content_date).slice(0, 10), domain })
        }
      }
      if (activeTab === 'rank' || activeTab === 'streak' || activeTab === 'cross') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: raw } = await (db.from('rank_changes') as any)
          .select('site_id, stat_date')
          .eq('keyword', keyword).eq('type', 'rankup').gte('stat_date', since)
          .order('stat_date', { ascending: false })
        for (const r of (raw || [])) {
          const domain = siteIdMap.get(r.site_id)
          if (domain) rows.push({ date: String(r.stat_date).slice(0, 10), domain })
        }
      }
      const seen = new Set<string>()
      const unique = rows.filter(r => {
        const k = `${r.date}|${r.domain}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      unique.sort((a, b) => b.date.localeCompare(a.date) || a.domain.localeCompare(b.domain))
      setDetailRows(unique)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetch('/api/hot-radar')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(e => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
    fetchWeights()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!data) return null
    const nw = data.newWords.filter(w => w.siteCount >= minSites)
    const rw = data.rankWords.filter(w => w.siteCount >= minSites)

    const nwMap = new Map(nw.map(w => [w.keyword, w]))
    const rwMap = new Map(rw.map(w => [w.keyword, w]))
    const allKws = new Set([...Array.from(nwMap.keys()), ...Array.from(rwMap.keys())])

    const cw: CrossEntry[] = Array.from(allKws).map(keyword => {
      const dims: string[] = []
      const sites = new Set<string>()
      let last_date = '', first_date = ''

      const nwe = nwMap.get(keyword)
      if (nwe) {
        dims.push('new')
        nwe.sites.forEach(s => sites.add(s))
        if (nwe.last_date > last_date) last_date = nwe.last_date
        if (!first_date || nwe.first_date < first_date) first_date = nwe.first_date
      }
      const rwe = rwMap.get(keyword)
      if (rwe) {
        dims.push('rank')
        rwe.sites.forEach(s => sites.add(s))
        if (rwe.last_date > last_date) last_date = rwe.last_date
        if (!first_date || rwe.first_date < first_date) first_date = rwe.first_date
      }
      return { keyword, dims, volume: rwe?.volume ?? null, newSites: nwe?.sites || [], rankSites: rwe?.sites || [], sites: Array.from(sites), last_date, first_date }
    }).filter(w => w.dims.length >= 2)

    return {
      newWords:    sortByDate(nw, today, (a, b) => b.count - a.count || b.siteCount - a.siteCount),
      rankWords:   sortByDate(rw, today, (a, b) => b.volume - a.volume || b.siteCount - a.siteCount),
      crossWords:  sortByDate(cw, today, (a, b) => (b.volume ?? 0) - (a.volume ?? 0)),
      streakWords: data.streakWords || [],
    }
  }, [data, minSites, today])

  const filteredStreakWords = useMemo((): StreakGrouped[] => {
    if (!filtered) return []
    const raw = filtered.streakWords.filter(w => w.streak >= minStreak)
    const grouped = new Map<string, StreakGrouped>()
    for (const w of raw) {
      const g = grouped.get(w.keyword)
      if (!g) {
        grouped.set(w.keyword, { keyword: w.keyword, streak: w.streak, domains: [w.domain], volume: w.volume, first_date: w.first_date, last_date: w.last_date })
      } else {
        if (!g.domains.includes(w.domain)) g.domains.push(w.domain)
        if (w.streak > g.streak) g.streak = w.streak
        if (w.volume > g.volume) g.volume = w.volume
        if (w.last_date > g.last_date) g.last_date = w.last_date
        if (!g.first_date || w.first_date < g.first_date) g.first_date = w.first_date
      }
    }
    return sortByDate(Array.from(grouped.values()), today, (a, b) => b.streak - a.streak || b.volume - a.volume)
  }, [filtered, minStreak, today])

  const baseList = !filtered ? [] :
    activeTab === 'cross'  ? filtered.crossWords  :
    activeTab === 'new'    ? filtered.newWords     :
    activeTab === 'rank'   ? filtered.rankWords    :
    filteredStreakWords

  const activeList = useMemo(() => {
    type AnyEntry = CrossEntry | WordEntry | RankEntry | StreakGrouped
    let list = baseList as AnyEntry[]
    if (filterSite.trim()) {
      const fs = filterSite.trim().toLowerCase()
      list = list.filter(w => {
        if ('domains' in w) return (w as StreakGrouped).domains.some(d => d.toLowerCase().includes(fs))
        return 'sites' in w ? (w as { sites: string[] }).sites.some(s => s.toLowerCase().includes(fs)) : true
      })
    }
    if (filterKeyword.trim()) {
      const kw = filterKeyword.trim().toLowerCase()
      list = list.filter(w => w.keyword.toLowerCase().includes(kw))
    }
    return list
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseList, filterSite, filterKeyword])

  const pagedList = activeList.slice(page * pageSize, (page + 1) * pageSize)

  function handleTabChange(tab: Tab) { setActiveTab(tab); setPage(0) }

  function copyKeywords() {
    navigator.clipboard.writeText(activeList.map(w => w.keyword).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const detailByDate = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const r of detailRows) {
      if (!map.has(r.date)) map.set(r.date, [])
      if (!map.get(r.date)!.includes(r.domain)) map.get(r.date)!.push(r.domain)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [detailRows])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">热词雷达</h1>
        <p className="text-gray-400 text-sm mt-0.5">近30天多竞品同时关注的词，捕捉趋势机会</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-4">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-3">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            聚合中...
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
          </div>
        ) : (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">站点</span>
                <input type="text" value={filterSite}
                  onChange={e => { setFilterSite(e.target.value); setPage(0) }}
                  placeholder="输入域名..."
                  className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none w-36" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">关键词</span>
                <input type="text" value={filterKeyword}
                  onChange={e => { setFilterKeyword(e.target.value); setPage(0) }}
                  placeholder="搜索..."
                  className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none w-32" />
              </div>
              <div className="flex items-center gap-1.5">
                {activeTab !== 'streak' ? (
                  <>
                    <span className="text-xs text-gray-400">最少站点数</span>
                    <select value={minSites} onChange={e => { setMinSites(Number(e.target.value)); setPage(0) }}
                      className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none">
                      <option value={2}>2站</option>
                      <option value={3}>3站</option>
                      <option value={4}>4站</option>
                      <option value={5}>5站</option>
                    </select>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-400">最少上涨天数</span>
                    <select value={minStreak} onChange={e => { setMinStreak(Number(e.target.value)); setPage(0) }}
                      className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none">
                      <option value={2}>2天</option>
                      <option value={3}>3天</option>
                      <option value={5}>5天</option>
                      <option value={7}>7天</option>
                    </select>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={copyKeywords}
                  className={`text-xs px-2.5 py-1 rounded font-medium transition-all duration-200 ${
                    copied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}>
                  {copied ? '已复制 ✓' : '复制关键词'}
                </button>
                <span className="text-gray-200">|</span>
                <span className="text-xs text-gray-400">每页</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value) as PageSize); setPage(0) }}
                  className="text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-700 focus:outline-none">
                  {PAGE_SIZES.map(s => <option key={s} value={s}>{s} 条</option>)}
                </select>
                <span className="text-xs text-gray-400">共 {activeList.length} 条</span>
              </div>
            </div>

            {/* Tables — 统一列宽：日期 w-24 | 关键词 w-52 | 数字列 w-24 each | 站点 auto | 操作 w-16 */}
            <div className="overflow-x-auto [&_td]:py-2 [&_th]:py-2">

              {/* 交叉词：7列 */}
              {activeTab === 'cross' && (
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-24" />
                    <col className="w-56" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col />
                    <col />
                    <col className="w-16" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-th">日期</th>
                      <th className="table-th">关键词</th>
                      <th className="table-th text-center whitespace-nowrap">命中维度</th>
                      <th className="table-th text-right whitespace-nowrap">搜索量</th>
                      <th className="table-th whitespace-nowrap">新增站点</th>
                      <th className="table-th whitespace-nowrap">涨排站点</th>
                      <th className="table-th text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedList.length === 0 ? (
                      <tr><td colSpan={7} className="table-td text-center text-gray-400 py-10">暂无交叉词数据</td></tr>
                    ) : (
                      (pagedList as CrossEntry[]).map(w => (
                        <tr key={w.keyword} className="hover:bg-gray-50 transition-colors">
                          <DateCell last_date={w.last_date} first_date={w.first_date} today={today} />
                          <td className="table-td font-medium text-gray-900 overflow-hidden">
                            <span className="block truncate" title={w.keyword}>{w.keyword}</span>
                          </td>
                          <td className="table-td">
                            <div className="flex justify-center gap-1">
                              {w.dims.map(d => (
                                <span key={d} className={`text-xs px-1.5 py-0.5 rounded font-medium ${DIM_LABELS[d]?.cls}`}>
                                  {DIM_LABELS[d]?.label}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="table-td text-right">
                            <span className="font-semibold text-gray-900">{w.volume != null ? fmtVolume(w.volume) : '—'}</span>
                          </td>
                          <td className="table-td">
                            {w.newSites.length > 0
                              ? <SiteBadges sites={w.newSites} weightMap={weightMap} idMap={groupIdMap} colorMap={groupColorMap} />
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="table-td">
                            {w.rankSites.length > 0
                              ? <SiteBadges sites={w.rankSites} weightMap={weightMap} idMap={groupIdMap} colorMap={groupColorMap} />
                              : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                          <td className="table-td text-center">
                            <button onClick={() => openDetail(w.keyword)} className="text-xs text-blue-500 hover:text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 hover:border-blue-200 transition-colors">查看</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* 共新增词：6列 */}
              {activeTab === 'new' && (
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-24" />
                    <col className="w-64" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col />
                    <col className="w-16" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-th">日期</th>
                      <th className="table-th">关键词</th>
                      <th className="table-th text-center whitespace-nowrap">新增次数</th>
                      <th className="table-th text-center whitespace-nowrap">站点数</th>
                      <th className="table-th">出现站点</th>
                      <th className="table-th text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedList.length === 0 ? (
                      <tr><td colSpan={6} className="table-td text-center text-gray-400 py-10">暂无数据</td></tr>
                    ) : (
                      (pagedList as WordEntry[]).map(w => (
                        <tr key={w.keyword} className="hover:bg-gray-50 transition-colors">
                          <DateCell last_date={w.last_date} first_date={w.first_date} today={today} />
                          <td className="table-td font-medium text-gray-900 overflow-hidden">
                            <span className="block truncate" title={w.keyword}>{w.keyword}</span>
                          </td>
                          <td className="table-td text-center">
                            <span className="font-semibold text-gray-900">{w.count}</span>
                            <span className="text-gray-400 text-xs">次</span>
                          </td>
                          <td className="table-td text-center">
                            <span className="font-semibold text-gray-900">{w.siteCount}</span>
                            <span className="text-gray-400 text-xs">站</span>
                          </td>
                          <td className="table-td">
                            <SiteBadges sites={w.sites} weightMap={weightMap} idMap={groupIdMap} colorMap={groupColorMap} />
                          </td>
                          <td className="table-td text-center">
                            <button onClick={() => openDetail(w.keyword)} className="text-xs text-blue-500 hover:text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 hover:border-blue-200 transition-colors">查看</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* 竞品涨排名：6列 */}
              {activeTab === 'rank' && (
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-24" />
                    <col className="w-64" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col />
                    <col className="w-16" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-th">日期</th>
                      <th className="table-th">关键词</th>
                      <th className="table-th text-center whitespace-nowrap">涨排站点</th>
                      <th className="table-th text-right whitespace-nowrap">搜索量</th>
                      <th className="table-th">出现站点</th>
                      <th className="table-th text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedList.length === 0 ? (
                      <tr><td colSpan={6} className="table-td text-center text-gray-400 py-10">暂无数据</td></tr>
                    ) : (
                      (pagedList as RankEntry[]).map(w => (
                        <tr key={w.keyword} className="hover:bg-gray-50 transition-colors">
                          <DateCell last_date={w.last_date} first_date={w.first_date} today={today} />
                          <td className="table-td font-medium text-gray-900 overflow-hidden">
                            <span className="block truncate" title={w.keyword}>{w.keyword}</span>
                          </td>
                          <td className="table-td text-center">
                            <span className="font-semibold text-gray-900">{w.siteCount}</span>
                            <span className="text-gray-400 text-xs">站</span>
                          </td>
                          <td className="table-td text-right">
                            <span className="font-semibold text-gray-900">{fmtVolume(w.volume)}</span>
                          </td>
                          <td className="table-td">
                            <SiteBadges sites={w.sites} weightMap={weightMap} idMap={groupIdMap} colorMap={groupColorMap} />
                          </td>
                          <td className="table-td text-center">
                            <button onClick={() => openDetail(w.keyword)} className="text-xs text-blue-500 hover:text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 hover:border-blue-200 transition-colors">查看</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {/* 连续上涨词：6列 */}
              {activeTab === 'streak' && (
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-24" />
                    <col className="w-64" />
                    <col className="w-24" />
                    <col className="w-24" />
                    <col />
                    <col className="w-16" />
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-th">日期</th>
                      <th className="table-th">关键词</th>
                      <th className="table-th text-center whitespace-nowrap">上涨天数</th>
                      <th className="table-th text-right whitespace-nowrap">搜索量</th>
                      <th className="table-th whitespace-nowrap">出现站点</th>
                      <th className="table-th text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pagedList.length === 0 ? (
                      <tr><td colSpan={6} className="table-td text-center text-gray-400 py-10">暂无连续上涨词</td></tr>
                    ) : (
                      (pagedList as StreakGrouped[]).map(w => (
                        <tr key={w.keyword} className="hover:bg-gray-50 transition-colors">
                          <DateCell last_date={w.last_date} first_date={w.first_date} today={today} />
                          <td className="table-td font-medium text-gray-900 overflow-hidden">
                            <span className="block truncate" title={w.keyword}>{w.keyword}</span>
                          </td>
                          <td className="table-td text-center">
                            <span className="font-semibold text-gray-900">{w.streak}</span>
                            <span className="text-gray-400 text-xs">天</span>
                          </td>
                          <td className="table-td text-right">
                            <span className="font-semibold text-gray-900">{fmtVolume(w.volume)}</span>
                          </td>
                          <td className="table-td">
                            <SiteBadges sites={w.domains} weightMap={weightMap} idMap={groupIdMap} colorMap={groupColorMap} />
                          </td>
                          <td className="table-td text-center">
                            <button onClick={() => openDetail(w.keyword)} className="text-xs text-blue-500 hover:text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 hover:border-blue-200 transition-colors">查看</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

            </div>
            <PaginationBar page={page} total={activeList.length} pageSize={pageSize} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* 查看 Detail Modal */}
      {detailKw && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailKw(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <h3 className="font-semibold text-gray-900">{detailKw}</h3>
                <p className="text-xs text-gray-400 mt-0.5">近30天出现记录</p>
              </div>
              <button onClick={() => setDetailKw(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {detailLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  加载中...
                </div>
              ) : detailByDate.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">暂无记录</p>
              ) : (
                <div className="space-y-3">
                  {detailByDate.map(([date, domains]) => (
                    <div key={date} className="flex items-start gap-3">
                      <span className="text-xs text-gray-400 w-12 flex-shrink-0 pt-1.5">{date.slice(5)}</span>
                      <div className="flex flex-wrap gap-1">
                        {domains.map(d => (
                          <SiteBadge key={d} domain={d} weight={weightMap.get(d)} borderColor={groupColorMap.get(d)} />
                        ))}
                      </div>
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
