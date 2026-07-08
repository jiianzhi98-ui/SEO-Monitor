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
  baidu_date_changed_at: string | null
  reindexed_at: string | null
  verify_needed: boolean
  missed_count: number
  is_new: boolean
  is_reindexed: boolean
  is_disappeared: boolean
  is_updated: boolean
  is_pending_verify: boolean
}

const PAGE_SIZE = 10
type TimeFilter = 'all' | 'near7' | 'near30'
type StatusFilter = 'all' | 'new' | 'reindexed' | 'disappeared' | 'pending' | 'updated' | 'active'
type CrawlPeriod = 'monthly' | 'weekly' | 'daily'

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
  const [urlSearch, setUrlSearch] = useState('')
  const [debouncedUrlSearch, setDebouncedUrlSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | ''>('')
  const [pageSize, setPageSize] = useState(10)

  // Verify deindex
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null)

  async function handleTriggerVerify(recheck = false) {
    if (verifying) return
    setVerifying(true)
    setVerifyMsg(null)
    try {
      const res = await fetch('/api/sites/trigger-verify-deindex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recheck }),
      })
      const data = await res.json()
      if (res.ok) {
        setVerifyMsg(recheck ? '已触发，重新验证已脱收中…' : '已触发，验证中…')
      } else {
        setVerifyMsg(data.error || '触发失败')
      }
    } catch {
      setVerifyMsg('请求失败')
    }
    setVerifying(false)
  }

  // Crawl modal
  const [showCrawlModal, setShowCrawlModal] = useState(false)
  const [crawlPeriod, setCrawlPeriod] = useState<CrawlPeriod>('monthly')
  const [crawlCustomUrl, setCrawlCustomUrl] = useState('')
  const [crawlCookie, setCrawlCookie] = useState('')
  const [triggering, setTriggering] = useState(false)
  const [triggered, setTriggered] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null)

  // Site management dropdown
  const [showAddDropdown, setShowAddDropdown] = useState(false)

  // Load all sites
  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.from('sites').select('id, domain, name, has_index_pages').order('name').then(({ data }) => {
      setSites((data || []) as SiteRow[])
      setSitesLoading(false)
    })
  }, [])

  // Auto-select first tracked site
  useEffect(() => {
    if (!activeSiteId && !sitesLoading) {
      const first = sites.find(s => s.has_index_pages)
      if (first) setActiveSiteId(first.id)
    }
  }, [sites, sitesLoading, activeSiteId])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUrlSearch(urlSearch), 400)
    return () => clearTimeout(t)
  }, [urlSearch])

  useEffect(() => { setPage(0) }, [activeSiteId, debouncedSearch, debouncedUrlSearch, timeFilter, statusFilter, sortDir, pageSize])

  const fetchPages = useCallback(async () => {
    if (!activeSiteId) { setRows([]); setTotal(0); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        siteId: activeSiteId,
        page: String(page),
        pageSize: String(pageSize),
        timeFilter,
        statusFilter,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(debouncedUrlSearch ? { urlSearch: debouncedUrlSearch } : {}),
        ...(sortDir ? { sortDir } : {}),
      })
      const res = await fetch(`/api/sites/index-pages?${params}`)
      const data = await res.json()
      if (res.ok) { setRows(data.rows); setTotal(data.total) }
    } finally {
      setLoading(false)
    }
  }, [activeSiteId, page, pageSize, debouncedSearch, debouncedUrlSearch, timeFilter, statusFilter, sortDir])

  useEffect(() => { fetchPages() }, [fetchPages])

  const sortIcons = () => {
    const isAsc = sortDir === 'asc'
    const isDesc = sortDir === 'desc'
    return (
      <span className="flex flex-col items-center gap-px select-none">
        <svg onClick={() => setSortDir(d => d === 'asc' ? '' : 'asc')} viewBox="0 0 8 5" width="8" height="5" fill="currentColor" className={`cursor-pointer ${isAsc ? 'text-blue-500' : 'text-gray-300 hover:text-gray-400'}`}><path d="M4 0L8 5H0Z"/></svg>
        <svg onClick={() => setSortDir(d => d === 'desc' ? '' : 'desc')} viewBox="0 0 8 5" width="8" height="5" fill="currentColor" className={`cursor-pointer ${isDesc ? 'text-blue-500' : 'text-gray-300 hover:text-gray-400'}`}><path d="M4 5L0 0H8Z"/></svg>
      </span>
    )
  }

  const activeSite = sites.find(s => s.id === activeSiteId)
  const trackedSites = sites.filter(s => s.has_index_pages)
  const totalPages = Math.ceil(total / pageSize)

  async function handleEnableTracking(siteId: string) {
    const res = await fetch('/api/sites/index-pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, enabled: true }),
    })
    if (res.ok) {
      setSites(prev => prev.map(s => s.id === siteId ? { ...s, has_index_pages: true } : s))
      setActiveSiteId(siteId)
      setShowAddDropdown(false)
    }
  }

  async function handleDisableTracking(siteId: string) {
    const res = await fetch('/api/sites/index-pages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId, enabled: false }),
    })
    if (res.ok) {
      setSites(prev => prev.map(s => s.id === siteId ? { ...s, has_index_pages: false } : s))
      if (activeSiteId === siteId) {
        const next = sites.find(s => s.has_index_pages && s.id !== siteId)
        setActiveSiteId(next?.id ?? '')
      }
    }
  }

  function parseCookie(raw: string): string {
    const trimmed = raw.trim()
    if (trimmed.includes('\t')) {
      return trimmed.split('\n')
        .map(line => line.trim())
        .filter(line => line.includes('\t'))
        .map(line => {
          const cols = line.split('\t')
          const name = cols[0]?.trim() ?? ''
          const value = cols[1]?.trim() ?? ''
          return name && value ? `${name}=${value}` : null
        })
        .filter(Boolean)
        .join('; ')
    }
    return trimmed
  }

  async function handleTrigger() {
    if (!activeSite || triggering) return
    setTriggering(true)
    setTriggerMsg(null)
    try {
      const res = await fetch('/api/sites/trigger-supplement-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: activeSite.domain,
          period: crawlPeriod,
          customUrl: crawlCustomUrl.trim() || undefined,
          cookie: crawlCookie.trim() ? parseCookie(crawlCookie) : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setTriggered(true)
        setShowCrawlModal(false)
        setCrawlCustomUrl('')
      } else {
        setTriggerMsg(data.error || '触发失败')
      }
    } catch {
      setTriggerMsg('请求失败')
    }
    setTriggering(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">收录页面追踪</h1>
          <p className="text-sm text-gray-500 mt-1">追踪百度收录的具体页面，记录首次发现时间</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {verifyMsg && (
              <span className={`text-xs px-3 py-1.5 rounded-lg border ${verifyMsg.includes('触发') ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
                {verifyMsg}
                <button onClick={() => setVerifyMsg(null)} className="ml-2 text-gray-400 hover:text-gray-600">✕</button>
              </span>
            )}
            {triggered ? (
              <>
                <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">已触发，抓取中…</span>
                <button onClick={() => setTriggered(false)} className="text-xs text-gray-400 hover:text-gray-600">重置</button>
              </>
            ) : (
              <button
                onClick={() => { setTriggerMsg(null); setShowCrawlModal(true) }}
                className="h-8 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                手动重抓
              </button>
            )}
            <button
              onClick={() => handleTriggerVerify(false)}
              disabled={verifying}
              className="h-8 px-4 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {verifying ? '触发中…' : '手动验证'}
            </button>
            <button
              onClick={() => {
                if (confirm('将对所有已脱收页面逐一搜索百度，确认是否已重新收录。数量较多时耗时较长，确认继续？')) {
                  handleTriggerVerify(true)
                }
              }}
              disabled={verifying}
              className="h-8 px-4 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              脱收验证
            </button>
          </div>
        )}
      </div>

      {/* Domain tabs + controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {sitesLoading ? (
          <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <>
            {trackedSites.map(s => (
              <div key={s.id} className="relative group">
                <button
                  onClick={() => setActiveSiteId(s.id)}
                  className={`h-8 pl-3 pr-7 rounded-lg text-sm font-medium transition-colors ${
                    activeSiteId === s.id
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s.domain}
                </button>
                {isAdmin && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDisableTracking(s.id) }}
                    title="停止追踪"
                    className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity ${
                      activeSiteId === s.id ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {isAdmin && (
              <div className="relative">
                <button
                  onClick={() => setShowAddDropdown(v => !v)}
                  title="新增追踪域名"
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-sm font-medium bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                >
                  +
                </button>
                {showAddDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowAddDropdown(false)} />
                    <div className="absolute left-0 top-9 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px] max-h-72 overflow-y-auto">
                      {sites.filter(s => !s.has_index_pages).length === 0 ? (
                        <p className="text-xs text-gray-400 px-3 py-2">所有站点已开启追踪</p>
                      ) : (
                        sites.filter(s => !s.has_index_pages).map(s => (
                          <button
                            key={s.id}
                            onClick={() => handleEnableTracking(s.id)}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            {s.domain}
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {activeSiteId && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {(['all', 'near7', 'near30'] as TimeFilter[]).map(t => {
                const labels: Record<TimeFilter, string> = { all: '全部', near7: '近7天', near30: '近30天' }
                return (
                  <button
                    key={t}
                    onClick={() => setTimeFilter(t)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      timeFilter === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {labels[t]}
                  </button>
                )
              })}
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="h-8 px-2 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">全部状态</option>
              <option value="new">新发现</option>
              <option value="reindexed">再收录</option>
              <option value="disappeared">已脱收</option>
              <option value="pending">待验证</option>
              <option value="updated">更新</option>
              <option value="active">已收录</option>
            </select>

            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索标题…"
                className="h-8 pl-3 pr-8 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 w-40"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                value={urlSearch}
                onChange={e => setUrlSearch(e.target.value)}
                placeholder="URL 搜索…"
                className="h-8 pl-3 pr-8 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-green-500 w-44"
              />
              {urlSearch && (
                <button onClick={() => setUrlSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
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
                {isAdmin && <p className="text-xs mt-1">请先点击手动重抓</p>}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-center px-3 py-2 font-medium text-gray-500 w-[13%]">
                      <div className="flex items-center justify-center gap-1">
                        百度日期{sortIcons()}
                      </div>
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500 w-[8%]">状态</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 w-[38%]">页面标题</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 w-[41%]">显示 URL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map(row => (
                    <tr key={row.id} className={`transition-colors group ${row.is_disappeared ? 'bg-red-50/30 hover:bg-red-50/50' : row.is_pending_verify ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2 text-center">
                        {row.baidu_date_str ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${row.is_disappeared ? 'text-red-400 bg-red-50' : 'text-blue-600 bg-blue-50'}`}>{row.baidu_date_str}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.is_new ? (
                          <span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full whitespace-nowrap">新发现</span>
                        ) : row.is_reindexed ? (
                          <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full whitespace-nowrap">再收录</span>
                        ) : row.is_disappeared ? (
                          <span className="inline-block text-xs font-medium text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">已脱收</span>
                        ) : row.is_pending_verify ? (
                          <span className="inline-block text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full whitespace-nowrap">待验证</span>
                        ) : row.is_updated ? (
                          <span className="inline-block text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full whitespace-nowrap">更新</span>
                        ) : (
                          <span className="inline-block text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full whitespace-nowrap">已收录</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className={`font-medium line-clamp-1 ${row.is_disappeared ? 'text-gray-400 line-through decoration-red-300' : 'text-gray-800 group-hover:text-green-700'}`}>
                          {row.title || '—'}
                        </div>
                        {row.snippet && !row.is_disappeared && (
                          <div className="text-xs text-gray-400 line-clamp-1 mt-0.5">{row.snippet}</div>
                        )}
                        {row.is_disappeared && (
                          <div className="text-xs text-red-300 mt-0.5">脱收于 {row.disappeared_date}</div>
                        )}
                        {row.is_pending_verify && (
                          <div className="text-xs text-amber-400 mt-0.5">连续 {row.missed_count} 次未见，等待周六验证</div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-xs text-gray-400 font-mono line-clamp-2 break-all">{row.url}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>每页</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="h-7 px-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {[10, 20, 50].map(n => <option key={n} value={n}>{n} 条</option>)}
                </select>
                <span>共 {total} 条 · 第 {page + 1}/{totalPages} 页</span>
              </div>
              {totalPages > 1 && (
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
              )}
            </div>
          )}
        </>
      )}

      {/* Crawl Modal */}
      {showCrawlModal && activeSite && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => !triggering && setShowCrawlModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">手动重抓</h2>
                  <p className="text-xs text-gray-400 mt-0.5">触发 GitHub Actions，不受 Vercel 超时限制</p>
                </div>
                <button
                  onClick={() => setShowCrawlModal(false)}
                  disabled={triggering}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40"
                >
                  ✕
                </button>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Domain (read-only) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">站点</label>
                  <div className="h-8 px-3 flex items-center rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-500">
                    {activeSite.domain}
                  </div>
                </div>

                {/* Period selector */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">抓取范围</label>
                  <div className="flex gap-2">
                    {(['monthly', 'weekly', 'daily'] as CrawlPeriod[]).map(p => {
                      const labels: Record<CrawlPeriod, string> = { monthly: '近一个月', weekly: '近一周', daily: '近一天' }
                      return (
                        <button
                          key={p}
                          onClick={() => setCrawlPeriod(p)}
                          className={`flex-1 h-9 rounded-lg text-sm font-medium transition-colors border ${
                            crawlPeriod === p
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                          }`}
                        >
                          {labels[p]}
                        </button>
                      )
                    })}
                  </div>
                  {crawlCustomUrl.trim() && (
                    <p className="text-xs text-amber-500 mt-1">提供了自定义链接，以上范围选项将被忽略</p>
                  )}
                </div>

                {/* Custom Baidu URL (optional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    百度链接（可选，填入则忽略范围选项）
                  </label>
                  <input
                    type="text"
                    value={crawlCustomUrl}
                    onChange={e => setCrawlCustomUrl(e.target.value)}
                    placeholder="https://www.baidu.com/s?wd=site:sjwyx.com&gpc=…"
                    className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    disabled={triggering}
                  />
                </div>

                {/* Cookie */}
                <details className="group">
                  <summary className="text-xs font-medium text-gray-500 cursor-pointer select-none list-none flex items-center gap-1 hover:text-gray-700">
                    <span className="transition-transform group-open:rotate-90">▶</span>
                    Cookie（可选）
                    {crawlCookie.trim() && <span className="ml-1 text-amber-500">✓ 已填入</span>}
                  </summary>
                  <textarea
                    value={crawlCookie}
                    onChange={e => setCrawlCookie(e.target.value)}
                    placeholder="BAIDUID=xxx; BDUSS=xxx; ..."
                    rows={3}
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono resize-none"
                    disabled={triggering}
                  />
                  <p className="text-xs text-gray-400 mt-1">填入后会保存到服务器设置，下次自动抓取也会使用</p>
                </details>

                {triggerMsg && (
                  <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{triggerMsg}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setShowCrawlModal(false)}
                    disabled={triggering}
                    className="flex-1 h-9 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleTrigger}
                    disabled={triggering}
                    className="flex-1 h-9 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {triggering ? '提交中…' : '开始抓取'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
