'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@/lib/user-context'

const ACCORDION_PAGE_SIZE = 20

// ── Types ──────────────────────────────────────────────────────────────────────

interface Group {
  id: string
  name: string
  type: string
  site_domains: string[]
  competitor_domains: string[]
  members: { user_id: string; username: string; member_type: string }[]
}

interface SiteProfile {
  id: string
  domain: string
  name: string
  site_stage: 'startup' | 'growth' | 'mature' | null
  site_focus: 'game' | 'app' | 'mixed' | null
  site_strategy: 'new_content' | 'update' | 'mixed' | null
}

interface TargetForm {
  siteId: string
  site_stage: string
  site_focus: string
  site_strategy: string
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

interface OutcomeRow {
  id: string; user_id: string; username: string
  keyword: string; final_keyword: string | null
  page_url: string | null; operation_type: string | null
  search_volume: number; source: string
  claimed_date: string; submitted_at: string | null
  indexed: boolean; first_seen_date: string | null; disappeared_date: string | null
  rank_keyword: string | null; rank_position: number | null; prev_rank: number | null
  rank_change: number | null; rank_volume: number | null; rank_date: string | null
  outcome: 'success' | 'fail' | 'pending'
}
interface OutcomeSummary { total: number; successCount: number; indexedCount: number; pendingCount: number }
type OutcomeSortBy = 'claimed_date' | 'submitted_at' | 'search_volume' | 'rank_change' | 'rank_volume'

interface Rule {
  id: string
  rule_number: number
  name: string
  type: 'add' | 'update' | 'mixed'
  status: 'active' | 'inactive' | 'testing'
  source: 'experiment' | 'manual' | 'ai' | 'data'
  stage_applicability: string[]
  description: string | null
  confidence: number
  success_count: number
  fail_count: number
  priority: number
  created_at: string
}

interface RuleForm {
  name: string; type: 'add' | 'update' | 'mixed'; status: 'active' | 'inactive' | 'testing'
  source: 'experiment' | 'manual' | 'ai' | 'data'
  stage_applicability: string[]
  description: string; confidence: number; success_count: number; fail_count: number; priority: number
}

const EMPTY_RULE_FORM: RuleForm = {
  name: '', type: 'add', status: 'active', source: 'manual',
  stage_applicability: [],
  description: '', confidence: 0, success_count: 0, fail_count: 0, priority: 0,
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = { yesterday: '昨日', week: '本周', month: '本月', custom: '自定义' }

const STAGE_TYPES = ['起站期', '成长期', '成熟期', '通用']

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

  // Outcomes tab state
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([])
  const [outcomeSummary, setOutcomeSummary] = useState<OutcomeSummary | null>(null)
  const [outcomesLoading, setOutcomesLoading] = useState(false)
  const [oFilterDiscoverStart, setOFilterDiscoverStart] = useState('')
  const [oFilterDiscoverEnd, setOFilterDiscoverEnd] = useState('')
  const [oFilterSubmitStart, setOFilterSubmitStart] = useState('')
  const [oFilterSubmitEnd, setOFilterSubmitEnd] = useState('')
  const [oFilterMember, setOFilterMember] = useState('')
  const [oFilterOp, setOFilterOp] = useState('')
  const [oFilterKw, setOFilterKw] = useState('')
  const [oFilterIndex, setOFilterIndex] = useState('')
  const [oFilterRankKw, setOFilterRankKw] = useState('')
  const [oFilterOutcome, setOFilterOutcome] = useState('')
  const [oSortBy, setOSortBy] = useState<OutcomeSortBy>('claimed_date')
  const [oSortDir, setOSortDir] = useState<'asc' | 'desc'>('desc')
  const [oPage, setOPage] = useState(0)
  const [oPageSize, setOPageSize] = useState(20)

  // Rules tab state
  const [rules, setRules] = useState<Rule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE_FORM)
  const [ruleSaving, setRuleSaving] = useState(false)
  const [ruleFilterStatus, setRuleFilterStatus] = useState('')
  const [ruleFilterType, setRuleFilterType] = useState('')
  // Target (站点情况) state
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [groupSiteProfiles, setGroupSiteProfiles] = useState<SiteProfile[]>([])
  const [targetForm, setTargetForm] = useState<TargetForm>({ siteId: '', site_stage: '', site_focus: '', site_strategy: '' })
  const [targetSaving, setTargetSaving] = useState(false)

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
      const g: Group[] = (d.groups || []).map((grp: Group) => ({ ...grp, site_domains: grp.site_domains || [], competitor_domains: grp.competitor_domains || [] }))
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

