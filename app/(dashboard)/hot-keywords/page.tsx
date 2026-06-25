'use client'

import { useEffect, useState, useMemo } from 'react'

interface WordEntry {
  keyword: string
  count: number
  siteCount: number
  sites: string[]
}

interface RankEntry {
  keyword: string
  siteCount: number
  volume: number
  sites: string[]
}

interface CrossEntry {
  keyword: string
  dims: string[]
  volume: number | null
}

interface RadarData {
  newWords: WordEntry[]
  rankWords: RankEntry[]
}

type Tab = 'cross' | 'new' | 'rank'
type PageSize = 50 | 100 | 500
const PAGE_SIZES: PageSize[] = [50, 100, 500]

function PaginationBar({ page, total, pageSize, onPageChange, onPageSizeChange }: {
  page: number; total: number; pageSize: PageSize
  onPageChange: (p: number) => void; onPageSizeChange: (s: PageSize) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 text-xs">
      <div className="flex items-center gap-1.5 text-gray-500">
        每页
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value) as PageSize)} className="border border-gray-200 rounded px-1 py-0.5 text-xs">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} 条</option>)}
        </select>
        <span className="ml-1 text-gray-400">共 {total} 条</span>
      </div>
      <div className="flex items-center gap-1">
        <button disabled={page === 0} onClick={() => onPageChange(0)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">«</button>
        <button disabled={page === 0} onClick={() => onPageChange(page - 1)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">‹</button>
        <span className="px-2 text-gray-600">{page + 1} / {totalPages}</span>
        <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">›</button>
        <button disabled={page >= totalPages - 1} onClick={() => onPageChange(totalPages - 1)} className="px-1.5 py-1 rounded border border-gray-200 disabled:opacity-30 hover:bg-gray-100">»</button>
      </div>
    </div>
  )
}

const TAB_CONFIG: { key: Tab; label: string }[] = [
  { key: 'cross', label: '交叉词' },
  { key: 'new', label: '共新增词' },
  { key: 'rank', label: '竞品涨排名' },
]

const DIM_LABELS: Record<string, { label: string; cls: string }> = {
  new: { label: '新增', cls: 'bg-blue-50 text-blue-600' },
  rank: { label: '涨排', cls: 'bg-orange-50 text-orange-600' },
}

function fmtVolume(v: number): string {
  if (v <= 0) return '—'
  if (v >= 10000) {
    const w = v / 10000
    return (w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)) + 'w'
  }
  return v.toLocaleString()
}

