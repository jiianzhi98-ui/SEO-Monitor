'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@/lib/user-context'

const ACCORDION_PAGE_SIZE = 20

// ── Types ──────────────────────────────────────────────────────────────────────

interface Group {
  id: string
  name: string
  type: string
  competitor_domains: string[]
  members: { user_id: string; username: string; member_type: string }[]
}

interface BySourceItem { source: string; count: number; volume: number }
interface DayEntry {
  date: string; count: number; volume: number
  keywords: { keyword: string; search_volume: number; source: string; operation_type: string | null; final_keyword: string | null; page_url: string | null }[]
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

interface CompetitorKw { keyword: string; search_volume: number; source: string }
interface CompetitorRankRow { keyword: string; volume: number; rank_position: number | null; title: string | null }
interface CompetitorData {
  site: { id: string; domain: string; has_rank_title: boolean } | null
  date: string
  keywords: CompetitorKw[]
  rankup: CompetitorRankRow[]
  rankdown: CompetitorRankRow[]
}

type Period = 'yesterday' | 'week' | 'month' | 'custom'
type ReportTab = 'submissions' | 'outcomes' | 'rules'
type CompetitorInnerTab = 'keywords' | 'ranks' | 'rules'

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = { yesterday: '昨日', week: '本周', month: '本月', custom: '自定义' }

const MOCK_OUTCOMES = [
  { member: 'Joanne',  date: '2026-06-10', keyword: '葫芦侠',          final_keyword: '葫芦侠官方下载',    op: '新增', url: 'https://www.sjwyx.com/ruanjian/1001.html', rank: '上涨 +14', indexed: '3天',   outcome: 'success' },
  { member: 'Jackson', date: '2026-06-12', keyword: 'MT管理器',         final_keyword: 'MT管理器最新版',     op: '新增', url: 'https://www.sjwyx.com/ruanjian/1002.html', rank: '上涨 +6',  indexed: '5天',   outcome: 'success' },
  { member: 'Joanne',  date: '2026-06-18', keyword: '好游快爆 下载安装', final_keyword: '好游快爆下载2024',   op: '更新', url: 'https://www.sjwyx.com/ruanjian/1003.html', rank: '无变化',   indexed: '已收录', outcome: 'fail' },
  { member: 'Yanling', date: '2026-06-20', keyword: '蛋仔派对官服',      final_keyword: '蛋仔派对官方版下载', op: '新增', url: 'https://www.sjwyx.com/ruanjian/1004.html', rank: '追踪中',   indexed: '2天',   outcome: 'pending' },
  { member: 'Jackson', date: '2026-06-22', keyword: 'CAPCUT',            final_keyword: 'CapCut剪映国际版', op: '更新', url: 'https://www.sjwyx.com/ruanjian/1005.html', rank: '上涨 +9',  indexed: '已收录', outcome: 'success' },
  { member: 'Joanne',  date: '2026-06-25', keyword: '氪金兽',            final_keyword: '氪金兽手游下载',    op: '新增', url: 'https://www.sjwyx.com/ruanjian/1006.html', rank: '追踪中',   indexed: '未收录', outcome: 'pending' },
]

const SUGGESTED_RULES = [
  { name: '掉排名 30 天未更新',   condition: '同一关键词排名下滑 ≥ 5，且距上次提交更新操作 > 30 天',              action: '建议重新更新该页面内容',             metric: '通过 rank_changes + member_claimed_keywords 对比' },
  { name: '新增页面 7 天未收录',  condition: '提交"新增"操作后 7 天内，该 URL 未见于 site_indexed_pages',       action: '检查页面可抓取性、内链、sitemap',    metric: '通过 page_url 匹配 site_indexed_pages' },
  { name: '高搜量词 3 天无人认领', condition: '搜索量 > 5000 的关键词连续出现在竞品涨排名，超过 3 天无人认领',    action: '优先分配给对应组员处理',             metric: '通过 rank_changes + member_claimed_keywords 对比' },
  { name: '更新效果无提升',        condition: '提交"更新"操作后 30 天，对应关键词排名无上升记录',                action: '重新评估内容策略，可能需要增加词或调整结构', metric: '通过 submitted_at + rank_changes 时间窗口对比' },
]

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

function ReportCard({ title, memberType, total, bySource, isTotal }: {
  title: string; memberType?: string
  total: { count: number; volume: number }; bySource: BySourceItem[]; isTotal?: boolean
}) {
  return (
    <div className={`flex-shrink-0 w-56 rounded-xl border overflow-hidden ${isTotal ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
      <div className={`px-4 py-3 flex items-center gap-2 border-b ${isTotal ? 'border-green-100 bg-green-50/60' : 'border-gray-100 bg-gray-50/60'}`}>
        <span className="text-sm font-semibold text-gray-800 truncate flex-1">{title}</span>
        {memberType && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${memberType === 'game' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
            {memberType === 'game' ? '游戏' : '应用'}
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-50">
        <div className="grid grid-cols-[1fr_40px_56px] px-4 py-2.5 bg-gray-50/40">
          <span className="text-xs font-semibold text-gray-700">汇总</span>
          <span className="text-xs font-semibold text-gray-800 text-right">{total.count || '—'}</span>
          <span className="text-xs font-semibold text-gray-800 text-right">{fmtVol(total.volume)}</span>
        </div>
        {bySource.length === 0
          ? <div className="px-4 py-3 text-xs text-gray-300 text-center">暂无数据</div>
          : bySource.map(s => (
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

// ── Manage Competitors Modal ───────────────────────────────────────────────────

function ManageCompetitorsModal({ groupName, initialDomains, onSave, onClose }: {
  groupName: string; initialDomains: string[]
  onSave: (domains: string[]) => Promise<void>; onClose: () => void
}) {
  const [domains, setDomains] = useState<string[]>(initialDomains)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  function addDomain() {
    const d = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!d || domains.includes(d)) { setInput(''); return }
    setDomains(prev => [...prev, d])
    setInput('')
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave(domains) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">管理竞品追踪</h3>
            <p className="text-xs text-gray-400 mt-0.5">{groupName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-2 max-h-64 overflow-y-auto">
          {domains.length === 0
            ? <p className="text-sm text-gray-400 text-center py-4">暂无追踪竞品，请在下方添加域名</p>
            : domains.map(d => (
              <div key={d} className="flex items-center justify-between bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 font-mono">{d}</span>
                <button onClick={() => setDomains(prev => prev.filter(x => x !== d))}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
        </div>

        <div className="px-6 pb-4">
          <div className="flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDomain()}
              placeholder="输入域名，如 example.com"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700" />
            <button onClick={addDomain}
              className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex-shrink-0">
              添加
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">输入不含 http:// 的纯域名，按回车或点击添加</p>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Competitor Keywords Table ──────────────────────────────────────────────────

function CompetitorKeywordsTable({ keywords }: { keywords: CompetitorKw[] }) {
  if (keywords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-gray-300">
        <svg className="w-9 h-9 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <span className="text-sm">当日暂无关键词数据</span>
      </div>
    )
  }
  return (
    <div>
      <div className="grid grid-cols-[1fr_80px_100px] px-5 py-2 bg-gray-50/60 text-[11px] font-medium text-gray-400 border-b border-gray-100">
        <span>关键词</span><span className="text-right">搜索量</span><span className="text-right">来源</span>
      </div>
      <div className="divide-y divide-gray-50">
        {keywords.map((kw, i) => (
          <div key={i} className="grid grid-cols-[1fr_80px_100px] px-5 py-2.5 hover:bg-gray-50/60 transition-colors items-center">
            <span className="text-sm text-gray-800 truncate" title={kw.keyword}>{kw.keyword}</span>
            <span className="text-sm text-gray-600 text-right tabular-nums">{fmtVol(kw.search_volume)}</span>
            <div className="flex justify-end"><SourceTag source={kw.source} /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Competitor Ranks Panel ────────────────────────────────────────────────────

function CompetitorRanksPanel({ site, rankup, rankdown }: {
  site: { id: string; domain: string; has_rank_title: boolean } | null
  rankup: CompetitorRankRow[]; rankdown: CompetitorRankRow[]
}) {
  if (!site) {
    return <div className="flex flex-col items-center justify-center py-14 text-gray-300"><span className="text-sm">该域名未在网站管理中找到</span></div>
  }
  if (!site.has_rank_title) {
    return (
      <div className="flex flex-col items-center justify-center py-14 gap-1">
        <span className="text-sm text-gray-400">该竞品未开启竞品追踪抓取</span>
        <span className="text-xs text-gray-300">请前往网站管理为 {site.domain} 开启橙色"竞品追踪"开关</span>
      </div>
    )
  }
  if (rankup.length === 0 && rankdown.length === 0) {
    return <div className="flex flex-col items-center justify-center py-14 text-gray-300"><span className="text-sm">当日暂无排名变动数据</span></div>
  }

  function RankTable({ rows, type }: { rows: CompetitorRankRow[], type: 'up' | 'down' }) {
    if (rows.length === 0) return <div className="text-xs text-gray-300 text-center py-6">暂无数据</div>
    return (
      <div className="divide-y divide-gray-50">
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_44px] gap-x-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors items-start">
            <div className="min-w-0">
              <div className="text-sm text-gray-800 truncate" title={r.keyword}>{r.keyword}</div>
              {r.title && <div className="text-[11px] text-gray-400 truncate mt-0.5" title={r.title}>{r.title}</div>}
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-600 tabular-nums">{fmtVol(r.volume)}</div>
              {r.rank_position != null && (
                <div className={`text-[11px] font-medium tabular-nums ${type === 'up' ? 'text-green-600' : 'text-red-400'}`}>第{r.rank_position}名</div>
              )}
            </div>
            <div className="flex justify-end">
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${type === 'up' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-400'}`}>
                {type === 'up' ? '涨' : '跌'}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-green-50/40 flex items-center justify-between">
          <span className="text-sm font-semibold text-green-700">涨排名</span>
          <span className="text-xs text-gray-400">{rankup.length} 词</span>
        </div>
        <div className="grid grid-cols-[1fr_70px_44px] gap-x-3 px-4 py-1.5 bg-gray-50/40 text-[11px] font-medium text-gray-400 border-b border-gray-50">
          <span>关键词 / 标题</span><span className="text-right">搜索量 / 排名</span><span className="text-right">类型</span>
        </div>
        <RankTable rows={rankup} type="up" />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-red-50/40 flex items-center justify-between">
          <span className="text-sm font-semibold text-red-500">跌排名</span>
          <span className="text-xs text-gray-400">{rankdown.length} 词</span>
        </div>
        <div className="grid grid-cols-[1fr_70px_44px] gap-x-3 px-4 py-1.5 bg-gray-50/40 text-[11px] font-medium text-gray-400 border-b border-gray-50">
          <span>关键词 / 标题</span><span className="text-right">搜索量 / 排名</span><span className="text-right">类型</span>
        </div>
        <RankTable rows={rankdown} type="down" />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GroupReportPage() {
  const { role } = useUser()
  const canSeeAll = role === 'super' || role === 'admin'

  const [groups, setGroups] = useState<Group[]>([])
  const [activeTabId, setActiveTabId] = useState<string>('competitors') // 'competitors' | groupId
  const [competitorGroupId, setCompetitorGroupId] = useState<string>('')
  const [reportTab, setReportTab] = useState<ReportTab>('submissions')
  const [period, setPeriod] = useState<Period>('yesterday')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [report, setReport] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [accordionPage, setAccordionPage] = useState(0)
  const [filterUserId, setFilterUserId] = useState('all')
  const [groupsLoading, setGroupsLoading] = useState(true)

  // Competitor tab state
  const [activeCompetitorDomain, setActiveCompetitorDomain] = useState('')
  const [competitorInnerTab, setCompetitorInnerTab] = useState<CompetitorInnerTab>('keywords')
  const [competitorDate, setCompetitorDate] = useState('')
  const [competitorData, setCompetitorData] = useState<CompetitorData | null>(null)
  const [competitorLoading, setCompetitorLoading] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)

  const today = useMemo(() => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), [])
  const yesterday = useMemo(() => new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10), [])

