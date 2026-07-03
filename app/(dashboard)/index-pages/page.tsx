'use client'

import { useEffect, useState, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'

interface SiteRow {
  id: string
  domain: string
  name: string
  has_index_pages: boolean
}

interface IndexedPage {
  id: string
  url: string
  title: string
  snippet: string
  baidu_date_str: string | null
  first_seen_date: string
  last_seen_date: string
}

const PAGE_SIZE = 20

type FilterType = 'all' | 'new7' | 'new30'

export default function IndexPagesPage() {
  const { role } = useUser()
  const isAdmin = role === 'super' || role === 'admin'

  const [sites, setSites] = useState<SiteRow[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [activeSiteId, setActiveSiteId] = useState<string>('')

  const [rows, setRows] = useState<IndexedPage[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')

  const [toggling, setToggling] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null)

  // Load all sites
  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.from('sites').select('id, domain, name, has_index_pages').order('name').then(({ data }) => {
      setSites((data || []) as SiteRow[])
      setSitesLoading(false)
    })
  }, [])

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [activeSiteId, debouncedSearch, filter])

  const fetchPages = useCallback(async () => {
    if (!activeSiteId) { setRows([]); setTotal(0); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        siteId: activeSiteId,
        page: String(page),
        filter,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      })
      const res = await fetch(`/api/sites/index-pages?${params}`)
      const data = await res.json()
      if (res.ok) { setRows(data.rows); setTotal(data.total) }
    } finally {
      setLoading(false)
    }
  }, [activeSiteId, page, debouncedSearch, filter])

  useEffect(() => { fetchPages() }, [fetchPages])

  const activeSite = sites.find(s => s.id === activeSiteId)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  async function handleToggle() {
    if (!activeSite || !isAdmin) return
    setToggling(true)
    const newVal = !activeSite.has_index_pages
    const res = await fetch('/api/sites/index-pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: activeSite.id, enabled: newVal }),
    })
    if (res.ok) {
      setSites(prev => prev.map(s => s.id === activeSite.id ? { ...s, has_index_pages: newVal } : s))
    }
    setToggling(false)
  }

  async function handleCrawl() {
    if (!activeSite) return
    setCrawling(true)
    setCrawlMsg(null)
    try {
      const res = await fetch('/api/trigger-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site: activeSite.domain, step: 'index-pages' }),
      })
      const data = await res.json()
      if (res.ok) {
        setCrawlMsg('抓取完成，刷新中…')
        await fetchPages()
      } else {
        setCrawlMsg(data.error || '抓取失败')
      }
    } catch {
      setCrawlMsg('请求失败')
    }
    setCrawling(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">收录页面追踪</h1>
        <p className="text-sm text-gray-500 mt-1">追踪百度收录的具体页面，记录首次发现时间</p>
      </div>

      {/* Site selector + controls */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {sitesLoading ? (
          <div className="h-9 w-48 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <select
            value={activeSiteId}
            onChange={e => setActiveSiteId(e.target.value)}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">— 选择站点 —</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>
                {s.domain}{s.has_index_pages ? ' ●' : ''}
              </option>
            ))}
          </select>
        )}

        {/* Toggle tracking */}
        {activeSite && isAdmin && (
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors ${
              activeSite.has_index_pages
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {toggling ? '…' : activeSite.has_index_pages ? '● 已开启追踪' : '○ 开启追踪'}
          </button>
        )}

        {/* Manual crawl */}
        {activeSite && isAdmin && (
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="h-9 px-4 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            {crawling ? '抓取中…' : '手动重抓'}
          </button>
        )}

        {crawlMsg && (
          <span className="text-sm text-gray-500">{crawlMsg}</span>
        )}
      </div>

      {activeSiteId && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            {/* Time filter */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(['all', 'new7', 'new30'] as FilterType[]).map(f => {
                const labels = { all: '全部', new7: '近7天', new30: '近30天' }
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {labels[f]}
                  </button>
                )
              })}
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索标题…"
                className="h-8 pl-3 pr-8 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 w-48"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <span className="text-sm text-gray-400 ml-auto">共 {total} 条</span>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-400 text-sm">加载中…</div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">暂无数据</p>
                {isAdmin && <p className="text-xs mt-1">请先开启追踪并手动重抓</p>}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 w-[40%]">页面标题</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 w-[25%]">显示 URL</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500 w-[12%]">百度日期</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500 w-[11%]">首次发现</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-500 w-[12%]">最近出现</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800 line-clamp-1 group-hover:text-green-700">
                          {row.title || '—'}
                        </div>
                        {row.snippet && (
                          <div className="text-xs text-gray-400 line-clamp-1 mt-0.5">{row.snippet}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-400 font-mono line-clamp-2 break-all">{row.url}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.baidu_date_str ? (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{row.baidu_date_str}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500">{row.first_seen_date}</td>
                      <td className="px-4 py-3 text-center text-xs text-gray-400">{row.last_seen_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-400">共 {total} 条 · 第 {page + 1}/{totalPages} 页</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="h-8 px-3 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="h-8 px-3 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