function SiteBadges({ sites }: { sites: string[] }) {
  const show = sites.slice(0, 3)
  const extra = sites.length - 3
  return (
    <div className="flex flex-wrap gap-1">
      {show.map((d) => (
        <span key={d} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
          {d}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">+{extra}</span>
      )}
    </div>
  )
}

export default function HotRadarPage() {
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('cross')
  const [minSites, setMinSites] = useState(3)
  const [copiedKw, setCopiedKw] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(50)

  useEffect(() => {
    setLoading(true)
    fetch('/api/hot-radar')
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setError(e.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!data) return null
    const nw = data.newWords.filter((w) => w.siteCount >= minSites)
    const rw = data.rankWords.filter((w) => w.siteCount >= minSites)

    const nwSet = new Set(nw.map((w) => w.keyword))
    const rwMap = new Map(rw.map((w) => [w.keyword, w]))

    const allKws = new Set(Array.from(nwSet).concat(Array.from(rwMap.keys())))
    const cw: CrossEntry[] = Array.from(allKws)
      .map((keyword) => {
        const dims: string[] = []
        if (nwSet.has(keyword)) dims.push('new')
        if (rwMap.has(keyword)) dims.push('rank')
        return { keyword, dims, volume: rwMap.get(keyword)?.volume ?? null }
      })
      .filter((w) => w.dims.length >= 2)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0) || b.dims.length - a.dims.length)

    return { newWords: nw, rankWords: rw.sort((a, b) => b.volume - a.volume || b.siteCount - a.siteCount), crossWords: cw }
  }, [data, minSites])

  async function copyKw(kw: string) {
    await navigator.clipboard.writeText(kw)
    setCopiedKw(kw)
    setTimeout(() => setCopiedKw(null), 1500)
  }

  const counts = filtered
    ? { cross: filtered.crossWords.length, new: filtered.newWords.length, rank: filtered.rankWords.length }
    : { cross: 0, new: 0, rank: 0 }

  function handleTabChange(tab: Tab) { setActiveTab(tab); setPage(0) }
  function handleMinSitesChange(v: number) { setMinSites(v); setPage(0) }

  const activeList = filtered
    ? activeTab === 'cross' ? filtered.crossWords
      : activeTab === 'new' ? filtered.newWords
      : filtered.rankWords
    : []
  const pagedList = activeList.slice(page * pageSize, (page + 1) * pageSize)

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">热词雷达</h1>
        <p className="text-gray-500 text-sm mt-1">近30天多竞品同时关注的词，捕捉趋势机会</p>
      </div>

      {/* Tab bar with counts */}
      <div className="flex items-center gap-2 mb-4">
        {TAB_CONFIG.map((tab) => {
          const count = counts[tab.key]
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-white text-gray-600'
                }`}
              >
                {loading ? '…' : count}
              </span>
            </button>
          )
        })}

        {/* Min sites filter */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">最少站点数</span>
          <select
            value={minSites}
            onChange={(e) => handleMinSitesChange(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value={2}>2站</option>
            <option value={3}>3站</option>
            <option value={4}>4站</option>
            <option value={5}>5站</option>
          </select>
        </div>
      </div>

      {/* Content */}
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
          <div className="overflow-x-auto">
            {activeTab === 'cross' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th w-8">#</th>
                    <th className="table-th">关键词</th>
                    <th className="table-th">命中维度</th>
                    <th className="table-th text-right">搜索量</th>
                    <th className="table-th text-right w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedList.length === 0 ? (
                    <tr><td colSpan={5} className="table-td text-center text-gray-400 py-10">暂无交叉词数据</td></tr>
                  ) : (
                    (pagedList as CrossEntry[]).map((w, i) => (
                      <tr key={w.keyword} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td text-gray-400 text-xs">{page * pageSize + i + 1}</td>
                        <td className="table-td font-medium text-gray-900">{w.keyword}</td>
                        <td className="table-td">
                          <div className="flex gap-1.5">
                            {w.dims.map((d) => (
                              <span key={d} className={`text-xs px-2 py-0.5 rounded font-medium ${DIM_LABELS[d]?.cls}`}>
                                {DIM_LABELS[d]?.label}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="table-td text-right text-gray-600 text-sm">
                          {w.volume != null ? fmtVolume(w.volume) : '—'}
                        </td>
                        <td className="table-td text-right">
                          <button onClick={() => copyKw(w.keyword)} className="text-xs text-gray-400 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                            {copiedKw === w.keyword ? '✓' : '复制'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'new' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th w-8">#</th>
                    <th className="table-th">关键词</th>
                    <th className="table-th text-center">新增次数</th>
                    <th className="table-th text-center">站点数</th>
                    <th className="table-th">出现站点</th>
                    <th className="table-th text-right w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedList.length === 0 ? (
                    <tr><td colSpan={6} className="table-td text-center text-gray-400 py-10">暂无数据</td></tr>
                  ) : (
                    (pagedList as WordEntry[]).map((w, i) => (
                      <tr key={w.keyword} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td text-gray-400 text-xs">{page * pageSize + i + 1}</td>
                        <td className="table-td font-medium text-gray-900">{w.keyword}</td>
                        <td className="table-td text-center text-gray-600">{w.count}次</td>
                        <td className="table-td text-center">
                          <span className="font-semibold text-gray-900">{w.siteCount}</span>
                          <span className="text-gray-400 text-xs">站</span>
                        </td>
                        <td className="table-td"><SiteBadges sites={w.sites} /></td>
                        <td className="table-td text-right">
                          <button onClick={() => copyKw(w.keyword)} className="text-xs text-gray-400 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                            {copiedKw === w.keyword ? '✓' : '复制'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'rank' && (
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-th w-8">#</th>
                    <th className="table-th">关键词</th>
                    <th className="table-th text-center">涨排站点数</th>
                    <th className="table-th text-right">搜索量</th>
                    <th className="table-th">出现站点</th>
                    <th className="table-th text-right w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pagedList.length === 0 ? (
                    <tr><td colSpan={6} className="table-td text-center text-gray-400 py-10">暂无数据</td></tr>
                  ) : (
                    (pagedList as RankEntry[]).map((w, i) => (
                      <tr key={w.keyword} className="hover:bg-gray-50 transition-colors">
                        <td className="table-td text-gray-400 text-xs">{page * pageSize + i + 1}</td>
                        <td className="table-td font-medium text-gray-900">{w.keyword}</td>
                        <td className="table-td text-center">
                          <span className="font-semibold text-gray-900">{w.siteCount}</span>
                          <span className="text-gray-400 text-xs">站</span>
                        </td>
                        <td className="table-td text-right text-gray-700 font-medium">{fmtVolume(w.volume)}</td>
                        <td className="table-td"><SiteBadges sites={w.sites} /></td>
                        <td className="table-td text-right">
                          <button onClick={() => copyKw(w.keyword)} className="text-xs text-gray-400 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                            {copiedKw === w.keyword ? '✓' : '复制'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          <PaginationBar
            page={page}
            total={activeList.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(ps) => { setPageSize(ps); setPage(0) }}
          />
          </>
        )}
      </div>
    </div>
  )
}
