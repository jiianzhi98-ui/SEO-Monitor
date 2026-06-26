'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { type ReactNode } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'large' | 'medium' | 'small'
type TimeRange = 'month' | '3m' | 'year'

interface Site { id: string; domain: string; name: string; category: Category }
interface IndexSnap { site_id: string; snapshot_date: string; index_count: number }
interface WeightRec {
  site_id: string
  record_date: string
  pc_weight: number
  mobile_weight: number
  mobile_ip: number
  mobile_ip_max: number
}
interface DailyStat { site_id: string; stat_date: string; new_count: number }
interface WeightChangeItem { domain: string; pcChange: number; mobileChange: number }
interface AlertItem { domain: string; status: 'danger' | 'warning' | 'high' }
interface IndexAlertItem { domain: string; status: 'danger' | 'warning' | 'rising' }

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_LABEL: Record<Category, string> = { large: '大站', medium: '中站', small: '小站' }

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'month', label: '当月' },
  { value: '3m', label: '近3个月' },
  { value: 'year', label: '全年' },
]

// Color palette for multiple sites
const SITE_COLORS = [
  '#22c55e', '#3b82f6', '#f97316', '#a855f7',
  '#ec4899', '#14b8a6', '#f59e0b', '#ef4444',
]

function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 100
  const exp = Math.pow(10, Math.floor(Math.log10(rawMax)))
  const n = rawMax / exp
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return nice * exp
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMY(offsetDays = 0): string {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000)
    .toISOString()
    .slice(0, 10)
}

