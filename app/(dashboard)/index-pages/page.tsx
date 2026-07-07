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
  is_new: boolean
  is_reindexed: boolean
  is_disappeared: boolean
  is_updated: boolean
}

const PAGE_SIZE = 10

type TimeFilter = 'all' | 'near7' | 'near30'
type StatusFilter = 'all' | 'new' | 'reindexed' | 'disappeared' | 'updated' | 'active'

function parseBaiduUrlInput(input: string): { baiduUrl: string; domain: string } | null {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    if (!url.hostname.includes('baidu.com')) return null
    const wd = url.searchParams.get('wd') || ''
    const siteMatch = wd.match(/site:([^/\s]+)/i)
    if (!siteMatch) return null
    const domain = siteMatch[1]
    url.searchParams.delete('pn')
    return { baiduUrl: url.toString(), domain }
  } catch {
    return null
  }
}

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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('near7')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [crawling, setCrawling] = useState(false)
  const [crawlMsg, setCrawlMsg] = useState<string | null>(null)
  const [showAddDropdown, setShowAddDropdown] = useState(false)

  // Supplemental crawl (Baidu URL or plain domain)
  const [suppInput, setSuppInput] = useState('')
  const [suppCrawling, setSuppCrawling] = useState(false)
  const [suppMsg, setSuppMsg] = useState<string | null>(null)
  const [manualCookie, setManualCookie] = useState('')
  const [showCookieInput, setShowCookieInput] = useState(false)

  // Load all sites
  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.from('sites').select('id, domain, name, has_index_pages').order('name').then(({ data }) => {
      setSites((data || []) as SiteRow[])
      setSitesLoading(false)
    })
  }, [])

  // Auto-select first tracked site on load
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

  // Reset page on filter change
  useEffect(() => { setPage(0) }, [activeSiteId, debouncedSearch, timeFilter, statusFilter])

  const fetchPages = useCallback(async () => {
    if (!activeSiteId) { setRows([]); setTotal(0); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({
        siteId: activeSiteId,
        page: String(page),
        timeFilter,
        statusFilter,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      })
      const res = await fetch(`/api/sites/index-pages?${params}`)
      const data = await res.json()
      if (res.ok) { setRows(data.rows); setTotal(data.total) }
    } finally {
      setLoading(false)
    }
  }, [activeSiteId, page, debouncedSearch, timeFilter, statusFilter])

  useEffect(() => { fetchPages() }, [fetchPages])

  const activeSite = sites.find(s => s.id === activeSiteId)
  const trackedSites = sites.filter(s => s.has_index_pages)
  const totalPages = Math.ceil(total / PAGE_SIZE)

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

  async function handleCrawl() {
    if (!activeSite) return
    setCrawling(true)
    setCrawlMsg('抓取中，可能需要几分钟…')
    try {
      const res = await fetch('/api/sites/index-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: activeSite.domain, cookie: parseCookie(manualCookie) || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        const truncNote = data.truncated ? '（被拦截，抓取不完整）' : ''
        setCrawlMsg(`完成，发现 ${data.found} 条，新增 ${data.newCount} 条${truncNote}`)
        await fetchPages()
      } else {
        setCrawlMsg(data.error || '抓取失败')
      }
    } catch {
      setCrawlMsg('请求失败')
    }
    setCrawling(false)
  }

  async function handleSuppCrawl() {
    const input = suppInput.trim()
    if (!input) return
    setSuppCrawling(true)
    setSuppMsg(null)
    const parsed = parseBaiduUrlInput(input)
    const body = parsed
      ? { baiduUrl: parsed.baiduUrl, cookie: parseCookie(manualCookie) || undefined }
      : { domain: input.replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/\/$/, ''), cookie: parseCookie(manualCookie) || undefined }
    try {
      const res = await fetch('/api/sites/index-crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        const truncNote = data.truncated ? '（被拦截，不完整）' : ''
        setSuppMsg(`发现 ${data.found} 条，新增 ${data.newCount} 条 (${data.domain})${truncNote}`)
        setSuppInput('')
        if (activeSiteId) await fetchPages()
      } else {
        setSuppMsg(data.error || '抓取失败')
      }
    } catch {
      setSuppMsg('请求失败')
    }
    setSuppCrawling(false)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header: title left + supplemental crawl right */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="shrink-0">
          <h1 className="text-xl font-semibold text-gray-900">收录页面追踪</h1>
          <p className="text-sm text-gray-500 mt-1">追踪百度收录的具体页面，记录首次发现时间</p>
        </div>
        {isAdmin && (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={suppInput}
                onChange={e => setSuppInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !suppCrawling && handleSuppCrawl()}
                placeholder="粘贴百度链接或输入域名"
                className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 w-72"
                disabled={suppCrawling}
              />
              <button
                onClick={handleSuppCrawl}
                disabled={suppCrawling || !suppInput.trim()}
                className="h-8 px-4 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {suppCrawling ? '抓取中…' : '补充抓取'}
              </button>
            </div>
            {suppMsg ? (
              <span className="text-xs text-gray-500">{suppMsg}</span>
            ) : (
              <span className="text-xs text-gray-300">对任意域名补充资料，不影响脱收标记</span>
            )}
          </div>
        )}
      </div>

      {/* Domain tabs + active site controls */}
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
        <div className="flex-1" />
        {activeSite && isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCrawl}
              disabled={crawling}
              className="h-8 px-3 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {crawling ? '抓取中…' : '手动重抓'}
            </button>
            <button
              onClick={() => setShowCookieInput(v => !v)}
              className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${showCookieInput ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'}`}
            >
              {manualCookie ? 'Cookie ✓' : 'Cookie'}
            </button>
          </div>
        )}
      </div>

      {crawlMsg && (
        <p className="text-sm text-gray-500 mb-3">{crawlMsg}</p>
      )}

      {/* Cookie input */}
      {isAdmin && activeSite && showCookieInput && (
        <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
          <div className="text-xs text-amber-700 mb-1">
            百度 Cookie（DevTools → Application → Cookies → baidu.com，全选复制 Name=Value 行贴入）
          </div>
          <textarea
            value={manualCookie}
            onChange={e => setManualCookie(e.target.value)}
            placeholder="BAIDUID=xxx; BDUSS=xxx; COOKIE_SESSION=xxx; ..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-amber-200 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono resize-none"
            disabled={crawling}
          />
        </div>
      )}

      {activeSiteId && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
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
              <option value="updated">更新</option>
              <option value="active">已收录</option>
            </select>

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
                        {row.is_new ? (
                          <span className="inline-block text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full whitespace-nowrap">新发现</span>
                        ) : row.is_reindexed ? (
                          <span className="inline-block text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full whitespace-nowrap">再收录</span>
                        ) : row.is_disappeared ? (
                          <span className="inline-block text-xs font-medium text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">已脱收</span>
                        ) : row.is_updated ? (
                          <span className="inline-block text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full whitespace-nowrap">更新</span>
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