  // Load outcomes data
  useEffect(() => {
    if (!activeGroupId || reportTab !== 'outcomes') return
    setOutcomesLoading(true)
    setOutcomes([])
    setOutcomeSummary(null)
    setOPage(0)
    const p = new URLSearchParams()
    if (oFilterDiscoverStart) p.set('discoverStart', oFilterDiscoverStart)
    if (oFilterDiscoverEnd)   p.set('discoverEnd',   oFilterDiscoverEnd)
    if (oFilterSubmitStart)   p.set('submitStart',   oFilterSubmitStart)
    if (oFilterSubmitEnd)     p.set('submitEnd',     oFilterSubmitEnd)
    if (oFilterMember)        p.set('memberId',      oFilterMember)
    if (oFilterOp)            p.set('opType',        oFilterOp)
    if (oFilterKw)            p.set('keyword',       oFilterKw)
    if (oFilterIndex)         p.set('indexed',       oFilterIndex)
    if (oFilterRankKw)        p.set('rankKeyword',   oFilterRankKw)
    if (oFilterOutcome)       p.set('outcome',       oFilterOutcome)
    p.set('sortBy',  oSortBy)
    p.set('sortDir', oSortDir)
    fetch(`/api/task-groups/${activeGroupId}/outcomes?${p}`)
      .then(r => r.json())
      .then(d => { setOutcomes(d.rows || []); setOutcomeSummary(d.summary || null) })
      .finally(() => setOutcomesLoading(false))
  }, [activeGroupId, reportTab, oFilterDiscoverStart, oFilterDiscoverEnd, oFilterSubmitStart, oFilterSubmitEnd, oFilterMember, oFilterOp, oFilterKw, oFilterIndex, oFilterRankKw, oFilterOutcome, oSortBy, oSortDir])

  // Load rules data (global rules, activeGroupId only used for auth context)
  useEffect(() => {
    if (!activeGroupId || reportTab !== 'rules') return
    setRulesLoading(true)
    fetch(`/api/task-groups/${activeGroupId}/rules`)
      .then(r => r.json())
      .then(d => setRules(d.rules ?? []))
      .finally(() => setRulesLoading(false))
  }, [activeGroupId, reportTab])

  async function openTargetModal() {
    const activeGroup = groups.find(g => g.id === activeGroupId)
    const domains = activeGroup?.site_domains ?? []
    if (domains.length === 0) {
      setGroupSiteProfiles([])
      setTargetForm({ siteId: '', site_stage: '', site_focus: '', site_strategy: '' })
      setShowTargetModal(true)
      return
    }
    const res = await fetch('/api/sites')
    const d = await res.json()
    const profiles: SiteProfile[] = ((d.sites ?? []) as SiteProfile[])
      .filter(s => domains.includes(s.domain))
      .map(s => ({ id: s.id, domain: s.domain, name: s.name, site_stage: s.site_stage, site_focus: s.site_focus, site_strategy: s.site_strategy }))
    setGroupSiteProfiles(profiles)
    const first = profiles[0]
    setTargetForm({
      siteId: first?.id ?? '',
      site_stage: first?.site_stage ?? '',
      site_focus: first?.site_focus ?? '',
      site_strategy: first?.site_strategy ?? '',
    })
    setShowTargetModal(true)
  }