  useEffect(() => { setCompetitorDate(yesterday) }, [yesterday])

  // Derived: activeGroupId is the selected group tab (empty when competitors tab active)
  const activeGroupId = activeTabId !== 'competitors' ? activeTabId : ''

  // Load groups
  useEffect(() => {
    fetch('/api/task-groups').then(r => r.json()).then(d => {
      const g: Group[] = (d.groups || []).map((grp: Group) => ({ ...grp, competitor_domains: grp.competitor_domains || [] }))
      setGroups(g)
      if (g.length > 0) setCompetitorGroupId(g[0].id)
    }).finally(() => setGroupsLoading(false))
  }, [])

  // When competitorGroupId changes: reset competitor domain to first of that group
  useEffect(() => {
    const g = groups.find(gr => gr.id === competitorGroupId)
    const domains = g?.competitor_domains || []
    setActiveCompetitorDomain(domains.length > 0 ? domains[0] : '')
    setCompetitorData(null)
  }, [competitorGroupId, groups])

  // Load competitor data (skip for rules tab — no API call needed)
  useEffect(() => {
    if (!activeCompetitorDomain || !competitorDate || competitorInnerTab === 'rules') { return }
    setCompetitorLoading(true)
    setCompetitorData(null)
    fetch(`/api/competitor-site?domain=${encodeURIComponent(activeCompetitorDomain)}&date=${competitorDate}&tab=${competitorInnerTab}`)
      .then(r => r.json())
      .then(d => setCompetitorData(d))
      .finally(() => setCompetitorLoading(false))
  }, [activeCompetitorDomain, competitorDate, competitorInnerTab])

