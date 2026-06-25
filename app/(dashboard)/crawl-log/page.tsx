'use client'

import { useState, useEffect, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { CRAWL_RULES } from '@/lib/crawl-rules'

type ActivityLog = {
  id: string
  type: 'cron_task' | 'cron_manual' | 'search'
  source: string | null
  step: string | null
  domain: string | null
  group_index: number | null
  total_groups: number | null
  ip: string | null
  status: 'running' | 'done' | 'warn' | 'fail'
  ok_count: number
  empty_count: number
  skip_count: number
  fail_count: number
  rows_written: number
  duration_ms: number | null
  summary: string | null
  logged_at: string
}

type SiteLog = {
  id: string
  domain: string
  status: 'ok' | 'empty' | 'skip' | 'fail'
  rows_written: number
  detail: string | null
  logged_at: string
}

function getMalaysiaToday(): string {
  const myt = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return myt.toISOString().slice(0, 10)
}

function getMytDayRange(mytDate: string): { from: string; to: string } {
  return {
    from: new Date(mytDate + 'T00:00:00+08:00').toISOString(),
    to: new Date(mytDate + 'T23:59:59.999+08:00').toISOString(),
  }
}

function formatDuration(ms: number | null): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
}

function formatDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

const STEP_LABELS: Record<string, string> = {
  keywords: '关键词',
  rank: '排名',
  weight: '权重+收录',
}

const STEP_TIMES: Record<string, string> = {
  keywords: '每日 00:00',
  rank: '每日 02:00',
  weight: '每日 07:00',
}

const TYPE_LABELS: Record<string, string> = {
  cron_task: '任务cron',
  cron_manual: '手动cron',
  search: '搜索',
}

const SITE_STATUS_LABELS: Record<string, string> = {
  ok: '成功', empty: '空', skip: '跳过', fail: '失败',
}

const SITE_STATUS_COLORS: Record<string, string> = {
  ok: 'text-green-700', empty: 'text-yellow-600', skip: 'text-gray-400', fail: 'text-red-500',
}

function StatusBadge({ status }: { status: string }) {
  const cls = {
    running: 'bg-blue-50 text-blue-600',
    done: 'bg-green-50 text-green-700',
    warn: 'bg-yellow-50 text-yellow-700',
    fail: 'bg-red-50 text-red-600',
  }[status] ?? 'bg-gray-100 text-gray-600'
  const label = {
    running: '进行中', done: '完成', warn: '有空值', fail: '失败',
  }[status] ?? status
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>{label}</span>
}

