'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@/lib/user-context'

const ACCORDION_PAGE_SIZE = 20

// ── Types ──────────────────────────────────────────────────────────────────────

interface Group { id: string; name: string; members: { user_id: string; username: string; member_type: string }[] }

interface BySourceItem { source: string; count: number; volume: number }
interface DayEntry {
  date: string; count: number; volume: number
  keywords: { keyword: string; search_volume: number; source: string }[]
}
interface MemberReport {
  userId: string; username: string; memberType: string
  total: { count: number; volume: number }
  bySource: BySourceItem[]
  byDate: DayEntry[]
}
interface ReportData {
  period: string; startDate: string; endDate: string
  groupTotal: { total: { count: number; volume: number }; bySource: BySourceItem[] } | null
  members: MemberReport[]
}

type Period = 'today' | 'week' | 'month' | 'custom'

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = { today: '今日', week: '本周', month: '本月', custom: '自定义' }

const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  '竞品涨排名':  { bg: 'bg-purple-50',  text: 'text-purple-700' },
  '共新增词':    { bg: 'bg-blue-50',    text: 'text-blue-700' },
  '交叉词':      { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  '连续上涨词':  { bg: 'bg-orange-50',  text: 'text-orange-700' },
  '更新词库':    { bg: 'bg-teal-50',    text: 'text-teal-700' },
  '搜索量查询':  { bg: 'bg-gray-100',   text: 'text-gray-600' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtVol(v: number) {
  if (!v || v <= 0) return '—'
  if (v >= 10000) return (v / 10000).toFixed(1) + 'w'
  return v.toLocaleString()
}
function fmtDate(d: string) { return d ? d.slice(5).replace('-', '/') : '' }

// ── Sub-components ─────────────────────────────────────────────────────────────

function SourceTag({ source }: { source: string }) {
  const c = SOURCE_COLORS[source] ?? { bg: 'bg-gray-100', text: 'text-gray-500' }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium ${c.bg} ${c.text}`}>
      {source}
    </span>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <svg className="animate-spin w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  )
}

// Summary card: one per member + one group total
function ReportCard({ title, memberType, total, bySource, isTotal }: {
  title: string
  memberType?: string
  total: { count: number; volume: number }
  bySource: BySourceItem[]
  isTotal?: boolean
}) {
  return (
    <div className={`flex-shrink-0 w-56 rounded-xl border overflow-hidden ${isTotal ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
      {/* Card header */}
      <div className={`px-4 py-3 flex items-center gap-2 border-b ${isTotal ? 'border-green-100 bg-green-50/60' : 'border-gray-100 bg-gray-50/60'}`}>
        <span className="text-sm font-semibold text-gray-800 truncate flex-1">{title}</span>
        {memberType && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${memberType === 'game' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
            {memberType === 'game' ? '游戏' : '应用'}
          </span>
        )}
      </div>
      {/* Source table */}
      <div className="divide-y divide-gray-50">
        {/* Subtotal row */}
        <div className="grid grid-cols-[1fr_40px_56px] px-4 py-2.5 bg-gray-50/40">
          <span className="text-xs font-semibold text-gray-700">汇总</span>
          <span className="text-xs font-semibold text-gray-800 text-right">{total.count || '—'}</span>
          <span className="text-xs font-semibold text-gray-800 text-right">{fmtVol(total.volume)}</span>
        </div>
        {bySource.length === 0 ? (
          <div className="px-4 py-3 text-xs text-gray-300 text-center">暂无数据</div>
        ) : bySource.map(s => (
          <div key={s.source} className="grid grid-cols-[1fr_40px_56px] px-4 py-2">
            <span className="text-xs text-gray-500 truncate">{s.source}</span>
            <span className="text-xs text-gray-700 text-right">{s.count}</span>
            <span className="text-xs text-gray-700 text-right">{fmtVol(s.volume)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GroupReportPage() {
  const { role } = useUser()
  const canSeeAll = role === 'super' || role === 'admin'

  const [groups, setGroups] = useState<Group[]>([])
  const [activeGroupId, setActiveGroupId] = useState('')
  const [period, setPeriod] = useState<Period>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [accordionPage, setAccordionPage] = useState(0)
  const [groupsLoading, setGroupsLoading] = useState(true)

  const today = useMemo(() => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), [])

  // Load groups
  useEffect(() => {
    fetch('/api/task-groups').then(r => r.json()).then(d => {
      const g: Group[] = d.groups || []
      setGroups(g)
      if (g.length > 0) setActiveGroupId(g[0].id)
    }).finally(() => setGroupsLoading(false))
  }, [])

  // Load report
  useEffect(() => {
    if (!activeGroupId) return
    // For custom period, require both dates to be set and valid
    if (period === 'custom') {
      if (!customStart || !customEnd || customStart > customEnd) return
    }
    setLoading(true)
    setReport(null)
    setExpandedKeys(new Set())
    setAccordionPage(0)
    const url = period === 'custom'
      ? `/api/task-groups/${activeGroupId}/report?period=custom&startDate=${customStart}&endDate=${customEnd}`
      : `/api/task-groups/${activeGroupId}/report?period=${period}`
    fetch(url)
      .then(r => r.json())
      .then((d: ReportData) => {
        setReport(d)
        // Auto-expand the most recent date entries
        if (d.members.length > 0) {
          const firstDate = d.members.flatMap(m => m.byDate).sort((a, b) => b.date.localeCompare(a.date))[0]?.date
          if (firstDate) {
            const keys = new Set(d.members.flatMap(m => m.byDate.filter(day => day.date === firstDate && day.count > 0).map(() => `${firstDate}|${m.userId}`)))
            setExpandedKeys(keys)
          }
        }
      })
      .finally(() => setLoading(false))
  }, [activeGroupId, period, customStart, customEnd])

  function toggleKey(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Flat sorted accordion entries across all members
  const accordionEntries = useMemo(() => {
    if (!report) return []
    const entries: {
      key: string; date: string; userId: string; username: string
      count: number; volume: number
      keywords: { keyword: string; search_volume: number; source: string }[]
    }[] = []
    for (const member of report.members) {
      for (const day of member.byDate) {
        if (day.count === 0) continue
        entries.push({
          key: `${day.date}|${member.userId}`,
          date: day.date, userId: member.userId, username: member.username,
          count: day.count, volume: day.volume, keywords: day.keywords,
        })
      }
    }
    entries.sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : a.username.localeCompare(b.username))
    return entries
  }, [report])

  const accordionTotal = accordionEntries.length
  const accordionPages = Math.ceil(accordionTotal / ACCORDION_PAGE_SIZE)
  const pagedEntries = accordionEntries.slice(accordionPage * ACCORDION_PAGE_SIZE, (accordionPage + 1) * ACCORDION_PAGE_SIZE)

  const activeGroup = groups.find(g => g.id === activeGroupId)
  const hasData = report && (report.groupTotal?.total.count ?? report.members.reduce((s, m) => s + m.total.count, 0)) > 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">分组报告</h1>
        <p className="text-sm text-gray-400 mt-0.5">查看已提交关键词的来源与搜索量统计</p>
      </div>

      {groupsLoading ? (
        <Spinner />
      ) : groups.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">暂无分组</div>
      ) : (
        <div className="px-6 py-5 space-y-5">
          {/* Group tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {groups.map(g => (
              <button key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeGroupId === g.id ? 'border-green-500 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {g.name}
              </button>
            ))}
          </div>

          {/* Period tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 mr-1">时间范围：</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
              {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
                <button key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-1.5 text-sm font-medium transition-colors ${period === p ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
            {period === 'custom' ? (
              <div className="flex items-center gap-2">
                <input type="date" value={customStart} max={customEnd || today}
                  onChange={e => setCustomStart(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700" />
                <span className="text-gray-400 text-sm">~</span>
                <input type="date" value={customEnd} min={customStart} max={today}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700" />
                {customStart && customEnd && customStart > customEnd && (
                  <span className="text-xs text-red-400">开始日期不能晚于结束日期</span>
                )}
              </div>
            ) : report && (
              <span className="text-xs text-gray-400">
                {report.startDate === report.endDate ? report.startDate : `${report.startDate} ~ ${report.endDate}`}
              </span>
            )}
          </div>

          {loading ? <Spinner /> : !report ? null : (
            <>
              {/* Cards row */}
              <div className="flex gap-4 overflow-x-auto pb-2">
                {/* Group total card — admin only */}
                {canSeeAll && report.groupTotal && (
                  <ReportCard
                    title="全组汇总"
                    total={report.groupTotal.total}
                    bySource={report.groupTotal.bySource}
                    isTotal
                  />
                )}
                {/* Per-member cards */}
                {report.members.map(m => (
                  <ReportCard
                    key={m.userId}
                    title={m.username}
                    memberType={m.memberType}
                    total={m.total}
                    bySource={m.bySource}
                  />
                ))}
              </div>

              {/* Daily detail */}
              {!hasData ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm">{PERIOD_LABELS[period]}暂无提交记录</span>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                    <span className="text-sm font-semibold text-gray-700">日期明细</span>
                    <span className="text-xs text-gray-400 ml-2">仅显示已提交关键词</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {pagedEntries.map(entry => {
                      const isOpen = expandedKeys.has(entry.key)
                      return (
                        <div key={entry.key}>
                          {/* Row header */}
                          <button
                            className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                            onClick={() => toggleKey(entry.key)}
                          >
                            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700 w-14 flex-shrink-0">{fmtDate(entry.date)}</span>
                            {canSeeAll && (
                              <span className="text-sm text-gray-500 flex-shrink-0 min-w-0 truncate max-w-[6rem]">{entry.username}</span>
                            )}
                            <span className="flex-1" />
                            <span className="text-xs text-gray-400 flex-shrink-0">{entry.count} 词</span>
                            <span className="text-xs text-gray-500 font-medium flex-shrink-0 ml-3 w-20 text-right">{fmtVol(entry.volume)} 搜索量</span>
                          </button>
                          {/* Keyword list */}
                          {isOpen && (
                            <div className="border-t border-gray-50">
                              <div className="grid grid-cols-[1fr_80px_auto] gap-x-4 px-5 py-1.5 bg-gray-50/50 text-[11px] font-medium text-gray-400">
                                <span>关键词</span>
                                <span className="text-right">搜索量</span>
                                <span className="text-right">来源</span>
                              </div>
                              {entry.keywords.map((kw, i) => (
                                <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-x-4 items-center px-5 py-2 border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                                  <span className="text-sm text-gray-800 truncate" title={kw.keyword}>{kw.keyword}</span>
                                  <span className="text-sm text-gray-500 text-right tabular-nums">{fmtVol(kw.search_volume)}</span>
                                  <div className="flex justify-end">
                                    <SourceTag source={kw.source} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Pager */}
                  {accordionPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                      <span className="text-xs text-gray-400">
                        共 {accordionTotal} 条 · 第 {accordionPage + 1} / {accordionPages} 页
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          disabled={accordionPage === 0}
                          onClick={() => { setAccordionPage(p => p - 1); setExpandedKeys(new Set()) }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          上一页
                        </button>
                        <button
                          disabled={accordionPage >= accordionPages - 1}
                          onClick={() => { setAccordionPage(p => p + 1); setExpandedKeys(new Set()) }}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          下一页
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