  // Load member report
  useEffect(() => {
    if (!activeGroupId) return
    if (period === 'custom') {
      if (!customStart || !customEnd || customStart > customEnd) return
    }
    setLoading(true)
    setReport(null)
    setExpandedKeys(new Set())
    setAccordionPage(0)
    setFilterUserId('all')
    const url = period === 'custom'
      ? `/api/task-groups/${activeGroupId}/report?period=custom&startDate=${customStart}&endDate=${customEnd}`
      : `/api/task-groups/${activeGroupId}/report?period=${period}`
    fetch(url)
      .then(r => r.json())
      .then((d: ReportData) => {
        setReport(d)
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

  async function saveCompetitorDomains(domains: string[]) {
    await fetch(`/api/task-groups/${competitorGroupId}/competitor-domains`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitor_domains: domains }),
    })
    setGroups(prev => prev.map(g => g.id === competitorGroupId ? { ...g, competitor_domains: domains } : g))
    if (domains.length > 0) {
      if (!domains.includes(activeCompetitorDomain)) setActiveCompetitorDomain(domains[0])
    } else {
      setActiveCompetitorDomain('')
    }
    setShowManageModal(false)
  }

  const accordionEntries = useMemo(() => {
    if (!report) return []
    const entries: {
      key: string; date: string; userId: string; username: string; count: number; volume: number
      keywords: { keyword: string; search_volume: number; source: string; operation_type: string | null; final_keyword: string | null; page_url: string | null }[]
    }[] = []
    for (const member of report.members) {
      for (const day of member.byDate) {
        if (day.count === 0) continue
        entries.push({ key: `${day.date}|${member.userId}`, date: day.date, userId: member.userId, username: member.username, count: day.count, volume: day.volume, keywords: day.keywords })
      }
    }
    entries.sort((a, b) => b.date !== a.date ? b.date.localeCompare(a.date) : a.username.localeCompare(b.username))
    return entries
  }, [report])

  const filteredEntries = filterUserId === 'all' ? accordionEntries : accordionEntries.filter(e => e.userId === filterUserId)
  const accordionTotal = filteredEntries.length
  const accordionPages = Math.ceil(accordionTotal / ACCORDION_PAGE_SIZE)
  const pagedEntries = filteredEntries.slice(accordionPage * ACCORDION_PAGE_SIZE, (accordionPage + 1) * ACCORDION_PAGE_SIZE)

  const activeGroup = groups.find(g => g.id === activeGroupId)
  const activeCompetitorGroup = groups.find(g => g.id === competitorGroupId)
  const hasData = report && (report.groupTotal?.total.count ?? report.members.reduce((s, m) => s + m.total.count, 0)) > 0
  const competitorDomains = activeCompetitorGroup?.competitor_domains || []

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">分组报告</h1>
        <p className="text-sm text-gray-400 mt-0.5">查看竞品追踪与成员提交记录</p>
      </div>

      {groupsLoading ? <Spinner /> : groups.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">暂无分组</div>
      ) : (
        <div className="px-6 py-5 space-y-5">
          {/* Top-level tabs: 竞品追踪 | group1 | group2 | ... */}
          <div className="flex gap-1 border-b border-gray-200">
            <button onClick={() => setActiveTabId('competitors')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${activeTabId === 'competitors' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              竞品追踪
            </button>
            <div className="w-px bg-gray-200 my-1 mx-1" />
            {groups.map(g => (
              <button key={g.id} onClick={() => setActiveTabId(g.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTabId === g.id ? 'border-green-500 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                {g.name}
              </button>
            ))}
          </div>

          {/* Report sub-tabs — only shown when a group tab is active */}
          {activeTabId !== 'competitors' && (
            <div className="flex gap-0 border-b border-gray-100">
              {([
                ['submissions', '提交记录'],
                ['outcomes', '成效追踪'],
                ['rules', '规则中心'],
              ] as [ReportTab, string][]).map(([tab, label]) => (
                <button key={tab} onClick={() => setReportTab(tab)}
                  className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${reportTab === tab ? 'border-green-500 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  {label}
                  {tab === 'outcomes' && <span className="ml-1.5 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">建设中</span>}
                  {tab === 'rules'    && <span className="ml-1.5 text-[10px] bg-amber-50 text-amber-500 px-1.5 py-0.5 rounded-full">建议</span>}
                </button>
              ))}
            </div>
          )}

          {/* ── 竞品追踪 ── */}
          {activeTabId === 'competitors' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700">追踪竞品</span>
                  {competitorDomains.length > 0 && <span className="text-xs text-gray-400">{competitorDomains.length} 个竞品站</span>}
                </div>
                {canSeeAll && (
                  <button onClick={() => setShowManageModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 border border-orange-200 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    管理竞品
                  </button>
                )}
              </div>

              {competitorDomains.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-300 gap-3">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  <span className="text-sm">尚未配置竞品站</span>
                  {canSeeAll && (
                    <button onClick={() => setShowManageModal(true)} className="text-sm text-orange-500 hover:text-orange-600 font-medium">
                      点击"管理竞品"添加追踪域名 →
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Competitor domain sub-tabs */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 flex-wrap">
                    {competitorDomains.map(domain => (
                      <button key={domain} onClick={() => setActiveCompetitorDomain(domain)}
                        className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${activeCompetitorDomain === domain ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600'}`}>
                        {domain}
                      </button>
                    ))}
                  </div>

                  {activeCompetitorDomain && (
                    <div className="space-y-3">
                      {/* Sub-tabs — match group sub-tab style */}
                      <div className="flex gap-0 border-b border-gray-100">
                        {([
                          ['keywords', '提交记录'],
                          ['ranks', '成效追踪'],
                          ['rules', '规则中心'],
                        ] as [CompetitorInnerTab, string][]).map(([t, label]) => (
                          <button key={t} onClick={() => setCompetitorInnerTab(t)}
                            className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${competitorInnerTab === t ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Date + count — only for keywords / ranks */}
                      {competitorInnerTab !== 'rules' && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <input type="date" value={competitorDate} max={today}
                            onChange={e => setCompetitorDate(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700" />
                          {competitorData && !competitorLoading && (
                            <span className="text-xs text-gray-400">
                              {competitorInnerTab === 'keywords'
                                ? `${competitorData.keywords.length} 词`
                                : `涨 ${competitorData.rankup.length} · 跌 ${competitorData.rankdown.length}`}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Content */}
                      {competitorInnerTab === 'rules' ? (
                        <div className="space-y-3">
                          <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-3 text-sm text-amber-700">
                            以下为针对竞品 <span className="font-medium">{activeCompetitorDomain}</span> 的建议监控规则，激活后将每日自动运行。
                          </div>
                          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr] gap-x-4 px-5 py-2.5 bg-gray-50 text-[11px] font-medium text-gray-400 border-b border-gray-100">
                              <span>规则名称</span><span>触发条件</span><span>建议动作</span><span>数据来源</span>
                            </div>
                            {SUGGESTED_RULES.map((rule, i) => (
                              <div key={i} className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr] gap-x-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors items-start">
                                <div>
                                  <span className="text-sm font-medium text-gray-800">{rule.name}</span>
                                  <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">待激活</span>
                                </div>
                                <span className="text-xs text-gray-500 leading-relaxed">{rule.condition}</span>
                                <span className="text-xs text-gray-600 leading-relaxed">{rule.action}</span>
                                <span className="text-[11px] text-gray-400 leading-relaxed font-mono">{rule.metric}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-700">{activeCompetitorDomain}</span>
                            <span className="text-xs text-gray-400">
                              {competitorInnerTab === 'keywords' ? `· ${competitorDate} 新增词` : `· ${competitorDate} 排名变动`}
                            </span>
                            {competitorData?.site?.has_rank_title && competitorInnerTab === 'ranks' && (
                              <span className="ml-auto text-[11px] bg-orange-50 text-orange-500 border border-orange-100 px-2 py-0.5 rounded-full">竞品追踪</span>
                            )}
                          </div>
                          {competitorLoading ? <Spinner /> : competitorInnerTab === 'keywords'
                            ? <CompetitorKeywordsTable keywords={competitorData?.keywords || []} />
                            : <div className="p-4"><CompetitorRanksPanel site={competitorData?.site || null} rankup={competitorData?.rankup || []} rankdown={competitorData?.rankdown || []} /></div>
                          }
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── 规则中心 ── */}
          {activeTabId !== 'competitors' && reportTab === 'rules' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-5 py-3 text-sm text-amber-700">
                以下为系统建议规则，基于现有数据表可实现。<br />
                规则激活后将每日自动运行，生成待跟进信号并推送至今日任务中心。
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr] gap-x-4 px-5 py-2.5 bg-gray-50 text-[11px] font-medium text-gray-400 border-b border-gray-100">
                  <span>规则名称</span><span>触发条件</span><span>建议动作</span><span>数据来源</span>
                </div>
                {SUGGESTED_RULES.map((rule, i) => (
                  <div key={i} className="grid grid-cols-[1.5fr_2fr_1.5fr_1fr] gap-x-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors items-start">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{rule.name}</span>
                      <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">待激活</span>
                    </div>
                    <span className="text-xs text-gray-500 leading-relaxed">{rule.condition}</span>
                    <span className="text-xs text-gray-600 leading-relaxed">{rule.action}</span>
                    <span className="text-[11px] text-gray-400 leading-relaxed font-mono">{rule.metric}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center">规则激活需要：① Action History 积累足够数据 ② 管理员确认规则逻辑后手动开启</p>
            </div>
          )}

          {/* ── 成效追踪 ── */}
          {activeTabId !== 'competitors' && reportTab === 'outcomes' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2.5 text-xs text-yellow-700">
                <span className="font-bold bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded text-[10px]">MOCK</span>
                以下为演示数据，展示成效追踪上线后的页面样式。真实数据需组员填写 URL + 最终词后自动统计。
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: '已追踪动作', value: '6', sub: '近30天提交' },
                  { label: '排名上涨',   value: '3', sub: '成效率 50%', color: 'text-green-600' },
                  { label: '成功收录',   value: '5', sub: '收录率 83%', color: 'text-blue-600' },
                  { label: '追踪中',     value: '2', sub: '未满30天' },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                    <div className={`text-2xl font-bold ${s.color ?? 'text-gray-800'}`}>{s.value}</div>
                    <div className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</div>
                    <div className="text-[11px] text-gray-400">{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                  <span className="text-sm font-semibold text-gray-700">动作成效明细</span>
                  <span className="text-xs text-gray-400 ml-2">每条提交动作的排名与收录结果</span>
                </div>
                <div className="grid grid-cols-[80px_100px_1fr_100px_80px_70px_70px] gap-x-3 px-5 py-2 bg-gray-50/40 text-[11px] font-medium text-gray-400 border-b border-gray-100">
                  <span>日期</span><span>成员</span><span>关键词 → 最终词</span><span>操作</span><span>排名变化</span><span>收录</span><span className="text-center">成效</span>
                </div>
                {MOCK_OUTCOMES.map((row, i) => (
                  <div key={i} className="grid grid-cols-[80px_100px_1fr_100px_80px_70px_70px] gap-x-3 px-5 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors items-center">
                    <span className="text-xs text-gray-400">{row.date.slice(5)}</span>
                    <span className="text-xs text-gray-600 font-medium">{row.member}</span>
                    <div className="min-w-0">
                      <span className="text-xs text-gray-700 truncate block">{row.keyword}</span>
                      <span className="text-[11px] text-green-600 truncate block">→ {row.final_keyword}</span>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full w-fit ${row.op === '新增' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>{row.op}</span>
                    <span className={`text-xs font-medium ${row.rank.startsWith('上涨') ? 'text-green-600' : row.rank === '追踪中' ? 'text-gray-400' : 'text-red-400'}`}>{row.rank}</span>
                    <span className={`text-xs ${row.indexed === '未收录' ? 'text-red-400' : 'text-gray-500'}`}>{row.indexed}</span>
                    <div className="flex justify-center">
                      {row.outcome === 'success' && <span className="text-[11px] bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded-full">有效</span>}
                      {row.outcome === 'fail'    && <span className="text-[11px] bg-red-50 text-red-400 border border-red-200 px-1.5 py-0.5 rounded-full">无效</span>}
                      {row.outcome === 'pending' && <span className="text-[11px] bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full">追踪中</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 提交记录 ── */}
          {activeTabId !== 'competitors' && reportTab === 'submissions' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500 mr-1">时间范围：</span>
              <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
                {(['yesterday', 'week', 'month', 'custom'] as Period[]).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
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
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {canSeeAll && report.groupTotal && (
                    <ReportCard title="全组汇总" total={report.groupTotal.total} bySource={report.groupTotal.bySource} isTotal />
                  )}
                  {report.members.map(m => (
                    <ReportCard key={m.userId} title={m.username} memberType={m.memberType} total={m.total} bySource={m.bySource} />
                  ))}
                </div>

                {!hasData ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                    <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm">{PERIOD_LABELS[period]}暂无提交记录</span>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex flex-wrap items-center gap-3">
                      <div>
                        <span className="text-sm font-semibold text-gray-700">日期明细</span>
                        <span className="text-xs text-gray-400 ml-2">仅显示已提交关键词</span>
                      </div>
                      {canSeeAll && report.members.length > 1 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">筛选：</span>
                          {[{ userId: 'all', username: '全部' }, ...report.members].map(m => (
                            <button key={m.userId}
                              onClick={() => { setFilterUserId(m.userId); setAccordionPage(0); setExpandedKeys(new Set()) }}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${filterUserId === m.userId ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'}`}>
                              {m.username}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {pagedEntries.map(entry => {
                        const isOpen = expandedKeys.has(entry.key)
                        return (
                          <div key={entry.key}>
                            <button className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                              onClick={() => toggleKey(entry.key)}>
                              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="text-sm font-medium text-gray-700 w-14 flex-shrink-0">{fmtDate(entry.date)}</span>
                              {canSeeAll && <span className="text-sm text-gray-500 flex-shrink-0 min-w-0 truncate max-w-[6rem]">{entry.username}</span>}
                              <span className="flex-1" />
                              <span className="text-xs text-gray-400 flex-shrink-0">{entry.count} 词</span>
                              <span className="text-xs text-gray-500 font-medium flex-shrink-0 ml-3 w-20 text-right">{fmtVol(entry.volume)} 搜索量</span>
                            </button>
                            {isOpen && (
                              <div className="border-t border-gray-50">
                                <div className="grid grid-cols-[1fr_120px_80px_auto] gap-x-3 px-5 py-1.5 bg-gray-50/50 text-[11px] font-medium text-gray-400">
                                  <span>关键词 / 最终词</span><span>页面URL</span><span className="text-right">搜索量</span><span className="text-right">来源</span>
                                </div>
                                {entry.keywords.map((kw, i) => (
                                  <div key={i} className="grid grid-cols-[1fr_120px_80px_auto] gap-x-3 items-start px-5 py-2 border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-sm text-gray-800 truncate" title={kw.keyword}>{kw.keyword}</span>
                                        {kw.operation_type && (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${kw.operation_type === '新增' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>{kw.operation_type}</span>
                                        )}
                                      </div>
                                      {kw.final_keyword && <span className="text-xs text-green-600 truncate block" title={kw.final_keyword}>→ {kw.final_keyword}</span>}
                                    </div>
                                    <div className="min-w-0">
                                      {kw.page_url
                                        ? <a href={kw.page_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline font-mono truncate block" title={kw.page_url}>
                                            {kw.page_url.replace(/^https?:\/\//, '').slice(0, 28)}{kw.page_url.replace(/^https?:\/\//, '').length > 28 ? '…' : ''}
                                          </a>
                                        : <span className="text-xs text-gray-300">—</span>}
                                    </div>
                                    <span className="text-sm text-gray-500 text-right tabular-nums">{fmtVol(kw.search_volume)}</span>
                                    <div className="flex justify-end"><SourceTag source={kw.source} /></div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {accordionPages > 1 && (
                      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                        <span className="text-xs text-gray-400">共 {accordionTotal} 条 · 第 {accordionPage + 1} / {accordionPages} 页</span>
                        <div className="flex items-center gap-1">
                          <button disabled={accordionPage === 0}
                            onClick={() => { setAccordionPage(p => p - 1); setExpandedKeys(new Set()) }}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            上一页
                          </button>
                          <button disabled={accordionPage >= accordionPages - 1}
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
          </>
          )}
        </div>
      )}

      {/* Manage competitors modal */}
      {showManageModal && activeCompetitorGroup && (
        <ManageCompetitorsModal
          groupName={activeCompetitorGroup.name}
          initialDomains={competitorDomains}
          onSave={saveCompetitorDomains}
          onClose={() => setShowManageModal(false)}
        />
      )}
    </div>
  )
}
