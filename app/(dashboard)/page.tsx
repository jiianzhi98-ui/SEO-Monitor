'use client'

import { useEffect, useState, useMemo } from 'react'
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
interface AlertItem { domain: string }
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

// Fixed Y-axis domains per category
const INDEX_DOMAIN: Record<Category, [number, number]> = {
  large:  [0, 10_000_000],  // 0 – 1000w
  medium: [0,  5_000_000],  // 0 – 500w
  small:  [0,  2_000_000],  // 0 – 200w
}
const MOBILE_IP_DOMAIN: Record<Category, [number, number]> = {
  large:  [0, 150_000],  // 0 – 15w
  medium: [0,  80_000],  // 0 – 8w
  small:  [0,  30_000],  // 0 – 3w
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
      const d7 = getMY(-7)
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
        const yStat = ss.find(r => r.stat_date === yesterday)
        if (!yStat) continue
        const avg = ss.length > 0 ? ss.reduce((a, r) => a + r.new_count, 0) / ss.length : 0
        if (avg > 0 && yStat.new_count / avg < 0.3) kAlerts.push({ domain: s.domain })
      }
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

        <AlertCard title="新增异常" count={kwAlerts.length} color="orange" empty="各站新增正常">
          {kwAlerts.map((a, i) => (
            <p key={i} className="text-xs text-gray-700 truncate py-0.5">{a.domain}</p>
          ))}
        </AlertCard>

        <AlertCard
          title="收录异常"
          count={indexAlerts.length}
          color={indexAlerts.some(a => a.status === 'danger') ? 'red' : indexAlerts.some(a => a.status === 'warning') ? 'orange' : indexAlerts.some(a => a.status === 'rising') ? 'teal' : 'gray'}
          empty="各站收录正常"
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
                domain={INDEX_DOMAIN[activeCategory]}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-3">移动 IP 均值趋势</p>
              <CompareChart
                data={getMobileIPData(activeIds)}
                siteIds={activeIds}
                colorMap={Object.fromEntries(activeIds.map(id => [id, siteColor(activeCategory, id)]))}
                domain={MOBILE_IP_DOMAIN[activeCategory]}
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

  // Export auth dialog
  const [showDialog, setShowDialog] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  async function handleSearch() {
    setLoading(true)
    try {
      const res = await fetch(`/api/keyword-volume?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setRows(data.keywords || [])
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }

  function openExportDialog() {
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
      const res = await fetch('/api/keyword-volume?export=1')
      const data = await res.json()
      const all: KwVolRow[] = data.keywords || []
      const csv = ['关键词,搜索量', ...all.map(r => `"${r.keyword}",${r.volume}`)].join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `keywords-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      <div className="rounded-xl border border-green-100 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-600">搜索量查询</span>
          <button
            onClick={openExportDialog}
            className="text-xs text-gray-400 hover:text-green-600 transition-colors"
          >
            导出全部
          </button>
        </div>

        <div className="flex gap-1.5 mb-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="搜索词..."
            className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {loading ? '...' : '搜索'}
          </button>
        </div>

        <div className="max-h-28 overflow-y-auto">
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
      </div>

      {/* Export auth dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">验证身份</h3>
            <p className="text-xs text-gray-400 mb-5">导出数据需要验证账号权限</p>

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
  title, count, color, empty, children,
}: {
  title: string
  count: number
  color: keyof typeof PALETTE
  empty: string
  children: ReactNode
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
        <span className={`text-2xl font-bold ${c.count}`}>
          {isPlaceholder ? '—' : count}
        </span>
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
  active, payload, label, siteMap,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  active?: boolean; payload?: readonly any[]; label?: string | number
  siteMap: Map<string, Site>
}) {
  if (!active || !payload || payload.length === 0) return null
  const sorted = [...payload]
    .filter(p => p.value != null)
    .sort((a, b) => b.value - a.value)

  const cols = sorted.length <= 8 ? 1 : sorted.length <= 18 ? 2 : 3
  // Split into equal column chunks so reading order goes DOWN each column then to the next
  const perCol = Math.ceil(sorted.length / cols)
  const chunks = Array.from({ length: cols }, (_, c) => sorted.slice(c * perCol, (c + 1) * perCol))

  const renderItem = (p: { name: string; value: number; color: string }, i: number) => (
    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '1px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: p.color, flexShrink: 0 }} />
      <span style={{ color: '#374151', whiteSpace: 'nowrap' }}>
        {siteMap.get(p.name)?.domain ?? p.name}
        <span style={{ color: '#9ca3af' }}> : </span>
        {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
      </span>
    </div>
  )

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <p style={{ color: '#6b7280', marginBottom: 6, fontWeight: 500 }}>日期：{label}</p>
      <div style={{ display: 'flex', gap: 20 }}>
        {chunks.map((chunk, ci) => (
          <div key={ci}>{chunk.map((p, i) => renderItem(p, i))}</div>
        ))}
      </div>
    </div>
  )
}

// ─── CompareChart ─────────────────────────────────────────────────────────────

function CompareChart({
  data, siteIds, colorMap, siteMap, yFormatter, domain,
}: {
  data: Record<string, string | number>[]
  siteIds: string[]
  colorMap: Record<string, string>
  siteMap: Map<string, Site>
  yFormatter: (v: number) => string
  domain: [number, number]
}) {
  if (siteIds.length === 0 || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 rounded-lg bg-gray-50 text-gray-400 text-sm">
        {siteIds.length === 0 ? '该分类暂无站点' : '暂无数据'}
      </div>
    )
  }

  const yTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round(domain[0] + (domain[1] - domain[0]) * i / 4)
  )

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
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
          domain={domain}
          ticks={yTicks}
          allowDataOverflow
          tickFormatter={(v: number) => yFormatter(v)}
        />
        <Tooltip content={(props) => <SortedTooltip {...props} siteMap={siteMap} />} />
        {siteIds.map(id => (
          <Line
            key={id}
            type="monotone"
            dataKey={id}
            name={id}
            stroke={colorMap[id]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