function getDateCutoff(range: TimeRange): string {
  if (range === '3m') return getMY(-90)
  const now = new Date(Date.now() + 8 * 3600000)
  const y = now.getFullYear()
  if (range === 'month') {
    const m = String(now.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
  }
  return `${y}-01-01`
}

function fmtNum(n: number): string {
  if (n >= 10000) {
    const w = n / 10000
    return (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + 'w'
  }
  return n.toLocaleString()
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [indexSnaps, setIndexSnaps] = useState<IndexSnap[]>([])
  const [weightRecs, setWeightRecs] = useState<WeightRec[]>([])
  const [weightChanges, setWeightChanges] = useState<WeightChangeItem[]>([])
  const [indexAlerts, setIndexAlerts] = useState<IndexAlertItem[]>([])
  const [kwAlerts, setKwAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [timeRange, setTimeRange] = useState<TimeRange>('3m')
  const [activeCategory, setActiveCategory] = useState<Category>('large')
  // selected = focused sites; empty = show all
  const [selected, setSelected] = useState<Record<Category, string[]>>({
    large: [], medium: [], small: [],
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const db = getBrowserClient()
      const today = getMY()
      const yesterday = getMY(-1)
      const d7 = getMY(-7)
      const d365 = getMY(-365)

      const [
        { data: sitesRaw },
        { data: snapsRaw },
        { data: wrecsRaw },
        { data: statsRaw },
        { data: snapTRaw },
        { data: snapYRaw },
        { data: wtTRaw },
        { data: wtWRaw },
      ] = await Promise.all([
        db.from('sites').select('id, domain, name, category').eq('is_enabled', true),
        db.from('index_snapshots')
          .select('site_id, snapshot_date, index_count')
          .gte('snapshot_date', d365)
          .order('snapshot_date'),
        db.from('weight_history')
          .select('site_id, record_date, pc_weight, mobile_weight, mobile_ip, mobile_ip_max')
          .gte('record_date', d365)
          .order('record_date'),
        db.from('daily_stats').select('site_id, stat_date, new_count').gte('stat_date', d7),
        db.from('index_snapshots').select('site_id, index_count').eq('snapshot_date', today),
        db.from('index_snapshots').select('site_id, index_count').eq('snapshot_date', yesterday),
        db.from('weight_history').select('site_id, pc_weight, mobile_weight').eq('record_date', today),
        db.from('weight_history').select('site_id, pc_weight, mobile_weight').eq('record_date', getMY(-7)),
      ])

      const siteList = (sitesRaw || []) as Site[]
      setSites(siteList)
      setIndexSnaps((snapsRaw || []) as IndexSnap[])
      setWeightRecs((wrecsRaw || []) as WeightRec[])

      // Weight change alerts (today vs 7 days ago)
      type WRow = { site_id: string; pc_weight: number; mobile_weight: number }
      const wtTMap = new Map((wtTRaw || []).map((w: WRow) => [w.site_id, w]))
      const wtWMap = new Map((wtWRaw || []).map((w: WRow) => [w.site_id, w]))
      const wChanges: WeightChangeItem[] = []
      for (const s of siteList) {
        const t = wtTMap.get(s.id)
        const w = wtWMap.get(s.id)
        if (t && w) {
          const pc = t.pc_weight - w.pc_weight
          const mo = t.mobile_weight - w.mobile_weight
          if (pc !== 0 || mo !== 0) wChanges.push({ domain: s.domain, pcChange: pc, mobileChange: mo })
        }
      }
      setWeightChanges(wChanges)

      // Index alerts: weekly comparison (danger/warning/rising) using full year snaps
      const iAlerts: IndexAlertItem[] = []
      for (const s of siteList) {
        const siteSnaps = ((snapsRaw || []) as IndexSnap[])
          .filter(r => r.site_id === s.id)
          .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
        if (siteSnaps.length < 3) continue
        const latest = siteSnaps[siteSnaps.length - 1].index_count
        const snap7 = [...siteSnaps].reverse().find(r => r.snapshot_date <= d7)
        if (!snap7 || snap7.index_count === 0) continue
        const rate = (latest - snap7.index_count) / snap7.index_count
        if (rate < -0.2) iAlerts.push({ domain: s.domain, status: 'danger' })
        else if (rate < -0.1) iAlerts.push({ domain: s.domain, status: 'warning' })
        else if (rate > 0.1) iAlerts.push({ domain: s.domain, status: 'rising' })
      }
      // Sort: danger first, then warning, then rising
      iAlerts.sort((a, b) => {
        const order = { danger: 0, warning: 1, rising: 2 }
        return order[a.status] - order[b.status]
      })
      setIndexAlerts(iAlerts)

      // Keyword anomaly alerts (yesterday < 30% of 7-day avg)
      const stats = (statsRaw || []) as DailyStat[]
      const kAlerts: AlertItem[] = []
      for (const s of siteList) {
        const ss = stats.filter(r => r.site_id === s.id)
        if (ss.length === 0) continue
        const yStat = ss.find(r => r.stat_date.slice(0, 10) === yesterday)
        const yVal = yStat?.new_count ?? 0
        const avg = ss.reduce((a, r) => a + r.new_count, 0) / ss.length
        if (avg > 0) {
          const ratio = yVal / avg
          if (ratio < 0.3) kAlerts.push({ domain: s.domain, status: 'danger' })
          else if (ratio < 0.6) kAlerts.push({ domain: s.domain, status: 'warning' })
          else if (ratio > 1.5) kAlerts.push({ domain: s.domain, status: 'high' })
        }
      }
      kAlerts.sort((a, b) => {
        const order = { danger: 0, warning: 1, high: 2 }
        return order[a.status] - order[b.status]
      })
      setKwAlerts(kAlerts)

      const firstCat = (['large', 'medium', 'small'] as Category[]).find(
        c => siteList.some(s => s.category === c)
      )
      if (firstCat) setActiveCategory(firstCat)

    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const catSites = useMemo<Record<Category, Site[]>>(() => {
    const r: Record<Category, Site[]> = { large: [], medium: [], small: [] }
    for (const s of sites) r[s.category].push(s)
    return r
  }, [sites])

  const siteMap = useMemo(() => new Map(sites.map(s => [s.id, s])), [sites])

  // Color index by site within category
  function siteColor(cat: Category, siteId: string): string {
    const idx = catSites[cat].findIndex(s => s.id === siteId)
    return SITE_COLORS[idx % SITE_COLORS.length]
  }

  // Which sites to draw: selected ones, or all if nothing selected
  function activeSiteIds(cat: Category): string[] {
    return selected[cat].length > 0
      ? selected[cat]
      : catSites[cat].map(s => s.id)
  }

  function toggleSite(siteId: string) {
    setSelected(prev => {
      const cur = prev[activeCategory]
      const next = cur.includes(siteId) ? cur.filter(id => id !== siteId) : [...cur, siteId]
      return { ...prev, [activeCategory]: next }
    })
  }

  function getIndexData(ids: string[]) {
    const cutoff = getDateCutoff(timeRange)
    const filtered = indexSnaps.filter(r => r.snapshot_date >= cutoff && ids.includes(r.site_id))
    const map = new Map<string, Record<string, number>>()
    for (const r of filtered) {
      if (!map.has(r.snapshot_date)) map.set(r.snapshot_date, {})
      map.get(r.snapshot_date)![r.site_id] = r.index_count
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: date.slice(5), ...v }))
  }

  function getMobileIPData(ids: string[]) {
    const cutoff = getDateCutoff(timeRange)
    const filtered = weightRecs.filter(r => r.record_date >= cutoff && ids.includes(r.site_id))
    const map = new Map<string, Record<string, number>>()
    for (const r of filtered) {
      const avg = Math.round(((r.mobile_ip ?? 0) + (r.mobile_ip_max ?? 0)) / 2)
      if (avg === 0) continue
      if (!map.has(r.record_date)) map.set(r.record_date, {})
      map.get(r.record_date)![r.site_id] = avg
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: date.slice(5), ...v }))
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

  const today = getMY()
  const activeIds = activeSiteIds(activeCategory)
  const activeSelected = selected[activeCategory]

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">首页快报</h1>
        <p className="text-gray-500 text-sm mt-1">{today} · 今日数据汇总</p>
      </div>

      {/* ── Alert Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">

        <AlertCard title="权重变动" count={weightChanges.length} color="yellow" empty="暂无权重变动">
          {weightChanges.map((w, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-0.5">
              <p className="text-xs font-medium text-gray-800 truncate">{w.domain}</p>
              <div className="flex gap-1.5 flex-shrink-0">
                {w.pcChange !== 0 && (
                  <span className={`text-xs font-semibold ${w.pcChange > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    PC {w.pcChange > 0 ? '+' : ''}{w.pcChange}
                  </span>
                )}
                {w.mobileChange !== 0 && (
                  <span className={`text-xs font-semibold ${w.mobileChange > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    移 {w.mobileChange > 0 ? '+' : ''}{w.mobileChange}
                  </span>
                )}
              </div>
            </div>
          ))}
        </AlertCard>

        <AlertCard
          title="新增异常"
          count={kwAlerts.length}
          color={kwAlerts.some(a => a.status === 'danger') ? 'red' : kwAlerts.some(a => a.status === 'warning') ? 'orange' : kwAlerts.some(a => a.status === 'high') ? 'teal' : 'gray'}
          empty="各站新增正常"
        >
          {kwAlerts.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-0.5">
              <p className="text-xs text-gray-700 truncate">{a.domain}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                a.status === 'danger' ? 'bg-red-50 text-red-500' :
                a.status === 'warning' ? 'bg-yellow-50 text-yellow-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {a.status === 'danger' ? '异常' : a.status === 'warning' ? '偏低' : '偏高'}
              </span>
            </div>
          ))}
        </AlertCard>

        <AlertCard
          title="收录异常"
          count={indexAlerts.length}
          color={indexAlerts.some(a => a.status === 'danger') ? 'red' : indexAlerts.some(a => a.status === 'warning') ? 'orange' : indexAlerts.some(a => a.status === 'rising') ? 'teal' : 'gray'}
          empty="各站收录正常"
          action={
            <div className="flex items-center gap-1.5">
              <RankupExportButton />
              <span className="text-gray-200 select-none">|</span>
              <RankdownExportButton />
            </div>
          }
        >
          {indexAlerts.map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-0.5">
              <p className="text-xs text-gray-700 truncate">{a.domain}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                a.status === 'danger' ? 'bg-red-50 text-red-500' :
                a.status === 'warning' ? 'bg-yellow-50 text-yellow-600' :
                'bg-blue-50 text-blue-600'
              }`}>
                {a.status === 'danger' ? '危险' : a.status === 'warning' ? '警告' : '涨入'}
              </span>
            </div>
          ))}
        </AlertCard>

        <KeywordSearchCard />

      </div>

      {/* ── Charts Section ──────────────────────────────────────────────── */}
      <div className="card">

        {/* Header: category tabs + time range */}
        <div className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex gap-1">
            {(['large', 'medium', 'small'] as Category[]).map(cat => {
              const has = catSites[cat].length > 0
              return (
                <button
                  key={cat}
                  onClick={() => has && setActiveCategory(cat)}
                  disabled={!has}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    activeCategory === cat
                      ? 'bg-green-500 text-white'
                      : has
                        ? 'text-gray-500 hover:bg-gray-100'
                        : 'text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {CAT_LABEL[cat]}
                </button>
              )
            })}
          </div>
          <div className="flex gap-1">
            {TIME_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setTimeRange(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  timeRange === opt.value
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">

          {/* Site toggle pills */}
          <div className="flex flex-wrap items-center gap-2">
            {catSites[activeCategory].length === 0 ? (
              <p className="text-sm text-gray-400">该分类暂无站点，请在网站管理中设置分类</p>
            ) : (
              <>
                {activeSelected.length > 0 && (
                  <button
                    onClick={() => setSelected(prev => ({ ...prev, [activeCategory]: [] }))}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors"
                  >
                    全部
                  </button>
                )}
                {catSites[activeCategory].map(s => {
                  const color = siteColor(activeCategory, s.id)
                  const isActive = activeSelected.length === 0 || activeSelected.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSite(s.id)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        activeSelected.includes(s.id)
                          ? 'border-transparent text-white font-medium'
                          : activeSelected.length > 0
                            ? 'border-gray-200 text-gray-400 hover:text-gray-600'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                      style={activeSelected.includes(s.id) ? { backgroundColor: color } : {}}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isActive ? color : '#d1d5db' }}
                      />
                      {s.domain}
                    </button>
                  )
                })}
              </>
            )}
          </div>

          {/* Two comparison charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-3">收录趋势</p>
              <CompareChart
                data={getIndexData(activeIds)}
                siteIds={activeIds}
                colorMap={Object.fromEntries(activeIds.map(id => [id, siteColor(activeCategory, id)]))}
                siteMap={siteMap}
                yFormatter={fmtNum}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-3">移动 IP 均值趋势</p>
              <CompareChart
                data={getMobileIPData(activeIds)}
                siteIds={activeIds}
                colorMap={Object.fromEntries(activeIds.map(id => [id, siteColor(activeCategory, id)]))}
                siteMap={siteMap}
                yFormatter={fmtNum}
              />
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}

// ─── KeywordSearchCard ────────────────────────────────────────────────────────

interface KwVolRow { keyword: string; volume: number }

function KeywordSearchCard() {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<KwVolRow[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  // Export auth dialog
  const [showDialog, setShowDialog] = useState(false)
  const [exportType, setExportType] = useState<'all' | 'today'>('all')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  async function handleSearch(pg = 0) {
    setLoading(true)
    try {
      const res = await fetch(`/api/keyword-volume?q=${encodeURIComponent(query)}&page=${pg}`)
      const data = await res.json()
      setRows(data.keywords || [])
      setTotal(data.total ?? 0)
      setPage(pg)
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  function openExportDialog(type: 'all' | 'today' = 'all') {
    setExportType(type)
    setEmail('')
    setPassword('')
    setVerifyError(null)
    setShowDialog(true)
  }

  async function handleVerifyAndExport() {
    setVerifying(true)
    setVerifyError(null)
    try {
      const verifyRes = await fetch('/api/keyword-volume/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) {
        setVerifyError(verifyData.error || '验证失败')
        return
      }

      // Credentials valid — proceed with download
      setShowDialog(false)
      const apiUrl = exportType === 'today' ? '/api/keyword-volume?export=today' : '/api/keyword-volume?export=1'
      const res = await fetch(apiUrl)
      const data = await res.json()
      const all: KwVolRow[] = data.keywords || []
      const csv = ['关键词,搜索量', ...all.map(r => `"${r.keyword}",${r.volume}`)].join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const dateStr = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
      a.download = exportType === 'today' ? `keywords-today-${dateStr}.csv` : `keywords-${dateStr}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      <div className="rounded-xl border border-green-300 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-400" />
            <span className="text-sm font-medium text-gray-600">搜索量查询</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openExportDialog('today')}
              className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              导出今日
            </button>
            <span className="text-gray-300 select-none">|</span>
            <button
              onClick={() => openExportDialog('all')}
              className="text-xs text-gray-400 hover:text-green-600 transition-colors"
            >
              导出全部
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch(0)}
            placeholder="搜索词..."
            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={() => handleSearch(0)}
            disabled={loading}
            className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {loading ? '...' : '搜索'}
          </button>
        </div>

        <div className={`${searched && total > 50 ? 'max-h-20' : 'max-h-28'} overflow-y-auto`}>
          {!searched ? (
            <p className="text-xs text-gray-400">输入关键词后搜索</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-gray-400">未找到「{query}」</p>
          ) : (
            <div className="space-y-0.5">
              {rows.map(r => (
                <div key={r.keyword} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-gray-700 truncate mr-2">{r.keyword}</span>
                  <span className="text-xs font-medium text-gray-500 flex-shrink-0 tabular-nums">
                    {r.volume > 0 ? r.volume.toLocaleString() : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {searched && total > 50 && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => handleSearch(page - 1)}
              disabled={page === 0 || loading}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1.5 py-0.5 rounded transition-colors"
            >
              ← 上一页
            </button>
            <span className="text-xs text-gray-400 tabular-nums">
              第 {page + 1} / {Math.ceil(total / 50)} 页 · 共 {total} 个
            </span>
            <button
              onClick={() => handleSearch(page + 1)}
              disabled={(page + 1) * 50 >= total || loading}
              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30 px-1.5 py-0.5 rounded transition-colors"
            >
              下一页 →
            </button>
          </div>
        )}
      </div>

      {/* Export auth dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">验证身份</h3>
            <p className="text-xs text-gray-400 mb-5">{exportType === 'today' ? '导出今日新词需要验证账号权限' : '导出全部数据需要验证账号权限'}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyAndExport()}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {verifyError && (
                <p className="text-xs text-red-500">{verifyError}</p>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowDialog(false)}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleVerifyAndExport}
                disabled={verifying || !email || !password}
                className="flex-1 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
              >
                {verifying ? '验证中...' : '确认导出'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── RankupExportButton ───────────────────────────────────────────────────────

function RankupExportButton() {
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'verifying' | 'crawling' | 'done'>('idle')
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function openDialog() {
    setDomain('')
    setStartDate(getMY(-6))
    setEndDate(getMY())
    setEmail('')
    setPassword('')
    setStatus('idle')
    setProgress('')
    setErr(null)
    setOpen(true)
  }

  async function handleStart() {
    if (!domain || !startDate || !endDate) { setErr('请填写网站和日期'); return }

    setStatus('verifying')
    setErr(null)
    const verRes = await fetch('/api/keyword-volume/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!verRes.ok) {
      const d = await verRes.json()
      setErr(d.error || '验证失败')
      setStatus('idle')
      return
    }

    const dates: string[] = []
    let cur = new Date(startDate + 'T12:00:00+08:00')
    const end = new Date(endDate + 'T12:00:00+08:00')
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10))
      cur = new Date(cur.getTime() + 86400000)
    }
    if (dates.length === 0) { setErr('日期范围无效'); setStatus('idle'); return }

    setStatus('crawling')
    const t0 = Date.now()
    const allData: Record<string, { keyword: string; volume: number; title: string }[]> = {}

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]
      let items: { keyword: string; volume: number; title: string }[] = []

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          setProgress(`${date} 无数据，第 ${attempt} 次重试（等待 30 秒）...`)
          await new Promise(r => setTimeout(r, 30000))
        } else {
          setProgress(`正在抓取 ${date} (${i + 1}/${dates.length})...`)
        }
        try {
          const res = await fetch(`/api/export-rankup-history?domain=${encodeURIComponent(domain)}&date=${date}`)
          const data = await res.json()
          items = data.items || []
          if (items.length > 0) break
        } catch {
          items = []
        }
      }

      allData[date] = items
      if (i < dates.length - 1) {
        setProgress(`${date} 完成，等待 5 秒...`)
        await new Promise(r => setTimeout(r, 5000))
      }
    }

    setProgress('生成 Excel 文件...')
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    let totalKw = 0
    for (const [date, items] of Object.entries(allData)) {
      totalKw += items.length
      const rows = items.map(r => ({ 关键词: r.keyword, 搜索量: r.volume, 标题: r.title }))
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 关键词: '', 搜索量: 0, 标题: '无数据' }])
      XLSX.utils.book_append_sheet(wb, ws, date)
    }
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `涨词-${domain}-${startDate}至${endDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    fetch('/api/log-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'rankup-export', domain, ok: totalKw, durationMs: Date.now() - t0, summary: `涨词导出 ${domain} ${startDate}至${endDate}，共 ${totalKw} 个词` }),
    }).catch(() => {})
    setStatus('done')
    setProgress('导出完成')
  }

  const busy = status === 'verifying' || status === 'crawling'
  const dayDiff = startDate && endDate
    ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
    : 0
  const rangeExceeds = dayDiff > 6

  return (
    <>
      <button
        onClick={openDialog}
        className="text-xs text-gray-400 hover:text-green-600 transition-colors"
      >
        涨词导出
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">涨词导出</h3>
            <p className="text-xs text-gray-400 mb-4">从爱站抓取指定站点的涨入关键词并导出 Excel</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">网站域名</label>
                <input
                  type="text"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  disabled={busy}
                  placeholder="例如 xxx.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-50"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    disabled={busy}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-50"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    disabled={busy}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-50"
                  />
                </div>
              </div>
              {rangeExceeds && (
                <p className="text-xs text-red-500">抓取范围超出 7 天（爱站最多保留 7 天数据）</p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={busy}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 disabled:bg-gray-50"
                />
              </div>

              {err && <p className="text-xs text-red-500">{err}</p>}
              {progress && <p className="text-xs text-blue-500">{progress}</p>}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                {status === 'done' ? '关闭' : '取消'}
              </button>
              {status !== 'done' && (
                <button
                  onClick={handleStart}
                  disabled={busy || !domain || !email || !password || rangeExceeds}
                  className="flex-1 py-2 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 font-medium"
                >
                  {status === 'verifying' ? '验证中...' : status === 'crawling' ? '抓取中...' : '开始导出'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── RankdownExportButton ─────────────────────────────────────────────────────

function RankdownExportButton() {
  const [open, setOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'verifying' | 'crawling' | 'done'>('idle')
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState<string | null>(null)

  function openDialog() {
    setDomain('')
    setStartDate(getMY(-6))
    setEndDate(getMY())
    setEmail('')
    setPassword('')
    setStatus('idle')
    setProgress('')
    setErr(null)
    setOpen(true)
  }

  async function handleStart() {
    if (!domain || !startDate || !endDate) { setErr('请填写网站和日期'); return }

    setStatus('verifying')
    setErr(null)
    const verRes = await fetch('/api/keyword-volume/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!verRes.ok) {
      const d = await verRes.json()
      setErr(d.error || '验证失败')
      setStatus('idle')
      return
    }

    // Build list of dates from start to end
    const dates: string[] = []
    let cur = new Date(startDate + 'T12:00:00+08:00')
    const end = new Date(endDate + 'T12:00:00+08:00')
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10))
      cur = new Date(cur.getTime() + 86400000)
    }
    if (dates.length === 0) { setErr('日期范围无效'); setStatus('idle'); return }

    setStatus('crawling')
    const t0 = Date.now()
    const allData: Record<string, { keyword: string; volume: number; title: string }[]> = {}

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]
      let items: { keyword: string; volume: number; title: string }[] = []

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          setProgress(`${date} 无数据，第 ${attempt} 次重试（等待 30 秒）...`)
          await new Promise(r => setTimeout(r, 30000))
        } else {
          setProgress(`正在抓取 ${date} (${i + 1}/${dates.length})...`)
        }
        try {
          const res = await fetch(`/api/export-rank-history?domain=${encodeURIComponent(domain)}&date=${date}`)
          const data = await res.json()
          items = data.items || []
          if (items.length > 0) break
        } catch {
          items = []
        }
      }

      allData[date] = items
      if (i < dates.length - 1) {
        setProgress(`${date} 完成，等待 5 秒...`)
        await new Promise(r => setTimeout(r, 5000))
      }
    }

    setProgress('生成 Excel 文件...')
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    let totalKw = 0
    for (const [date, items] of Object.entries(allData)) {
      totalKw += items.length
      const rows = items.map(r => ({ 关键词: r.keyword, 搜索量: r.volume, 标题: r.title }))
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 关键词: '', 搜索量: 0, 标题: '无数据' }])
      XLSX.utils.book_append_sheet(wb, ws, date)
    }
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `跌词-${domain}-${startDate}至${endDate}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    fetch('/api/log-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'rankdown-export', domain, ok: totalKw, durationMs: Date.now() - t0, summary: `跌词导出 ${domain} ${startDate}至${endDate}，共 ${totalKw} 个词` }),
    }).catch(() => {})
    setStatus('done')
    setProgress('导出完成')
  }

  const busy = status === 'verifying' || status === 'crawling'
  const dayDiff = startDate && endDate
    ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000)
    : 0
  const rangeExceeds = dayDiff > 6

  return (
    <>
      <button
        onClick={openDialog}
        className="text-xs text-gray-400 hover:text-red-600 transition-colors"
      >
        跌词导出
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">跌词导出</h3>
            <p className="text-xs text-gray-400 mb-4">从爱站抓取指定站点的跌出关键词并导出 Excel</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">网站域名</label>
                <input
                  type="text"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  disabled={busy}
                  placeholder="例如 xxx.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">开始日期</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    disabled={busy}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">结束日期</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    disabled={busy}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50"
                  />
                </div>
              </div>
              {rangeExceeds && (
                <p className="text-xs text-red-500">抓取范围超出 7 天（爱站最多保留 7 天数据）</p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={busy}
                  placeholder="your@email.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50"
                />
              </div>

              {err && <p className="text-xs text-red-500">{err}</p>}
              {progress && <p className="text-xs text-blue-500">{progress}</p>}
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                {status === 'done' ? '关闭' : '取消'}
              </button>
              {status !== 'done' && (
                <button
                  onClick={handleStart}
                  disabled={busy || !domain || !email || !password || rangeExceeds}
                  className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 font-medium"
                >
                  {status === 'verifying' ? '验证中...' : status === 'crawling' ? '抓取中...' : '开始导出'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── AlertCard ────────────────────────────────────────────────────────────────

const PALETTE = {
  yellow: { border: 'border-yellow-100', count: 'text-yellow-500', pulse: 'bg-yellow-400' },
  orange: { border: 'border-orange-100', count: 'text-orange-500', pulse: 'bg-orange-400' },
  red:    { border: 'border-red-100',    count: 'text-red-500',    pulse: 'bg-red-400'    },
  teal:   { border: 'border-teal-100',   count: 'text-teal-500',   pulse: 'bg-teal-400'   },
  green:  { border: 'border-green-100',  count: 'text-green-500',  pulse: 'bg-green-400'  },
  gray:   { border: 'border-gray-100',   count: 'text-gray-300',   pulse: 'bg-gray-300'   },
}

function AlertCard({
  title, count, color, empty, children, action,
}: {
  title: string
  count: number
  color: keyof typeof PALETTE
  empty: string
  children: ReactNode
  action?: ReactNode
}) {
  const c = PALETTE[color]
  const isPlaceholder = count < 0
  const hasAlerts = count > 0

  return (
    <div className={`rounded-xl border ${c.border} bg-white p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {hasAlerts && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.pulse} animate-pulse`} />}
          <span className="text-sm font-medium text-gray-600">{title}</span>
        </div>
        {action ?? (
          <span className={`text-2xl font-bold ${c.count}`}>
            {isPlaceholder ? '—' : count}
          </span>
        )}
      </div>
      <div>
        {isPlaceholder || !hasAlerts ? (
          <p className="text-xs text-gray-400">{empty}</p>
        ) : (
          <div className="max-h-24 overflow-y-auto space-y-0.5 pr-1">
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SortedTooltip ───────────────────────────────────────────────────────────

function SortedTooltip({
  active, payload, label, siteMap, siteIds, colorMap, hoveredId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?: boolean; payload?: readonly any[]; label?: string | number
  siteMap: Map<string, Site>
  siteIds?: string[]
  colorMap?: Record<string, string>
  hoveredId?: string | null
}) {
  if (!active || !payload) return null

  // Build value map from payload for quick lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const valueMap = new Map<string, any>()
  for (const p of payload) {
    if (p.name != null) valueMap.set(String(p.name), p)
  }

  // Use siteIds as the definitive order (sorted by value desc, nulls last)
  const ids = siteIds ?? payload.map(p => String(p.name))
  const withData = ids.filter(id => valueMap.get(id)?.value != null).sort((a, b) => (valueMap.get(b)?.value ?? 0) - (valueMap.get(a)?.value ?? 0))
  const noData = ids.filter(id => valueMap.get(id)?.value == null)
  const all = [...withData, ...noData]
  if (all.length === 0) return null

  const cols = all.length <= 8 ? 1 : all.length <= 18 ? 2 : 3
  const perCol = Math.ceil(all.length / cols)
  const chunks = Array.from({ length: cols }, (_, c) => all.slice(c * perCol, (c + 1) * perCol))

  const renderItem = (id: string, i: number) => {
    const p = valueMap.get(id)
    const color = p?.color ?? colorMap?.[id] ?? '#9ca3af'
    const hasValue = p?.value != null
    const isHovered = id === hoveredId
    return (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '1px 0' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
        <span style={{ color: hasValue ? '#374151' : '#9ca3af', whiteSpace: 'nowrap', fontWeight: isHovered ? 700 : 400 }}>
          {siteMap.get(id)?.domain ?? id}
          <span style={{ color: '#9ca3af', fontWeight: isHovered ? 700 : 400 }}> : </span>
          {hasValue ? (typeof p.value === 'number' ? p.value.toLocaleString() : p.value) : '—'}
        </span>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: '#6b7280', marginBottom: 6, fontWeight: 500 }}>日期：{label}</p>
      <div style={{ display: 'flex', gap: 20 }}>
        {chunks.map((chunk, ci) => (
          <div key={ci}>{chunk.map((id, i) => renderItem(id, i))}</div>
        ))}
      </div>
    </div>
  )
}

// ─── CompareChart ─────────────────────────────────────────────────────────────

function CompareChart({
  data, siteIds, colorMap, siteMap, yFormatter,
}: {
  data: Record<string, string | number>[]
  siteIds: string[]
  colorMap: Record<string, string>
  siteMap: Map<string, Site>
  yFormatter: (v: number) => string
}) {
  const [focusedIds, setFocusedIds] = useState<Set<string>>(new Set())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const lineClickedRef = useRef(false)

  function toggleFocus(id: string) {
    setFocusedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (siteIds.length === 0 || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 rounded-lg bg-gray-50 text-gray-400 text-sm">
        {siteIds.length === 0 ? '该分类暂无站点' : '暂无数据'}
      </div>
    )
  }

  let rawMax = 0
  for (const row of data) {
    for (const id of siteIds) {
      const v = row[id]
      if (typeof v === 'number' && v > rawMax) rawMax = v
    }
  }
  const maxVal = niceMax(rawMax)
  const yTicks = Array.from({ length: 11 }, (_, i) => Math.round(maxVal * i / 10))

  return (
    <ResponsiveContainer width="100%" height={420}>
      <LineChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
        onClick={() => { if (!lineClickedRef.current) setFocusedIds(new Set()); lineClickedRef.current = false }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={46}
          domain={[0, maxVal]}
          ticks={yTicks}
          tickFormatter={(v: number) => yFormatter(v)}
        />
        <Tooltip content={(props) => <SortedTooltip {...props} siteMap={siteMap} siteIds={siteIds} colorMap={colorMap} hoveredId={hoveredId} />} />
        {siteIds.map(id => {
          const dimmed = focusedIds.size > 0 && !focusedIds.has(id)
          return (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={id}
              stroke={colorMap[id]}
              strokeWidth={2}
              strokeOpacity={dimmed ? 0.15 : 1}
              connectNulls
              dot={(props: { cx?: number; cy?: number; value?: number; index?: number }) => {
                const { cx, cy, value, index } = props
                if (!value || cx == null || cy == null) return <g key={index ?? 0} />
                return <circle key={index ?? 0} cx={cx} cy={cy} r={3} fill="white" stroke={colorMap[id]} strokeWidth={1.5} strokeOpacity={dimmed ? 0.15 : 1} />
              }}
              activeDot={{ r: 4, fill: colorMap[id], stroke: 'white', strokeWidth: 2 }}
              onClick={() => { lineClickedRef.current = true; toggleFocus(id) }}
              onMouseEnter={() => setHoveredId(id)}
              onMouseLeave={() => setHoveredId(null)}
            />
          )
        })}
      </LineChart>
    </ResponsiveContainer>
  )
}