  async function saveTarget() {
    if (!targetForm.siteId) return
    setTargetSaving(true)
    try {
      const res = await fetch(`/api/sites/${targetForm.siteId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_stage: targetForm.site_stage || null,
          site_focus: targetForm.site_focus || null,
          site_strategy: targetForm.site_strategy || null,
        }),
      })
      if (res.ok) {
        const { site } = await res.json()
        setGroupSiteProfiles(prev => prev.map(p => p.id === site.id ? { ...p, ...site } : p))
        setShowTargetModal(false)
      }
    } finally { setTargetSaving(false) }
  }

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
                          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                            <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <span className="text-sm">竞品规则中心即将开放</span>
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
          {activeTabId !== 'competitors' && reportTab === 'rules' && (() => {
            const TYPE_LABELS: Record<string, string>   = { add: '新增', update: '更新', mixed: '混合' }
            const STATUS_LABELS: Record<string, string> = { active: '启用', inactive: '停用', testing: '测试中' }
            const SOURCE_LABELS: Record<string, string> = { experiment: '实验', manual: '人工', ai: 'AI', data: '数据发现' }
            const TYPE_COLORS: Record<string, string>   = { add: 'bg-green-50 text-green-700', update: 'bg-blue-50 text-blue-700', mixed: 'bg-purple-50 text-purple-700' }
            const STATUS_COLORS: Record<string, string> = { active: 'bg-green-50 text-green-700', inactive: 'bg-gray-100 text-gray-400', testing: 'bg-amber-50 text-amber-600' }
            const SOURCE_COLORS2: Record<string, string>= { experiment: 'bg-indigo-50 text-indigo-600', manual: 'bg-gray-100 text-gray-500', ai: 'bg-pink-50 text-pink-600', data: 'bg-teal-50 text-teal-600' }

            const filtered = rules.filter(r =>
              (!ruleFilterStatus || r.status === ruleFilterStatus) &&
              (!ruleFilterType   || r.type   === ruleFilterType)
            )

            async function saveRule() {
              if (!ruleForm.name.trim()) return
              setRuleSaving(true)
              try {
                if (editingRule) {
                  const res = await fetch(`/api/rules/${editingRule.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(ruleForm),
                  })
                  if (res.ok) {
                    const { rule } = await res.json()
                    setRules(prev => prev.map(r => r.id === rule.id ? rule : r))
                  }
                } else {
                  const res = await fetch(`/api/task-groups/${activeGroupId}/rules`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(ruleForm),
                  })
                  if (res.ok) {
                    const { rule } = await res.json()
                    setRules(prev => [...prev, rule])
                  }
                }
                setShowRuleModal(false)
                setEditingRule(null)
                setRuleForm(EMPTY_RULE_FORM)
              } finally { setRuleSaving(false) }
            }

            async function toggleStatus(rule: Rule) {
              const next = rule.status === 'active' ? 'inactive' : 'active'
              const res = await fetch(`/api/rules/${rule.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: next }),
              })
              if (res.ok) {
                const { rule: updated } = await res.json()
                setRules(prev => prev.map(r => r.id === updated.id ? updated : r))
              }
            }

            async function deleteRule(rule: Rule) {
              if (!confirm(`确认删除 Rule #${rule.rule_number} "${rule.name}"？`)) return
              const res = await fetch(`/api/rules/${rule.id}`, { method: 'DELETE' })
              if (res.ok) setRules(prev => prev.filter(r => r.id !== rule.id))
            }

            function openEdit(rule: Rule) {
              setEditingRule(rule)
              setRuleForm({
                name: rule.name, type: rule.type, status: rule.status, source: rule.source,
                stage_applicability: rule.stage_applicability,
                description: rule.description ?? '', confidence: rule.confidence,
                success_count: rule.success_count, fail_count: rule.fail_count, priority: rule.priority,
              })
              setShowRuleModal(true)
            }

            function toggleStage(val: string) {
              setRuleForm(prev => {
                const arr = prev.stage_applicability
                return { ...prev, stage_applicability: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
              })
            }

            const successRate = (r: Rule) => {
              const total = r.success_count + r.fail_count
              return total > 0 ? Math.round(r.success_count / total * 100) : null
            }

            return (
              <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={ruleFilterStatus} onChange={e => setRuleFilterStatus(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                    <option value="">全部状态</option>
                    <option value="active">启用</option>
                    <option value="inactive">停用</option>
                    <option value="testing">测试中</option>
                  </select>
                  <select value={ruleFilterType} onChange={e => setRuleFilterType(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                    <option value="">全部类型</option>
                    <option value="add">新增</option>
                    <option value="update">更新</option>
                    <option value="mixed">混合</option>
                  </select>
                  <span className="text-xs text-gray-400 ml-1">{filtered.length} 条规则</span>
                  <div className="flex-1" />
                  {canSeeAll && (
                    <>
                      <button onClick={openTargetModal}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
                        站点目标
                      </button>
                      <button onClick={() => { setEditingRule(null); setRuleForm(EMPTY_RULE_FORM); setShowRuleModal(true) }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                        新建规则
                      </button>
                    </>
                  )}
                </div>

                {/* Rule list */}
                {rulesLoading ? <Spinner /> : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                    <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="text-sm">{rules.length === 0 ? '暂无规则，点击「新建规则」开始建立规则库' : '没有符合筛选条件的规则'}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map(rule => {
                      const sr = successRate(rule)
                      const total = rule.success_count + rule.fail_count
                      return (
                        <div key={rule.id} className={`bg-white rounded-xl border transition-colors ${rule.status === 'inactive' ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                          <div className="px-4 py-3 flex items-start gap-3">
                            {/* Rule number */}
                            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                              <span className="text-xs font-bold text-gray-500">#{rule.rule_number}</span>
                            </div>
                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-gray-800">{rule.name}</span>
                                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${TYPE_COLORS[rule.type] ?? 'bg-gray-100 text-gray-500'}`}>{TYPE_LABELS[rule.type]}</span>
                                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLORS[rule.status] ?? 'bg-gray-100 text-gray-400'}`}>{STATUS_LABELS[rule.status]}</span>
                                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${SOURCE_COLORS2[rule.source] ?? 'bg-gray-100 text-gray-400'}`}>{SOURCE_LABELS[rule.source]}</span>
                              </div>
                              {rule.description && (
                                <p className="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-2">{rule.description}</p>
                              )}
                              {rule.stage_applicability.length > 0 && (
                                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                  {rule.stage_applicability.map(s => (
                                    <span key={s} className="text-[10px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">{s}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Stats */}
                            <div className="flex-shrink-0 flex items-center gap-4 text-xs text-gray-500">
                              <div className="text-center">
                                <div className="font-semibold text-gray-700 tabular-nums">{rule.confidence}%</div>
                                <div className="text-[10px] text-gray-400">信心度</div>
                              </div>
                              {total > 0 ? (
                                <div className="text-center">
                                  <div className="font-semibold tabular-nums">
                                    <span className="text-green-600">{rule.success_count}</span>
                                    <span className="text-gray-300 mx-0.5">/</span>
                                    <span className="text-red-400">{rule.fail_count}</span>
                                  </div>
                                  <div className="text-[10px] text-gray-400">{sr != null ? `成功率 ${sr}%` : '成/失'}</div>
                                </div>
                              ) : (
                                <div className="text-center">
                                  <div className="text-gray-300 tabular-nums">—</div>
                                  <div className="text-[10px] text-gray-400">无记录</div>
                                </div>
                              )}
                              {/* Actions */}
                              {canSeeAll && (
                                <div className="flex items-center gap-1">
                                  <button onClick={() => openEdit(rule)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="编辑">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                  </button>
                                  <button onClick={() => toggleStatus(rule)}
                                    className={`p-1.5 rounded-lg transition-colors ${rule.status === 'active' ? 'text-gray-400 hover:text-amber-500 hover:bg-amber-50' : 'text-gray-400 hover:text-green-500 hover:bg-green-50'}`}
                                    title={rule.status === 'active' ? '停用' : '启用'}>
                                    {rule.status === 'active'
                                      ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                      : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
                                  </button>
                                  <button onClick={() => deleteRule(rule)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="删除">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Create / Edit Modal */}
                {showRuleModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowRuleModal(false); setEditingRule(null); setRuleForm(EMPTY_RULE_FORM) }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                        <h3 className="text-base font-semibold text-gray-900">{editingRule ? `编辑 Rule #${editingRule.rule_number}` : '新建规则'}</h3>
                        <button onClick={() => { setShowRuleModal(false); setEditingRule(null); setRuleForm(EMPTY_RULE_FORM) }}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <div className="px-6 py-4 space-y-4">
                        {/* Name */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">规则名称 <span className="text-red-400">*</span></label>
                          <input value={ruleForm.name} onChange={e => setRuleForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="例：排名下降30天更新"
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                        </div>
                        {/* Type / Status / Source */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">类型</label>
                            <select value={ruleForm.type} onChange={e => setRuleForm(p => ({ ...p, type: e.target.value as RuleForm['type'] }))}
                              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                              <option value="add">新增</option>
                              <option value="update">更新</option>
                              <option value="mixed">混合</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">状态</label>
                            <select value={ruleForm.status} onChange={e => setRuleForm(p => ({ ...p, status: e.target.value as RuleForm['status'] }))}
                              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                              <option value="active">启用</option>
                              <option value="inactive">停用</option>
                              <option value="testing">测试中</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">来源</label>
                            <select value={ruleForm.source} onChange={e => setRuleForm(p => ({ ...p, source: e.target.value as RuleForm['source'] }))}
                              className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                              <option value="manual">人工经验</option>
                              <option value="experiment">实验</option>
                              <option value="ai">AI建议</option>
                              <option value="data">数据发现</option>
                            </select>
                          </div>
                        </div>
                        {/* Stage applicability */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-2">适用阶段</label>
                          <div className="flex gap-3 flex-wrap">
                            {STAGE_TYPES.map(s => (
                              <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={ruleForm.stage_applicability.includes(s)}
                                  onChange={() => toggleStage(s)}
                                  className="rounded border-gray-300 text-green-500 focus:ring-green-400" />
                                <span className="text-sm text-gray-700">{s}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        {/* Description */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">规则说明</label>
                          <textarea value={ruleForm.description} onChange={e => setRuleForm(p => ({ ...p, description: e.target.value }))}
                            rows={3} placeholder="描述触发条件、执行动作、预期效果…"
                            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 resize-none" />
                        </div>
                        {/* Numbers */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">信心度 %</label>
                            <input type="number" min={0} max={100} value={ruleForm.confidence}
                              onChange={e => setRuleForm(p => ({ ...p, confidence: Number(e.target.value) }))}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">历史成功</label>
                            <input type="number" min={0} value={ruleForm.success_count}
                              onChange={e => setRuleForm(p => ({ ...p, success_count: Number(e.target.value) }))}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">历史失败</label>
                            <input type="number" min={0} value={ruleForm.fail_count}
                              onChange={e => setRuleForm(p => ({ ...p, fail_count: Number(e.target.value) }))}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                          </div>
                        </div>
                      </div>
                      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                        <button onClick={() => { setShowRuleModal(false); setEditingRule(null); setRuleForm(EMPTY_RULE_FORM) }}
                          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                          取消
                        </button>
                        <button onClick={saveRule} disabled={ruleSaving || !ruleForm.name.trim()}
                          className="px-4 py-2 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          {ruleSaving ? '保存中…' : editingRule ? '保存修改' : '创建规则'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── 站点目标 modal ── */}
                {showTargetModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-base font-semibold text-gray-800">站点情况</h3>
                        <button onClick={() => setShowTargetModal(false)} className="text-gray-400 hover:text-gray-600">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                      <div className="px-6 py-5 space-y-4">
                        {groupSiteProfiles.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">该分组暂无关联站点（site_domains 为空）</p>
                        ) : (
                          <>
                            {groupSiteProfiles.length > 1 && (
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">站点</label>
                                <select value={targetForm.siteId} onChange={e => {
                                  const p = groupSiteProfiles.find(s => s.id === e.target.value)
                                  setTargetForm({ siteId: e.target.value, site_stage: p?.site_stage ?? '', site_focus: p?.site_focus ?? '', site_strategy: p?.site_strategy ?? '' })
                                }} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400 text-gray-700">
                                  {groupSiteProfiles.map(p => <option key={p.id} value={p.id}>{p.name || p.domain}</option>)}
                                </select>
                              </div>
                            )}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1.5">当前阶段</label>
                              <div className="flex gap-2">
                                {[['startup','起站期'],['growth','成长期'],['mature','成熟期']].map(([val, label]) => (
                                  <button key={val} onClick={() => setTargetForm(p => ({ ...p, site_stage: p.site_stage === val ? '' : val }))}
                                    className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${targetForm.site_stage === val ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1.5">主要方向</label>
                              <div className="flex gap-2">
                                {[['game','游戏'],['app','应用'],['mixed','混合']].map(([val, label]) => (
                                  <button key={val} onClick={() => setTargetForm(p => ({ ...p, site_focus: p.site_focus === val ? '' : val }))}
                                    className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${targetForm.site_focus === val ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1.5">内容策略</label>
                              <div className="flex gap-2">
                                {[['new_content','新增为主'],['update','更新为主'],['mixed','均有']].map(([val, label]) => (
                                  <button key={val} onClick={() => setTargetForm(p => ({ ...p, site_strategy: p.site_strategy === val ? '' : val }))}
                                    className={`flex-1 py-1.5 text-sm rounded-lg border transition-colors ${targetForm.site_strategy === val ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      {groupSiteProfiles.length > 0 && (
                        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                          <button onClick={() => setShowTargetModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
                          <button onClick={saveTarget} disabled={targetSaving}
                            className="px-4 py-2 text-sm font-medium bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors">
                            {targetSaving ? '保存中…' : '保存'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── 成效追踪 ── */}
          {activeTabId !== 'competitors' && reportTab === 'outcomes' && (() => {
            const OCOLS = 'grid-cols-[70px_70px_70px_48px_2fr_60px_70px_88px_1.5fr_60px_58px]'
            const oTotal = outcomes.length
            const anyFilter = !!(oFilterMember || oFilterOp || oFilterIndex || oFilterOutcome || oFilterKw || oFilterRankKw || oFilterDiscoverStart || oFilterDiscoverEnd || oFilterSubmitStart || oFilterSubmitEnd)
            const displayData = outcomes
            const displayTotal = displayData.length
            const oTotalPages = Math.max(1, Math.ceil(displayTotal / oPageSize))
            const pagedO = displayData.slice(oPage * oPageSize, (oPage + 1) * oPageSize)
            function oSortIcons(col: OutcomeSortBy) {
              const isAsc  = oSortBy === col && oSortDir === 'asc'
              const isDesc = oSortBy === col && oSortDir === 'desc'
              return (
                <span className="inline-flex flex-col items-center gap-px select-none ml-0.5">
                  <svg onClick={(e) => { e.stopPropagation(); setOSortBy(col); setOSortDir('asc');  setOPage(0) }} viewBox="0 0 8 5" width="8" height="5" fill="currentColor"
                    className={`cursor-pointer ${isAsc  ? 'text-blue-500' : 'text-gray-300 hover:text-gray-400'}`}><path d="M4 0L8 5H0Z"/></svg>
                  <svg onClick={(e) => { e.stopPropagation(); setOSortBy(col); setOSortDir('desc'); setOPage(0) }} viewBox="0 0 8 5" width="8" height="5" fill="currentColor"
                    className={`cursor-pointer ${isDesc ? 'text-blue-500' : 'text-gray-300 hover:text-gray-400'}`}><path d="M4 5L0 0H8Z"/></svg>
                </span>
              )
            }
            return (
              <div className="space-y-4">
                {/* Summary cards */}
                {outcomeSummary && (
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: '已追踪动作', value: outcomeSummary.total, sub: '全部提交' },
                      { label: '有效成效', value: outcomeSummary.successCount, sub: outcomeSummary.total ? `成效率 ${Math.round(outcomeSummary.successCount / outcomeSummary.total * 100)}%` : '—', color: 'text-green-600' },
                      { label: '成功收录', value: outcomeSummary.indexedCount, sub: outcomeSummary.total ? `收录率 ${Math.round(outcomeSummary.indexedCount / outcomeSummary.total * 100)}%` : '—', color: 'text-blue-600' },
                      { label: '追踪中', value: outcomeSummary.pendingCount, sub: '未满30天' },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                        <div className={`text-2xl font-bold ${(s as { color?: string }).color ?? 'text-gray-800'}`}>{s.value}</div>
                        <div className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</div>
                        <div className="text-[11px] text-gray-400">{s.sub}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Filters — dates first, then dropdowns */}
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-500">发现日期：</span>
                    <input type="date" value={oFilterDiscoverStart}
                      onChange={e => { const v = e.target.value; setOFilterDiscoverStart(v); setOFilterDiscoverEnd(v); setOPage(0) }}
                      className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                    <span className="text-xs font-medium text-gray-500 ml-1">提交日期：</span>
                    <input type="date" value={oFilterSubmitStart}
                      onChange={e => { const v = e.target.value; setOFilterSubmitStart(v); setOFilterSubmitEnd(v); setOPage(0) }}
                      className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                    <span className="w-px h-5 bg-gray-200 mx-1" />
                    {canSeeAll && report?.members && report.members.length > 1 && (
                      <select value={oFilterMember} onChange={e => { setOFilterMember(e.target.value); setOPage(0) }}
                        className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                        <option value="">全部成员</option>
                        {report.members.map(m => <option key={m.userId} value={m.userId}>{m.username}</option>)}
                      </select>
                    )}
                    <select value={oFilterOp} onChange={e => { setOFilterOp(e.target.value); setOPage(0) }}
                      className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                      <option value="">全部操作</option>
                      <option value="新增">新增</option>
                      <option value="更新">更新</option>
                    </select>
                    <select value={oFilterIndex} onChange={e => { setOFilterIndex(e.target.value); setOPage(0) }}
                      className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                      <option value="">全部收录</option>
                      <option value="has">已收录</option>
                      <option value="none">未收录</option>
                    </select>
                    <select value={oFilterOutcome} onChange={e => { setOFilterOutcome(e.target.value); setOPage(0) }}
                      className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                      <option value="">全部成效</option>
                      <option value="success">有效</option>
                      <option value="fail">无效</option>
                      <option value="pending">追踪中</option>
                    </select>
                    <input value={oFilterKw} onChange={e => { setOFilterKw(e.target.value); setOPage(0) }}
                      placeholder="搜索关键词 / 最终词…"
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 w-44" />
                    <input value={oFilterRankKw} onChange={e => { setOFilterRankKw(e.target.value); setOPage(0) }}
                      placeholder="搜索排名词…"
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 w-36" />
                    {anyFilter && (
                      <button onClick={() => { setOFilterMember(''); setOFilterOp(''); setOFilterIndex(''); setOFilterOutcome(''); setOFilterKw(''); setOFilterRankKw(''); setOFilterDiscoverStart(''); setOFilterDiscoverEnd(''); setOFilterSubmitStart(''); setOFilterSubmitEnd(''); setOPage(0) }}
                        className="text-xs text-gray-400 hover:text-red-400 px-2 py-1.5 rounded border border-gray-200 hover:border-red-200 transition-colors">
                        清除筛选
                      </button>
                    )}
                  </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                    <span className="text-sm font-semibold text-gray-700">动作成效明细</span>
                    <span className="text-xs text-gray-400 ml-2">每条提交动作的排名与收录结果</span>
                  </div>
                  {outcomesLoading ? <Spinner /> : oTotal === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                      <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm">{anyFilter ? '没有符合筛选条件的记录' : '暂无数据，组员提交带 URL + 最终词的操作后自动显示'}</span>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <div className={`grid ${OCOLS} gap-x-2 px-4 py-2 bg-gray-50/40 border-b border-gray-100 min-w-[860px]`}>
                          <span className="text-[11px] font-medium text-gray-400 inline-flex items-center justify-center">发现日期{oSortIcons('claimed_date')}</span>
                          <span className="text-[11px] font-medium text-gray-400 inline-flex items-center justify-center">提交日期{oSortIcons('submitted_at')}</span>
                          <span className="text-[11px] font-medium text-gray-400 text-center">成员</span>
                          <span className="text-[11px] font-medium text-gray-400 text-center">操作</span>
                          <span className="text-[11px] font-medium text-gray-400">关键词 → 最终词</span>
                          <span className="text-[11px] font-medium text-gray-400 inline-flex items-center justify-center">搜索量{oSortIcons('search_volume')}</span>
                          <span className="text-[11px] font-medium text-gray-400 text-center">收录</span>
                          <span className="text-[11px] font-medium text-gray-400 inline-flex items-center justify-center">排名{oSortIcons('rank_change')}</span>
                          <span className="text-[11px] font-medium text-gray-400">排名词</span>
                          <span className="text-[11px] font-medium text-gray-400 inline-flex items-center justify-center">排名量{oSortIcons('rank_volume')}</span>
                          <span className="text-[11px] font-medium text-gray-400 text-center">成效</span>
                        </div>
                        <div className="divide-y divide-gray-50 min-w-[860px]">
                          {pagedO.map(row => {
                            const submitStr = row.submitted_at ? row.submitted_at.slice(5, 10).replace('-', '/') : '—'
                            const rc = row.rank_change
                            return (
                              <div key={row.id} className={`grid ${OCOLS} gap-x-2 px-4 py-2.5 hover:bg-gray-50/60 transition-colors items-center`}>
                                <span className="text-sm text-gray-500 text-center">{row.claimed_date.slice(5).replace('-', '/')}</span>
                                <span className="text-sm text-gray-500 text-center">{submitStr}</span>
                                <span className="text-sm text-gray-700 font-medium text-center truncate" title={row.username}>{row.username}</span>
                                <div className="flex justify-center">
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${row.operation_type === '新增' ? 'bg-green-50 text-green-600' : row.operation_type === '更新' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                    {row.operation_type ?? '—'}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm text-gray-800 truncate" title={row.keyword}>{row.keyword}</div>
                                  {row.final_keyword
                                    ? <div className="text-xs text-green-600 truncate" title={row.final_keyword}>→ {row.final_keyword}</div>
                                    : <div className="text-xs text-gray-300">—</div>}
                                </div>
                                <div className="text-sm text-gray-600 tabular-nums text-center">{fmtVol(row.search_volume)}</div>
                                <div className="text-center">
                                  {row.indexed
                                    ? <span className="text-sm text-blue-600">{row.first_seen_date ? row.first_seen_date.slice(5).replace('-', '/') : '已收录'}</span>
                                    : <span className="text-sm text-red-400">未收录</span>}
                                </div>
                                <div className="flex items-center justify-center gap-1.5">
                                  {row.rank_position != null
                                    ? <span className="text-sm text-gray-700">第{row.rank_position}名</span>
                                    : <span className="text-sm text-gray-300">—</span>}
                                  {rc != null && rc !== 0 && (
                                    <span className={`text-xs font-semibold tabular-nums ${rc > 0 ? 'text-green-600' : 'text-red-400'}`}>
                                      {rc > 0 ? `+${rc}` : `${rc}`}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  {row.rank_keyword
                                    ? <div className="text-sm text-gray-700 truncate" title={row.rank_keyword}>{row.rank_keyword}</div>
                                    : <span className="text-sm text-gray-300">—</span>}
                                </div>
                                <div className="text-sm text-gray-500 tabular-nums text-center">{row.rank_volume ? fmtVol(row.rank_volume) : '—'}</div>
                                <div className="flex justify-center">
                                  {row.outcome === 'success' && <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded-full">有效</span>}
                                  {row.outcome === 'fail'    && <span className="text-xs bg-red-50 text-red-400 border border-red-200 px-1.5 py-0.5 rounded-full">无效</span>}
                                  {row.outcome === 'pending' && <span className="text-xs bg-gray-100 text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded-full">追踪中</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* Pagination */}
                      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/40">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>第 {oPage * oPageSize + 1}–{Math.min((oPage + 1) * oPageSize, displayTotal)} 条，共 {displayTotal} 条</span>
                          <span className="text-gray-200 mx-1">|</span>
                          <span>每页</span>
                          {([20, 40, 60] as const).map(n => (
                            <button key={n} onClick={() => { setOPageSize(n); setOPage(0) }}
                              className={`px-2 py-0.5 rounded border transition-colors ${oPageSize === n ? 'bg-green-500 text-white border-green-500' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                              {n}
                            </button>
                          ))}
                          <span>条</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button disabled={oPage === 0} onClick={() => setOPage(p => p - 1)}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">上一页</button>
                          <span className="text-xs text-gray-400 px-2">{oPage + 1} / {oTotalPages}</span>
                          <button disabled={oPage >= oTotalPages - 1} onClick={() => setOPage(p => p + 1)}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">下一页</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })()}

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