export default function CrawlLogPage() {
  const [todayLogs, setTodayLogs] = useState<Record<string, ActivityLog[]>>({
    keywords: [], rank: [], weight: [],
  })
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'cron_task' | 'cron_manual' | 'search'>('all')
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [page, setPage] = useState(1)

  const [rulesStep, setRulesStep] = useState<string | null>(null)
  const [detailActivity, setDetailActivity] = useState<ActivityLog | null>(null)
  const [siteLogs, setSiteLogs] = useState<SiteLog[]>([])
  const [siteLogsLoading, setSiteLogsLoading] = useState(false)

  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [expandedSites, setExpandedSites] = useState<Record<string, SiteLog[]>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = getBrowserClient()
    const today = getMalaysiaToday()
    const { from, to } = getMytDayRange(today)

    const { data: todayData } = await supabase
      .from('activity_log')
      .select('*')
      .gte('logged_at', from)
      .lte('logged_at', to)
      .in('type', ['cron_task', 'cron_manual'])
      .order('logged_at', { ascending: false })

    const grouped: Record<string, ActivityLog[]> = { keywords: [], rank: [], weight: [] }
    for (const row of (todayData || []) as ActivityLog[]) {
      if (row.step && grouped[row.step]) grouped[row.step].push(row)
    }
    setTodayLogs(grouped)

    const { data: logsData } = await supabase
      .from('activity_log')
      .select('*')
      .order('logged_at', { ascending: false })
      .limit(200)

    setLogs((logsData || []) as ActivityLog[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function openDetail(activity: ActivityLog) {
    setDetailActivity(activity)
    setSiteLogsLoading(true)
    setSiteLogs([])
    const supabase = getBrowserClient()
    const { data } = await supabase
      .from('activity_site_log')
      .select('*')
      .eq('activity_id', activity.id)
      .order('logged_at', { ascending: true })
    setSiteLogs((data || []) as SiteLog[])
    setSiteLogsLoading(false)
  }

  async function toggleExpandStep(step: string) {
    if (expandedStep === step) { setExpandedStep(null); return }
    setExpandedStep(step)
    if (expandedSites[step]) return
    const supabase = getBrowserClient()
    const ids = todayLogs[step].map(l => l.id)
    if (ids.length === 0) { setExpandedSites(p => ({ ...p, [step]: [] })); return }
    const { data } = await supabase
      .from('activity_site_log')
      .select('*')
      .in('activity_id', ids)
      .in('status', ['empty', 'fail'])
      .order('status', { ascending: true })
    setExpandedSites(p => ({ ...p, [step]: (data || []) as SiteLog[] }))
  }

  const filteredLogs = logs.filter(log => {
    if (filter !== 'all' && log.type !== filter) return false
    if (onlyProblems && log.status !== 'warn' && log.status !== 'fail') return false
    return true
  })

  const PAGE_SIZE = 20
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedLogs = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function setFilterAndReset(f: typeof filter) { setFilter(f); setPage(1) }
  function setOnlyProblemsAndReset(v: boolean) { setOnlyProblems(v); setPage(1) }

  function getTodaySummary(step: string) {
    const stepLogs = todayLogs[step] || []
    return {
      ok: stepLogs.reduce((s, l) => s + l.ok_count, 0),
      empty: stepLogs.reduce((s, l) => s + l.empty_count, 0),
      fail: stepLogs.reduce((s, l) => s + l.fail_count, 0),
      latestStatus: stepLogs[0]?.status ?? null,
      runs: stepLogs.length,
    }
  }

  const rulesSection = CRAWL_RULES.find(r => r.key === rulesStep)

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">抓取日志</h1>
          <p className="text-gray-500 text-sm mt-1">今日运行状态 · 历史记录 · 抓取规则</p>
        </div>
        <button
          onClick={fetchData}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm py-12 text-center">加载中…</div>
      ) : (
        <div className="space-y-6">

          {/* Today's task status cards */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">今日任务状态</h2>
            <div className="grid grid-cols-3 gap-4">
              {(['keywords', 'rank', 'weight'] as const).map(step => {
                const { ok, empty, fail, latestStatus, runs } = getTodaySummary(step)
                const hasProblems = empty > 0 || fail > 0
                const isExpanded = expandedStep === step
                return (
                  <div key={step} className="card p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{STEP_LABELS[step]}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{STEP_TIMES[step]} MYT</p>
                      </div>
                      {latestStatus ? (
                        <StatusBadge status={latestStatus} />
                      ) : (
                        <span className="text-xs text-gray-400">尚无记录</span>
                      )}
                    </div>

                    {runs > 0 ? (
                      <>
                        <div className="space-y-1 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-500">成功</span>
                            <span className="font-medium text-green-700">{ok} 站</span>
                          </div>
                          {empty > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500">空值</span>
                              <span className="font-medium text-yellow-600">{empty} 站</span>
                            </div>
                          )}
                          {fail > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-gray-500">失败</span>
                              <span className="font-medium text-red-600">{fail} 站</span>
                            </div>
                          )}
                        </div>
                        {hasProblems && (
                          <button
                            onClick={() => toggleExpandStep(step)}
                            className="mt-3 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            {isExpanded ? '▲ 收起' : '▼ 查看问题站点'}
                          </button>
                        )}
                        {isExpanded && (
                          <div className="mt-2 border-t border-gray-100 pt-2 space-y-1">
                            {!expandedSites[step] ? (
                              <p className="text-xs text-gray-400">加载中…</p>
                            ) : expandedSites[step].length === 0 ? (
                              <p className="text-xs text-gray-400">无问题站点记录</p>
                            ) : (
                              expandedSites[step].map(sl => (
                                <div key={sl.id} className="flex items-center justify-between text-xs">
                                  <span className="text-gray-700 truncate max-w-[130px]" title={sl.domain}>{sl.domain}</span>
                                  <span className={sl.status === 'fail' ? 'text-red-500' : 'text-yellow-600'}>
                                    {sl.status === 'fail' ? '失败' : '空'}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-gray-400 mt-2">今日暂无记录</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Run log table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">运行记录</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs">
                  {(['all', 'cron_task', 'cron_manual', 'search'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setFilterAndReset(f)}
                      className={`px-2.5 py-1 rounded-md font-medium ${
                        filter === f
                          ? 'bg-gray-800 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {f === 'all' ? '全部' : TYPE_LABELS[f]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setOnlyProblemsAndReset(!onlyProblems)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium ${
                    onlyProblems ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  只看问题
                </button>
              </div>
            </div>

            <div className="card overflow-hidden">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">暂无记录</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col style={{ width: '160px' }} />
                      <col style={{ width: '90px' }} />
                      <col />
                      <col style={{ width: '136px' }} />
                      <col style={{ width: '88px' }} />
                      <col style={{ width: '76px' }} />
                      <col style={{ width: '64px' }} />
                      <col style={{ width: '104px' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">时间 (MYT)</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">类型</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">步骤 / 域名</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">IP</th>
                        <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">成 / 空 / 失</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">状态</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 whitespace-nowrap">时长</th>
                        <th className="text-right pr-4 py-2.5 text-xs font-medium text-gray-500"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pagedLogs.map(log => (
                        <tr key={log.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 text-xs text-gray-500 tabular-nums whitespace-nowrap">
                            {formatDateTime(log.logged_at)}
                          </td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                            <span className={
                              log.type === 'cron_task' ? 'text-blue-600' :
                              log.type === 'cron_manual' ? 'text-violet-600' :
                              'text-gray-500'
                            }>
                              {TYPE_LABELS[log.type] ?? log.type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-700 truncate">
                            {log.step ? (STEP_LABELS[log.step] ?? log.step) : ''}
                            {log.domain && (
                              <span className="ml-1 text-gray-400">{log.domain}</span>
                            )}
                            {log.group_index != null && log.total_groups != null && (
                              <span className="ml-1 text-gray-400">
                                #{log.group_index}/{log.total_groups}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                            {log.ip ?? '-'}
                          </td>
                          <td className="px-4 py-2.5 text-xs tabular-nums text-center whitespace-nowrap">
                            <span className="text-green-700">{log.ok_count}</span>
                            <span className="text-gray-300 mx-1">/</span>
                            <span className={log.empty_count > 0 ? 'text-yellow-600' : 'text-gray-400'}>{log.empty_count}</span>
                            <span className="text-gray-300 mx-1">/</span>
                            <span className={log.fail_count > 0 ? 'text-red-500' : 'text-gray-400'}>{log.fail_count}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <StatusBadge status={log.status} />
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                            {formatDuration(log.duration_ms)}
                          </td>
                          <td className="pr-4 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {log.step && (
                                <button
                                  onClick={() => setRulesStep(log.step as string)}
                                  className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 hover:border-gray-300"
                                >
                                  规则
                                </button>
                              )}
                              <button
                                onClick={() => openDetail(log)}
                                className="text-xs text-blue-500 hover:text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 hover:border-blue-200"
                              >
                                查看
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                      <span className="text-xs text-gray-400">
                        第 {safePage} / {totalPages} 页 · 共 {filteredLogs.length} 条
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                          className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          上一页
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                          .reduce<(number | '…')[]>((acc, n, i, arr) => {
                            if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push('…')
                            acc.push(n)
                            return acc
                          }, [])
                          .map((item, i) =>
                            item === '…' ? (
                              <span key={`e${i}`} className="px-1.5 text-xs text-gray-400">…</span>
                            ) : (
                              <button
                                key={item}
                                onClick={() => setPage(item as number)}
                                className={`w-7 py-1 text-xs rounded border ${
                                  safePage === item
                                    ? 'bg-gray-800 text-white border-gray-800'
                                    : 'border-gray-200 text-gray-600 hover:bg-white'
                                }`}
                              >
                                {item}
                              </button>
                            )
                          )}
                        <button
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage === totalPages}
                          className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* Rules Modal */}
      {rulesStep && rulesSection && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setRulesStep(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{rulesSection.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{rulesSection.badge}</p>
              </div>
              <button onClick={() => setRulesStep(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {rulesSection.items.map(item => (
                <div key={item.label} className="flex gap-3 text-sm">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium flex-shrink-0 h-fit mt-0.5">
                    {item.label}
                  </span>
                  <span className="text-gray-600">{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailActivity && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setDetailActivity(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {detailActivity.step
                    ? (STEP_LABELS[detailActivity.step] ?? detailActivity.step)
                    : (detailActivity.domain ?? '详情')}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDateTime(detailActivity.logged_at)} MYT
                  {' · '}{TYPE_LABELS[detailActivity.type] ?? detailActivity.type}
                  {detailActivity.source && ` · ${detailActivity.source}`}
                  {detailActivity.ip && ` · IP ${detailActivity.ip}`}
                </p>
              </div>
              <button onClick={() => setDetailActivity(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="flex items-center flex-wrap gap-4 mb-4 text-sm">
                <StatusBadge status={detailActivity.status} />
                <span className="text-gray-500">
                  成功 <span className="font-medium text-green-700">{detailActivity.ok_count}</span>
                </span>
                <span className="text-gray-500">
                  空 <span className="font-medium text-yellow-600">{detailActivity.empty_count}</span>
                </span>
                <span className="text-gray-500">
                  跳过 <span className="font-medium text-gray-500">{detailActivity.skip_count}</span>
                </span>
                <span className="text-gray-500">
                  失败 <span className="font-medium text-red-500">{detailActivity.fail_count}</span>
                </span>
                <span className="text-gray-400">
                  写入 {detailActivity.rows_written} 行
                </span>
                <span className="text-gray-400">{formatDuration(detailActivity.duration_ms)}</span>
              </div>

              {detailActivity.summary && (
                <p className="text-xs text-gray-500 mb-4 bg-gray-50 rounded px-3 py-2">
                  {detailActivity.summary}
                </p>
              )}

              {siteLogsLoading ? (
                <div className="text-center text-gray-400 text-sm py-8">加载中…</div>
              ) : siteLogs.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">无站点明细记录</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-medium text-gray-500">域名</th>
                      <th className="text-left py-2 text-xs font-medium text-gray-500">状态</th>
                      <th className="text-left py-2 text-xs font-medium text-gray-500">写入</th>
                      <th className="text-left py-2 text-xs font-medium text-gray-500 max-w-[200px]">详情</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {siteLogs.map(sl => (
                      <tr key={sl.id}>
                        <td className="py-1.5 text-xs text-gray-700">{sl.domain}</td>
                        <td className="py-1.5 text-xs">
                          <span className={SITE_STATUS_COLORS[sl.status] ?? 'text-gray-500'}>
                            {SITE_STATUS_LABELS[sl.status] ?? sl.status}
                          </span>
                        </td>
                        <td className="py-1.5 text-xs text-gray-400">
                          {sl.rows_written > 0 ? `${sl.rows_written} 行` : '-'}
                        </td>
                        <td className="py-1.5 text-xs text-gray-400 max-w-[200px] truncate" title={sl.detail ?? ''}>
                          {sl.detail ?? ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
