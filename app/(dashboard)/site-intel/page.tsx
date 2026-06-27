'use client'

import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'

interface AizhanData {
  pc: number; mobile: number; indexCount: number
  pcIpMin: number; pcIpMax: number; pcIpAvg: number
  mobileIpMin: number; mobileIpMax: number; mobileIpAvg: number
}

interface RankEntry { keyword: string; volume: number }
interface UnstableEntry { keyword: string; volume: number; upDays: number; downDays: number; totalDays: number }
interface KwEntry { keyword: string }

interface SiteIntelData {
  domain: string
  isTracked: boolean
  siteId: string | null
  pcWeight: number; mobileWeight: number
  pcIpMin: number; pcIpMax: number
  mobileIpMin: number; mobileIpMax: number
  indexCount: number
  pcWeightChange: number; mobileWeightChange: number
  pcIpAvgChange: number; mobileIpAvgChange: number
  indexChange: number
  weightTrend: { date: string; pc: number; mobile: number }[]
  indexTrend: { date: string; count: number }[]
  ipTrend: { date: string; pcAvg: number; mobileAvg: number }[]
  kwDate: string
  appKw: KwEntry[]; gameKw: KwEntry[]
  appKwAll: KwEntry[]; gameKwAll: KwEntry[]
  appCount: number; gameCount: number
  rankDate: string
  rankupAll: RankEntry[]; rankdownAll: RankEntry[]
  unstableAll: UnstableEntry[]
}

function fmt(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1).replace('.0', '') + 'w'
  return n.toLocaleString()
}

function ChangeTag({ change }: { change: number }) {
  if (change === 0) return null
  return (
    <span className={`text-xs font-semibold ${change > 0 ? 'text-green-600' : 'text-red-500'}`}>
      {change > 0 ? `↑${fmt(Math.abs(change))}` : `↓${fmt(Math.abs(change))}`}
    </span>
  )
}

function MetricCard({ label, value, change }: { label: string; value: string; change: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 min-w-0">
      <p className="text-xs text-gray-400 mb-1.5">{label}</p>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-bold text-gray-900 tabular-nums">{value}</span>
        <ChangeTag change={change} />
      </div>
    </div>
  )
}

function SectionCard({ title, headerRight, children }: { title: string; headerRight?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {headerRight}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-32 text-sm text-gray-400">{text}</div>
}

function PaginationBar({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1 && total <= pageSize) return null
  return (
    <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100 text-xs text-gray-500">
      <span>共 {total} 条</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(0)} disabled={page === 0} className="px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30">«</button>
        <button onClick={() => onChange(page - 1)} disabled={page === 0} className="px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30">‹</button>
        <span className="px-2">{page + 1} / {totalPages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page >= totalPages - 1} className="px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30">›</button>
        <button onClick={() => onChange(totalPages - 1)} disabled={page >= totalPages - 1} className="px-1.5 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30">»</button>
      </div>
    </div>
  )
}

function MoreModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  )
}

const MODAL_PS = 50

