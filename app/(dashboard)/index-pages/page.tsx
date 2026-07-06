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
  disappeared_date: string | null
  is_new: boolean
  is_disappeared: boolean
}

const PAGE_SIZE = 10

type FilterType = 'all' | 'active' | 'new7' | 'new30' | 'disappeared'

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
  const [filter, setFilter] = useState<FilterType>('new7')

  const [toggling, setToggling] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null)

  // Manual supplemental crawl by domain
  const [manualDomain, setManualDomain] = useState('')
  const [manualCrawling, setManualCrawling] = useState(false)
  const [manualMsg, setManualMsg] = useState<string | null>(null)

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

  async function handleManualCrawl() {
    const domain = manualDomain.trim().replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/\/$/, '')
    if (!domain) return
    setManualCrawling(true)
    setManualMsg(null)
    try {
      const res = await fetch('/api/sites/index-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const data = await res.json()
      if (res.ok) {
        setManualMsg(`发现 ${data.found} 条，新增 ${data.newCount} 条 (${data.domain})`)
        setManualDomain('')
        if (activeSiteId) await fetchPages()
      } else {
        setManualMsg(data.error || '抓取失败')
      }
    } catch {
      setManualMsg('请求失败')
    }
    setManualCrawling(false)
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

      {/* Manual supplemental crawl — for domains not yet fully indexed */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 mb-5 p-3 bg-gray-50 rounded-xl border border-gray-100">
          <span className="text-xs text-gray-400 shrink-0">补充抓取：</span>
          <input
            type="text"
            value={manualDomain}
            onChange={e => setManualDomain(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !manualCrawling && handleManualCrawl()}
            placeholder="输入域名（如 example.com）"
            className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 w-64"
            disabled={manualCrawling}
          />
          <button
            onClick={handleManualCrawl}
            disabled={manualCrawling || !manualDomain.trim()}
            className="h-8 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {manualCrawling ? '抓取中…' : '开始抓取'}
          </button>
          {manualMsg && <span className="text-xs text-gray-500">{manualMsg}</span>}
          {!manualMsg && <span className="text-xs text-gray-300">对任意域名补充资料，不影响脱收标记</span>}
        </div>
      )}

      {activeSiteId && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            {/* Status filter */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(['all', 'active', 'new7', 'new30', 'disappeared'] as FilterType[]).map(f => {
                const labels: Record<FilterType, string> = {
                  all: '全部', active: '已收录', new7: '近7天新增', new30: '近30天新增', disappeared: '已脱收',
                }
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filter === f
                        ? f === 'disappeared'
                          ? 'bg-white shadow-sm text-red-600'
                          : 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
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
                    <th className="text-center px-3 py-3 font-medium text-gray-500 w-[13%]">百度日期</th>
                    <th className="text-center px-3 py-3 font-medium text-gray-500 w-[8%]">状态</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 w-[38%]">页面标题</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 w-[41%]">显示 URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(row => (
                    <tr key={row.id} className={`transition-colors group ${row.is_disappeared ? 'bg-red-50/30 hover:bg-red-50/50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-3 text-center">
                        {row.baidu_date_str ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.is_disappeared ? 'text-red-400 bg-red-50' : 'text-blue-600 bg-blue-50'}`}>{row.baidu_date_str}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.is_disappeared ? (
                          <span className="inline-block text-xs font-medium text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">已脱收</span>
                        ) : row.is_new ? (
                          <span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full whitespace-nowrap">新发现</span>
                        ) : (
                          <span className="inline-block text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap">已收录</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className={`font-medium line-clamp-1 ${row.is_disappeared ? 'text-gray-400 line-through decoration-red-300' : 'text-gray-800 group-hover:text-green-700'}`}>
                          {row.title || '—'}
                        </div>
                        {row.snippet && !row.is_disappeared && (
                          <div className="text-xs text-gray-400 line-clamp-1 mt-0.5">{row.snippet}</div>
                        )}
                        {row.is_disappeared && (
                          <div className="text-xs text-red-300 mt-0.5">脱收于 {row.disappeared_date}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-400 font-mono line-clamp-2 break-all">{row.url}</div>
                      </td>
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