export default function SiteIntelPage() {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<SiteIntelData | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)

  const [kwTab, setKwTab] = useState<'app' | 'game'>('app')
  const [rankTab, setRankTab] = useState<'up' | 'down'>('up')

  const [kwModal, setKwModal] = useState(false)
  const [kwModalPage, setKwModalPage] = useState(0)
  const [rankModal, setRankModal] = useState(false)
  const [rankModalPage, setRankModalPage] = useState(0)
  const [rankModalTab, setRankModalTab] = useState<'up' | 'down'>('up')
  const [unstableModal, setUnstableModal] = useState(false)
  const [unstableModalPage, setUnstableModalPage] = useState(0)

  async function fetchSuggestions(raw: string) {
    const q = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
    if (!q) { setSuggestions([]); return }
    const supabase = getBrowserClient()
    const { data: rows } = await supabase.from('sites').select('domain').ilike('domain', `%${q}%`).limit(8)
    setSuggestions((rows || []).map((r: { domain: string }) => r.domain))
  }

  async function handleSearch(e?: React.FormEvent, domainOverride?: string) {
    e?.preventDefault()
    const d = (domainOverride ?? input).trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
    if (!d) return
    setShowSuggestions(false)
    setSuggestions([])

    setLoading(true)
    setData(null)
    setError(null)
    setKwTab('app')
    setRankTab('up')

    try {
      const supabase = getBrowserClient()
      const d30ago = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

      const { data: siteRow } = await supabase.from('sites')
        .select('id, domain').eq('domain', d).maybeSingle() as { data: { id: string; domain: string } | null }

      const isTracked = !!siteRow
      const siteId = siteRow?.id ?? null

      const aizhanRes = await fetch(`/api/site-intel?domain=${encodeURIComponent(d)}`)
      const az: AizhanData = await aizhanRes.json()

      const result: SiteIntelData = {
        domain: d, isTracked, siteId,
        pcWeight: az.pc ?? 0, mobileWeight: az.mobile ?? 0,
        pcIpMin: az.pcIpMin ?? 0, pcIpMax: az.pcIpMax ?? 0,
        mobileIpMin: az.mobileIpMin ?? 0, mobileIpMax: az.mobileIpMax ?? 0,
        indexCount: az.indexCount ?? 0,
        pcWeightChange: 0, mobileWeightChange: 0,
        pcIpAvgChange: 0, mobileIpAvgChange: 0, indexChange: 0,
        weightTrend: [], indexTrend: [], ipTrend: [],
        kwDate: '', appKw: [], gameKw: [], appKwAll: [], gameKwAll: [],
        appCount: 0, gameCount: 0,
        rankDate: '', rankupAll: [], rankdownAll: [],
        unstableAll: [],
      }

      if (isTracked && siteId) {
        const [
          { data: wh },
          { data: is },
          { data: rd },
          { data: appRaw },
          { data: gameRaw },
        ] = await Promise.all([
          supabase.from('weight_history')
            .select('record_date,pc_weight,mobile_weight,pc_ip,pc_ip_max,mobile_ip,mobile_ip_max')
            .eq('site_id', siteId).gte('record_date', d30ago).order('record_date'),
          supabase.from('index_snapshots')
            .select('snapshot_date,index_count')
            .eq('site_id', siteId).gte('snapshot_date', d30ago).order('snapshot_date'),
          supabase.from('rank_changes')
            .select('keyword,volume,type,stat_date')
            .eq('site_id', siteId).gte('stat_date', d30ago)
            .order('stat_date', { ascending: false }).limit(5000),
          supabase.from('raw_keywords')
            .select('keyword,content_date,content_type')
            .eq('site_id', siteId)
            .or('content_type.eq.app,content_type.is.null')
            .not('keyword', 'like', '%电脑版%')
            .order('content_date', { ascending: false }).limit(200),
          supabase.from('raw_keywords')
            .select('keyword,content_date,content_type')
            .eq('site_id', siteId)
            .eq('content_type', 'game')
            .not('keyword', 'like', '%电脑版%')
            .order('content_date', { ascending: false }).limit(200),
        ])

        // Weight history
        type WH = { record_date: string; pc_weight: number; mobile_weight: number; pc_ip: number; pc_ip_max: number; mobile_ip: number; mobile_ip_max: number }
        const whArr = (wh || []) as WH[]
        if (whArr.length >= 1) {
          const latest = whArr[whArr.length - 1]
          const prev = whArr.length >= 2 ? whArr[whArr.length - 2] : null
          const lPcAvg = Math.round((latest.pc_ip + latest.pc_ip_max) / 2)
          const lMobAvg = Math.round((latest.mobile_ip + latest.mobile_ip_max) / 2)
          result.pcWeightChange = prev ? latest.pc_weight - prev.pc_weight : 0
          result.mobileWeightChange = prev ? latest.mobile_weight - prev.mobile_weight : 0
          result.pcIpAvgChange = prev ? lPcAvg - Math.round((prev.pc_ip + prev.pc_ip_max) / 2) : 0
          result.mobileIpAvgChange = prev ? lMobAvg - Math.round((prev.mobile_ip + prev.mobile_ip_max) / 2) : 0
          result.weightTrend = whArr.map(h => ({ date: h.record_date.slice(5), pc: h.pc_weight, mobile: h.mobile_weight }))
          result.ipTrend = whArr.map(h => ({ date: h.record_date.slice(5), pcAvg: Math.round((h.pc_ip + h.pc_ip_max) / 2), mobileAvg: Math.round((h.mobile_ip + h.mobile_ip_max) / 2) }))
          if (result.pcWeight === 0) {
            result.pcWeight = latest.pc_weight; result.mobileWeight = latest.mobile_weight
            result.pcIpMin = latest.pc_ip; result.pcIpMax = latest.pc_ip_max
            result.mobileIpMin = latest.mobile_ip; result.mobileIpMax = latest.mobile_ip_max
          }
        }

        // Index history
        type IS = { snapshot_date: string; index_count: number }
        const isArr = (is || []) as IS[]
        if (isArr.length >= 1) {
          const latest = isArr[isArr.length - 1]
          const prev = isArr.length >= 2 ? isArr[isArr.length - 2] : null
          result.indexChange = prev ? latest.index_count - prev.index_count : 0
          if (result.indexCount === 0) result.indexCount = latest.index_count
          result.indexTrend = isArr.map(s => ({ date: s.snapshot_date.slice(5), count: s.index_count }))
        }

        // Rank changes
        type RD = { keyword: string; volume: number; type: string; stat_date: string }
        const rdArr = (rd || []) as RD[]
        const latestRankDate = rdArr.length > 0 ? rdArr[0].stat_date : ''
        result.rankDate = latestRankDate
        if (latestRankDate) {
          const today = rdArr.filter(r => r.stat_date === latestRankDate)
          result.rankupAll = today.filter(r => r.type === 'rankup').map(r => ({ keyword: r.keyword, volume: r.volume })).sort((a, b) => b.volume - a.volume)
          result.rankdownAll = today.filter(r => r.type === 'rankdown').map(r => ({ keyword: r.keyword, volume: r.volume })).sort((a, b) => b.volume - a.volume)
        }

        // Unstable keywords
        const upMap = new Map<string, number>()
        const downMap = new Map<string, number>()
        const volMap = new Map<string, number[]>()
        for (const r of rdArr) {
          if (r.type === 'rankup') upMap.set(r.keyword, (upMap.get(r.keyword) ?? 0) + 1)
          else downMap.set(r.keyword, (downMap.get(r.keyword) ?? 0) + 1)
          if (r.volume > 0) {
            if (!volMap.has(r.keyword)) volMap.set(r.keyword, [])
            volMap.get(r.keyword)!.push(r.volume)
          }
        }
        const unstable: UnstableEntry[] = []
        for (const [kw, upDays] of Array.from(upMap.entries())) {
          const downDays = downMap.get(kw) ?? 0
          if (downDays > 0 && upDays + downDays >= 3) {
            const vols = volMap.get(kw) || []
            const volume = vols.length > 0 ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length) : 0
            unstable.push({ keyword: kw, volume, upDays, downDays, totalDays: upDays + downDays })
          }
        }
        unstable.sort((a, b) => b.volume - a.volume || b.totalDays - a.totalDays)
        result.unstableAll = unstable

        // Keywords
        type KwRaw = { keyword: string; content_date: string; content_type: string }
        const latestAppDate = (appRaw || []).length > 0 ? (appRaw![0] as KwRaw).content_date : ''
        const latestGameDate = (gameRaw || []).length > 0 ? (gameRaw![0] as KwRaw).content_date : ''
        const latestKwDate = [latestAppDate, latestGameDate].filter(Boolean).sort().reverse()[0] || ''
        result.kwDate = latestKwDate

        const appAll = ((appRaw || []) as KwRaw[]).filter(k => k.content_date === latestKwDate).map(k => ({ keyword: k.keyword }))
        const gameAll = ((gameRaw || []) as KwRaw[]).filter(k => k.content_date === latestKwDate).map(k => ({ keyword: k.keyword }))
        result.appKwAll = appAll
        result.gameKwAll = gameAll
        result.appKw = appAll.slice(0, 12)
        result.gameKw = gameAll.slice(0, 12)

        if (latestKwDate) {
          const [appCnt, gameCnt] = await Promise.all([
            supabase.from('raw_keywords').select('id', { count: 'exact', head: true })
              .eq('site_id', siteId).eq('content_date', latestKwDate)
              .or('content_type.eq.app,content_type.is.null').not('keyword', 'like', '%电脑版%'),
            supabase.from('raw_keywords').select('id', { count: 'exact', head: true })
              .eq('site_id', siteId).eq('content_date', latestKwDate)
              .eq('content_type', 'game').not('keyword', 'like', '%电脑版%'),
          ])
          result.appCount = appCnt.count ?? appAll.length
          result.gameCount = gameCnt.count ?? gameAll.length
        }
      }

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败')
    } finally {
      setLoading(false)
    }
  }

  const kwList = kwTab === 'app' ? (data?.appKw ?? []) : (data?.gameKw ?? [])
  const kwCount = kwTab === 'app' ? (data?.appCount ?? 0) : (data?.gameCount ?? 0)
  const kwAllList = kwTab === 'app' ? (data?.appKwAll ?? []) : (data?.gameKwAll ?? [])
  const kwModalTitle = `最近新增 · ${kwTab === 'app' ? '应用' : '游戏'}关键词${data?.kwDate ? ` (${data.kwDate})` : ''}`

  const rankList = rankTab === 'up' ? (data?.rankupAll ?? []).slice(0, 12) : (data?.rankdownAll ?? []).slice(0, 12)
  const rankCount = rankTab === 'up' ? (data?.rankupAll?.length ?? 0) : (data?.rankdownAll?.length ?? 0)
  const rankModalList = rankModalTab === 'up' ? (data?.rankupAll ?? []) : (data?.rankdownAll ?? [])
  const rankModalTitle = `排名波动 · ${rankModalTab === 'up' ? '涨入' : '跌出'}${data?.rankDate ? ` (${data.rankDate})` : ''}`

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">站点情报</h1>
        <p className="text-gray-500 text-sm mt-1">输入任意域名，查询权重、收录、IP流量及关键词动向</p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={e => {
              setInput(e.target.value)
              setHighlightIdx(-1)
              fetchSuggestions(e.target.value)
              setShowSuggestions(true)
            }}
            onKeyDown={e => {
              if (!showSuggestions || suggestions.length === 0) return
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, suggestions.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, -1)) }
              else if (e.key === 'Enter' && highlightIdx >= 0) {
                e.preventDefault()
                const chosen = suggestions[highlightIdx]
                setInput(chosen)
                setSuggestions([])
                setShowSuggestions(false)
                setHighlightIdx(-1)
                handleSearch(undefined, chosen)
              } else if (e.key === 'Escape') { setShowSuggestions(false) }
            }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="输入域名关键字，如 game、apk…"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  onMouseDown={() => {
                    setInput(s)
                    setSuggestions([])
                    setShowSuggestions(false)
                    handleSearch(undefined, s)
                  }}
                  className={`px-4 py-2 text-sm cursor-pointer ${i === highlightIdx ? 'bg-green-50 text-green-700' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '查询中…' : '查询'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm mb-6">{error}</div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400 gap-3">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          正在查询…
        </div>
      )}

      {data && !loading && (
        <div className="space-y-5">
          {/* Domain header */}
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">{data.domain}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${data.isTracked ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {data.isTracked ? '已追踪' : '未追踪'}
            </span>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
            <MetricCard label="PC权重" value={String(data.pcWeight)} change={data.pcWeightChange} />
            <MetricCard label="移动权重" value={String(data.mobileWeight)} change={data.mobileWeightChange} />
            <MetricCard
              label="PC日均IP"
              value={data.pcIpMin === 0 && data.pcIpMax === 0 ? '-' : `${fmt(data.pcIpMin)}~${fmt(data.pcIpMax)}`}
              change={data.pcIpAvgChange}
            />
            <MetricCard
              label="移动日均IP"
              value={data.mobileIpMin === 0 && data.mobileIpMax === 0 ? '-' : `${fmt(data.mobileIpMin)}~${fmt(data.mobileIpMax)}`}
              change={data.mobileIpAvgChange}
            />
            <MetricCard
              label="百度收录"
              value={data.indexCount > 0 ? fmt(data.indexCount) : '-'}
              change={data.indexChange}
            />
          </div>

          {/* Row 1: Weight trend + Index trend */}
          <div className="grid grid-cols-2 gap-5">
            <SectionCard title="权重趋势（近30天）">
              {data.weightTrend.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data.weightTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} width={24} />
                      <Tooltip />
                      <Line type="monotone" dataKey="pc" name="PC权重" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="mobile" name="移动权重" stroke="#f97316" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 inline-block" />PC权重</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-orange-500 inline-block" />移动权重</span>
                  </div>
                </>
              ) : (
                <EmptyState text={data.isTracked ? '数据积累中…' : '未追踪站点，无历史数据'} />
              )}
            </SectionCard>

            <SectionCard title="收录趋势（近30天）">
              {data.indexTrend.length >= 2 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data.indexTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString() : String(v)} />
                    <Line type="monotone" dataKey="count" name="百度收录" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState text={data.isTracked ? '数据积累中…' : '未追踪站点，无历史数据'} />
              )}
            </SectionCard>
          </div>

          {/* Row 2: IP trend + New keywords */}
          <div className="grid grid-cols-2 gap-5">
            <SectionCard title="来路IP趋势（近30天）">
              {data.ipTrend.length >= 2 ? (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data.ipTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} width={52} tickFormatter={v => fmt(v)} />
                      <Tooltip formatter={(v: unknown) => typeof v === 'number' ? v.toLocaleString() : String(v)} />
                      <Line type="monotone" dataKey="pcAvg" name="PC均值" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="mobileAvg" name="移动均值" stroke="#f97316" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-blue-500 inline-block" />PC均值</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-orange-500 inline-block" />移动均值</span>
                  </div>
                </>
              ) : (
                <EmptyState text={data.isTracked ? '数据积累中…' : '未追踪站点，无历史数据'} />
              )}
            </SectionCard>

            <SectionCard
              title={`最近新增关键词${data.kwDate ? ` · ${data.kwDate}` : ''}`}
              headerRight={
                <div className="flex gap-1">
                  <button onClick={() => setKwTab('app')}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${kwTab === 'app' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    应用{kwTab === 'app' ? ` (${data.appCount})` : ''}
                  </button>
                  <button onClick={() => setKwTab('game')}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${kwTab === 'game' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    游戏{kwTab === 'game' ? ` (${data.gameCount})` : ''}
                  </button>
                </div>
              }
            >
              {!data.isTracked ? (
                <EmptyState text="未追踪站点，无关键词数据" />
              ) : kwList.length === 0 ? (
                <EmptyState text="暂无数据" />
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {kwList.slice(0, 6).map((k, i) => (
                        <div key={i} className="h-6 flex items-center text-xs text-gray-800 truncate">{k.keyword}</div>
                      ))}
                    </div>
                    {kwList.length > 6 && (
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {kwList.slice(6, 12).map((k, i) => (
                          <div key={i + 6} className="h-6 flex items-center text-xs text-gray-800 truncate">{k.keyword}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  {kwCount > 12 && (
                    <button
                      onClick={() => { setKwModal(true); setKwModalPage(0) }}
                      className="mt-3 text-xs text-green-600 hover:underline w-full text-center"
                    >
                      查看更多（共 {kwCount} 条）
                    </button>
                  )}
                </>
              )}
            </SectionCard>
          </div>

          {/* Row 3: Rank changes + Unstable */}
          <div className="grid grid-cols-2 gap-5">
            <SectionCard
              title={`排名波动${data.rankDate ? ` · ${data.rankDate}` : ''}`}
              headerRight={
                <div className="flex gap-1">
                  <button onClick={() => setRankTab('up')}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${rankTab === 'up' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    涨入{rankTab === 'up' ? ` (${data.rankupAll.length})` : ''}
                  </button>
                  <button onClick={() => setRankTab('down')}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${rankTab === 'down' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    跌出{rankTab === 'down' ? ` (${data.rankdownAll.length})` : ''}
                  </button>
                </div>
              }
            >
              {!data.isTracked ? (
                <EmptyState text="未追踪站点，无排名数据" />
              ) : rankList.length === 0 ? (
                <EmptyState text="暂无数据" />
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {rankList.slice(0, 6).map((r, i) => (
                        <div key={i} className="h-6 flex items-center gap-1.5 text-xs">
                          <span className="text-gray-800 flex-1 truncate">{r.keyword}</span>
                          {r.volume > 0 && <span className="text-gray-400 flex-shrink-0">{r.volume.toLocaleString()}</span>}
                        </div>
                      ))}
                    </div>
                    {rankList.length > 6 && (
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {rankList.slice(6, 12).map((r, i) => (
                          <div key={i + 6} className="h-6 flex items-center gap-1.5 text-xs">
                            <span className="text-gray-800 flex-1 truncate">{r.keyword}</span>
                            {r.volume > 0 && <span className="text-gray-400 flex-shrink-0">{r.volume.toLocaleString()}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {rankCount > 12 && (
                    <button
                      onClick={() => { setRankModal(true); setRankModalTab(rankTab); setRankModalPage(0) }}
                      className="mt-3 text-xs text-green-600 hover:underline w-full text-center"
                    >
                      查看更多（共 {rankCount} 条）
                    </button>
                  )}
                </>
              )}
            </SectionCard>

            <SectionCard title="不稳定词（近30天反复涨跌）">
              {!data.isTracked ? (
                <EmptyState text="未追踪站点，无数据" />
              ) : data.unstableAll.length === 0 ? (
                <EmptyState text="近30天无反复波动词" />
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {data.unstableAll.slice(0, 6).map((u, i) => (
                        <div key={i} className="h-6 flex items-center gap-1.5 text-xs">
                          <span className="text-gray-800 flex-1 truncate">{u.keyword}</span>
                          <span className="text-green-600 flex-shrink-0">↑{u.upDays}</span>
                          <span className="text-red-500 flex-shrink-0">↓{u.downDays}</span>
                        </div>
                      ))}
                    </div>
                    {data.unstableAll.length > 6 && (
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {data.unstableAll.slice(6, 12).map((u, i) => (
                          <div key={i + 6} className="h-6 flex items-center gap-1.5 text-xs">
                            <span className="text-gray-800 flex-1 truncate">{u.keyword}</span>
                            <span className="text-green-600 flex-shrink-0">↑{u.upDays}</span>
                            <span className="text-red-500 flex-shrink-0">↓{u.downDays}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {data.unstableAll.length > 12 && (
                    <button
                      onClick={() => { setUnstableModal(true); setUnstableModalPage(0) }}
                      className="mt-3 text-xs text-green-600 hover:underline w-full text-center"
                    >
                      查看更多（共 {data.unstableAll.length} 条）
                    </button>
                  )}
                </>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* Keyword modal */}
      {kwModal && data && (
        <MoreModal title={kwModalTitle} onClose={() => setKwModal(false)}>
          <div className="flex gap-2 mb-4">
            <button onClick={() => { setKwTab('app'); setKwModalPage(0) }} className={`text-xs px-3 py-1 rounded-full font-medium ${kwTab === 'app' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              应用 ({data.appCount})
            </button>
            <button onClick={() => { setKwTab('game'); setKwModalPage(0) }} className={`text-xs px-3 py-1 rounded-full font-medium ${kwTab === 'game' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              游戏 ({data.gameCount})
            </button>
          </div>
          {kwAllList.slice(kwModalPage * MODAL_PS, (kwModalPage + 1) * MODAL_PS).map((k, i) => (
            <div key={i} className="text-xs py-1.5 border-b border-gray-50 last:border-0 text-gray-800">
              {k.keyword}
            </div>
          ))}
          <PaginationBar page={kwModalPage} total={kwAllList.length} pageSize={MODAL_PS} onChange={setKwModalPage} />
        </MoreModal>
      )}

      {/* Rank modal */}
      {rankModal && data && (
        <MoreModal title={rankModalTitle} onClose={() => setRankModal(false)}>
          <div className="flex gap-2 mb-4">
            <button onClick={() => { setRankModalTab('up'); setRankModalPage(0) }} className={`text-xs px-3 py-1 rounded-full font-medium ${rankModalTab === 'up' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              涨入 ({data.rankupAll.length})
            </button>
            <button onClick={() => { setRankModalTab('down'); setRankModalPage(0) }} className={`text-xs px-3 py-1 rounded-full font-medium ${rankModalTab === 'down' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              跌出 ({data.rankdownAll.length})
            </button>
          </div>
          {rankModalList.slice(rankModalPage * MODAL_PS, (rankModalPage + 1) * MODAL_PS).map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-gray-800 flex-1">{r.keyword}</span>
              {r.volume > 0 && <span className="text-gray-400">{r.volume.toLocaleString()}</span>}
            </div>
          ))}
          <PaginationBar page={rankModalPage} total={rankModalList.length} pageSize={MODAL_PS} onChange={setRankModalPage} />
        </MoreModal>
      )}

      {/* Unstable modal */}
      {unstableModal && data && (
        <MoreModal title={`不稳定词 · 近30天（共 ${data.unstableAll.length} 条）`} onClose={() => setUnstableModal(false)}>
          {data.unstableAll.slice(unstableModalPage * MODAL_PS, (unstableModalPage + 1) * MODAL_PS).map((u, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-gray-800 flex-1">{u.keyword}</span>
              <span className="text-green-600">↑{u.upDays}</span>
              <span className="text-red-500">↓{u.downDays}</span>
              {u.volume > 0 && <span className="text-gray-400">{u.volume.toLocaleString()}</span>}
            </div>
          ))}
          <PaginationBar page={unstableModalPage} total={data.unstableAll.length} pageSize={MODAL_PS} onChange={setUnstableModalPage} />
        </MoreModal>
      )}
    </div>
  )
}
