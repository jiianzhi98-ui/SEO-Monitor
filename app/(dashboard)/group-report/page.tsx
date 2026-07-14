'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@/lib/user-context'
import { getBrowserClient } from '@/lib/supabase'

const ACCORDION_PAGE_SIZE = 20
const KW_PAGE_SIZE = 50

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

interface CompetitorKw { keyword: string; search_volume: number; source: string; content_type: string | null; content_date: string; source_url?: string | null }
interface CompetitorRankRow { keyword: string; volume: number; rank_position: number | null; title: string | null }
interface CompetitorOutcomeRow {
  keyword: string
  content_type: string | null
  content_date: string
  discovered_at: string
  volume: number
  rank_position: number | null
  rank_type: string | null
  rank_date: string | null
}
interface CompetitorOutcomeSummary { total: number; hasRank: number; rankup: number; rankdown: number; top10: number }
interface CompetitorData {
  site: { id: string; domain: string; has_rank_title: boolean } | null
  date: string
  keywords: CompetitorKw[]
  rankup: CompetitorRankRow[]
  rankdown: CompetitorRankRow[]
  outcomes: CompetitorOutcomeRow[]
  outcomeSummary: CompetitorOutcomeSummary | null
}

type Period = 'yesterday' | 'week' | 'month' | 'custom'
type ReportTab = 'submissions' | 'outcomes' | 'rules'
type CompetitorInnerTab = 'keywords' | 'outcomes' | 'rules'

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
  site_ids: string[]
  competitor_domains: string[]
  created_at: string
}

interface ExtSiteProfile {
  id: string; domain: string; name: string
  post_start_hour: number | null; post_end_hour: number | null; post_interval_minutes: number | null
}
interface SiteFull {
  id: string; domain: string; name: string
  category: string; has_rank_title: boolean; is_enabled: boolean
}
interface WeightSnapshot {
  pc_weight: number; mobile_weight: number
  pc_ip: number; pc_ip_max: number; mobile_ip: number; mobile_ip_max: number
}
interface IndexSnapshot { index_count: number }
interface CompetitorProfileData {
  domain: string; site_type: string | null; site_weight: number | null
  site_ip: string | null; site_index_count: number | null
  post_start_hour: number | null; post_end_hour: number | null
  post_interval_minutes: number | null; notes: string | null
  same_base_diff_sub_is_update: boolean
  same_name_diff_date_is_update: boolean
}
interface KwAnalysisResult {
  exactDuplicates: { keyword: string; dates: string[]; occurrences: number }[]
  topicClusters: { root: string; keywords: string[]; dates: string[]; date_range: string }[]
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

const RULE_TYPE_LABELS: Record<string, string>   = { add: '新增', update: '更新', mixed: '混合' }
const RULE_STATUS_LABELS: Record<string, string> = { active: '启用', inactive: '停用', testing: '测试中' }
const RULE_SOURCE_LABELS: Record<string, string> = { experiment: '实验', manual: '人工', ai: 'AI', data: '数据发现' }
const RULE_TYPE_COLORS: Record<string, string>   = { add: 'bg-green-50 text-green-700', update: 'bg-blue-50 text-blue-700', mixed: 'bg-purple-50 text-purple-700' }
const RULE_STATUS_COLORS: Record<string, string> = { active: 'bg-green-50 text-green-700', inactive: 'bg-gray-100 text-gray-400', testing: 'bg-amber-50 text-amber-600' }
const RULE_SOURCE_COLORS: Record<string, string> = { experiment: 'bg-indigo-50 text-indigo-600', manual: 'bg-gray-100 text-gray-500', ai: 'bg-pink-50 text-pink-600', data: 'bg-teal-50 text-teal-600' }

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

const CAT_LABELS_COMP: Record<string, string> = { large: '大站', medium: '中站', small: '小站' }

function ManageCompetitorsModal({ groupName, initialDomains, allSites, onSave, onClose }: {
  groupName: string; initialDomains: string[]; allSites: SiteFull[]
  onSave: (domains: string[]) => Promise<void>; onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialDomains))
  const [search, setSearch] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [saving, setSaving] = useState(false)

  // Sites with 竞品追踪 enabled
  const competitorSites = allSites.filter(s => s.has_rank_title)
  const cats = ['large', 'medium', 'small'] as const

  function toggleDomain(domain: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(domain) ? next.delete(domain) : next.add(domain)
      return next
    })
  }

  function addManual() {
    const d = manualInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!d) return
    setSelected(prev => new Set([...Array.from(prev), d]))
    setManualInput('')
  }

  function removeExtra(d: string) {
    setSelected(prev => { const next = new Set(prev); next.delete(d); return next })
  }

  async function handleSave() {
    setSaving(true)
    try { await onSave(Array.from(selected)) } finally { setSaving(false) }
  }

  const knownDomains = new Set(competitorSites.map(s => s.domain))
  const extraDomains = Array.from(selected).filter(d => !knownDomains.has(d))

  const filtered = search
    ? competitorSites.filter(s => s.domain.includes(search) || (s.name || '').includes(search))
    : competitorSites

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">管理竞品追踪</h3>
            <p className="text-xs text-gray-400 mt-0.5">{groupName} · 已选 {selected.size} 个站点</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 pt-4 flex-shrink-0">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索竞品站点…"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700" />
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-3 space-y-4">
          {competitorSites.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              网站管理中暂无开启「竞品追踪」的站点<br />
              <span className="text-xs">请先在网站管理中为对应站点开启橙色竞品追踪开关</span>
            </p>
          ) : (
            cats.map(cat => {
              const catSites = filtered.filter(s => s.category === cat)
              if (catSites.length === 0) return null
              const allSel = catSites.every(s => selected.has(s.domain))
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{CAT_LABELS_COMP[cat]}</span>
                    <button onClick={() => {
                      const next = new Set(selected)
                      allSel ? catSites.forEach(s => next.delete(s.domain)) : catSites.forEach(s => next.add(s.domain))
                      setSelected(next)
                    }} className="text-[11px] text-orange-500 hover:text-orange-600 font-medium">
                      {allSel ? '全取消' : '全选'}
                    </button>
                  </div>
                  <div className="space-y-1">
                    {catSites.map(s => (
                      <button key={s.id} onClick={() => toggleDomain(s.domain)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${selected.has(s.domain) ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100 hover:bg-gray-50'}`}>
                        <span className={`w-5 h-5 flex-shrink-0 rounded-md flex items-center justify-center transition-all ${selected.has(s.domain) ? 'bg-orange-500 border-2 border-orange-500' : 'border-2 border-gray-200 bg-white'}`}>
                          {selected.has(s.domain) && <svg viewBox="0 0 10 8" className="w-3 h-2.5"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </span>
                        <span className="text-sm text-gray-800 font-medium">{s.domain}</span>
                        {s.name && <span className="text-xs text-gray-400">{s.name}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })
          )}

          {/* Extra manually-added domains not in site management */}
          {extraDomains.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">手动添加</span>
              <div className="mt-2 space-y-1">
                {extraDomains.map(d => (
                  <div key={d} className="flex items-center gap-3 px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg">
                    <span className="text-sm text-gray-700 font-mono flex-1">{d}</span>
                    <button onClick={() => removeExtra(d)} className="text-gray-400 hover:text-red-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-3 flex-shrink-0 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-400 mb-2">添加不在网站管理中的域名（可选）</p>
          <div className="flex gap-2">
            <input value={manualInput} onChange={e => setManualInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManual()}
              placeholder="example.com"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400 text-gray-700" />
            <button onClick={addManual} className="px-4 py-2 text-sm font-medium bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors flex-shrink-0">添加</button>
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2 border-t border-gray-100 pt-3 flex-shrink-0">
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
  const [openDates, setOpenDates] = useState<Set<string>>(new Set())
  const [dateKwPage, setDateKwPage] = useState<Record<string, number>>({})

  if (keywords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-14 text-gray-300">
        <svg className="w-9 h-9 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        <span className="text-sm">当日暂无关键词数据</span>
      </div>
    )
  }

  const byDate = new Map<string, CompetitorKw[]>()
  for (const kw of keywords) {
    const d = kw.content_date || '未知日期'
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(kw)
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a))

  function toggle(d: string) {
    setOpenDates(prev => { const s = new Set(prev); s.has(d) ? s.delete(d) : s.add(d); return s })
    setDateKwPage(prev => ({ ...prev, [d]: 0 }))
  }

  return (
    <div className="divide-y divide-gray-50">
      {dates.map(date => {
        const kws = byDate.get(date)!
        const isOpen = openDates.has(date)
        const kwPg = dateKwPage[date] ?? 0
        const kwPages = Math.ceil(kws.length / KW_PAGE_SIZE)
        const kwSlice = kws.slice(kwPg * KW_PAGE_SIZE, (kwPg + 1) * KW_PAGE_SIZE)
        return (
          <div key={date}>
            <button className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
              onClick={() => toggle(date)}>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span className="text-sm font-medium text-gray-700 w-14 flex-shrink-0">{fmtDate(date)}</span>
              <span className="flex-1" />
              <span className="text-xs text-gray-400">{kws.length} 词</span>
            </button>
            {isOpen && (
              <div className="border-t border-gray-50">
                <div className="grid grid-cols-[1fr_auto] gap-x-4 px-5 py-1.5 bg-gray-50/50 text-[11px] font-medium text-gray-400">
                  <span>关键词</span><span className="text-right">类型</span>
                </div>
                {kwSlice.map((kw, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto] gap-x-4 items-center px-5 py-2 border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <span className="text-sm text-gray-800 truncate" title={kw.keyword}>{kw.keyword}</span>
                    <div className="flex justify-end">
                      {kw.content_type
                        ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${kw.content_type === 'app' ? 'bg-blue-50 text-blue-600' : kw.content_type === 'game' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>{kw.content_type}</span>
                        : <span className="text-xs text-gray-300">—</span>}
                    </div>
                  </div>
                ))}
                {kwPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-2 border-t border-gray-100 bg-gray-50/40">
                    <span className="text-xs text-gray-400">{kws.length} 词 · {kwPg + 1}/{kwPages} 页</span>
                    <div className="flex items-center gap-1">
                      <button disabled={kwPg === 0}
                        onClick={() => setDateKwPage(p => ({ ...p, [date]: kwPg - 1 }))}
                        className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">上 {KW_PAGE_SIZE} 条</button>
                      <button disabled={kwPg >= kwPages - 1}
                        onClick={() => setDateKwPage(p => ({ ...p, [date]: kwPg + 1 }))}
                        className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">下 {KW_PAGE_SIZE} 条</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
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

// ── Competitor Outcomes Panel ─────────────────────────────────────────────────

function CompetitorOutcomesPanel({
  site, outcomes, summary, loading,
}: {
  site: { id: string; domain: string; has_rank_title: boolean } | null
  outcomes: CompetitorOutcomeRow[]
  summary: CompetitorOutcomeSummary | null
  loading: boolean
}) {
  const [filterType,   setFilterType]   = useState<'all' | 'app' | 'game'>('all')
  const [filterRank,   setFilterRank]   = useState<'all' | 'has' | 'top10' | 'none'>('all')
  const [filterTrend,  setFilterTrend]  = useState<'all' | 'rankup' | 'rankdown'>('all')
  const [filterKw,     setFilterKw]     = useState('')
  const [oPage,        setOPage]        = useState(0)
  const O_PAGE = 50

  if (!site) return <div className="flex justify-center py-14 text-sm text-gray-400">该域名未在网站管理中找到</div>
  if (!site.has_rank_title) return (
    <div className="flex flex-col items-center justify-center py-14 gap-1">
      <span className="text-sm text-gray-400">该竞品未开启竞品追踪抓取</span>
      <span className="text-xs text-gray-300">请前往网站管理为 {site.domain} 开启橙色「竞品追踪」开关</span>
    </div>
  )

  const anyFilter = !!(filterType !== 'all' || filterRank !== 'all' || filterTrend !== 'all' || filterKw)

  const filtered = outcomes.filter(r => {
    if (filterType === 'app'  && r.content_type === 'game') return false
    if (filterType === 'game' && r.content_type !== 'game') return false
    if (filterRank === 'has'   && r.rank_position == null) return false
    if (filterRank === 'top10' && (r.rank_position == null || r.rank_position > 10)) return false
    if (filterRank === 'none'  && r.rank_position != null) return false
    if (filterTrend === 'rankup'   && r.rank_type !== 'rankup') return false
    if (filterTrend === 'rankdown' && r.rank_type !== 'rankdown') return false
    if (filterKw && !r.keyword.toLowerCase().includes(filterKw.toLowerCase())) return false
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / O_PAGE))
  const paged = filtered.slice(oPage * O_PAGE, (oPage + 1) * O_PAGE)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-3">
          {([
            { label: '发现词总量', value: summary.total,   sub: '期间内新词',   color: '' },
            { label: '有排名词',   value: summary.hasRank, sub: summary.total ? `${Math.round(summary.hasRank / summary.total * 100)}% 有排名` : '—', color: 'text-blue-600' },
            { label: '涨排名词',   value: summary.rankup,  sub: '排名上升',     color: 'text-green-600' },
            { label: '跌排名词',   value: summary.rankdown,sub: '排名下降',     color: 'text-red-400' },
          ] as { label: string; value: number; sub: string; color: string }[]).map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
              <div className={`text-2xl font-bold ${s.color || 'text-gray-800'}`}>{s.value}</div>
              <div className="text-xs font-medium text-gray-600 mt-0.5">{s.label}</div>
              <div className="text-[11px] text-gray-400">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={filterType} onChange={e => { setFilterType(e.target.value as typeof filterType); setOPage(0) }}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
            <option value="all">全部类型</option>
            <option value="app">应用</option>
            <option value="game">游戏</option>
          </select>
          <select value={filterRank} onChange={e => { setFilterRank(e.target.value as typeof filterRank); setOPage(0) }}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
            <option value="all">全部排名</option>
            <option value="has">有排名</option>
            <option value="top10">前10名</option>
            <option value="none">无排名</option>
          </select>
          <select value={filterTrend} onChange={e => { setFilterTrend(e.target.value as typeof filterTrend); setOPage(0) }}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
            <option value="all">全部趋势</option>
            <option value="rankup">涨排名</option>
            <option value="rankdown">跌排名</option>
          </select>
          <input value={filterKw} onChange={e => { setFilterKw(e.target.value); setOPage(0) }}
            placeholder="搜索关键词…"
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 w-44" />
          {anyFilter && (
            <button onClick={() => { setFilterType('all'); setFilterRank('all'); setFilterTrend('all'); setFilterKw(''); setOPage(0) }}
              className="text-xs text-gray-400 hover:text-red-400 px-2 py-1.5 rounded border border-gray-200 hover:border-red-200 transition-colors">
              清除筛选
            </button>
          )}
          <span className="ml-auto text-xs text-gray-400">{filtered.length} 条</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
          <span className="text-sm font-semibold text-gray-700">竞品关键词成效明细</span>
          <span className="text-xs text-gray-400 ml-2">期间内发现词的当前排名情况</span>
        </div>
        {loading ? <Spinner /> : outcomes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-sm">暂无数据</span>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-[48px_2fr_52px_80px_72px_72px_72px] gap-x-2 px-4 py-2 bg-gray-50/40 border-b border-gray-100 text-[11px] font-medium text-gray-400 min-w-[620px]">
                <span className="text-center">日期</span>
                <span>关键词</span>
                <span className="text-center">类型</span>
                <span className="text-right">搜索量</span>
                <span className="text-center">当前排名</span>
                <span className="text-center">趋势</span>
                <span className="text-center">排名日期</span>
              </div>
              <div className="divide-y divide-gray-50 min-w-[620px]">
                {paged.map((r, i) => (
                  <div key={i} className="grid grid-cols-[48px_2fr_52px_80px_72px_72px_72px] gap-x-2 px-4 py-2.5 hover:bg-gray-50/60 transition-colors items-center">
                    <span className="text-xs text-gray-400 text-center">{r.content_date.slice(5).replace('-', '/')}</span>
                    <span className="text-sm text-gray-800 truncate" title={r.keyword}>{r.keyword}</span>
                    <div className="flex justify-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.content_type === 'game' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                        {r.content_type === 'game' ? '游戏' : '应用'}
                      </span>
                    </div>
                    <span className="text-sm text-gray-600 tabular-nums text-right">{r.volume ? fmtVol(r.volume) : '—'}</span>
                    <div className="text-center">
                      {r.rank_position != null
                        ? <span className="text-sm text-gray-700">第{r.rank_position}名</span>
                        : <span className="text-sm text-gray-300">—</span>}
                    </div>
                    <div className="flex justify-center">
                      {r.rank_type === 'rankup'   && <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-1.5 py-0.5 rounded-full">涨↑</span>}
                      {r.rank_type === 'rankdown'  && <span className="text-xs bg-red-50 text-red-400 border border-red-200 px-1.5 py-0.5 rounded-full">跌↓</span>}
                      {!r.rank_type && <span className="text-xs text-gray-300">—</span>}
                    </div>
                    <span className="text-xs text-gray-400 text-center">{r.rank_date ? r.rank_date.slice(5).replace('-', '/') : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/40 text-xs text-gray-400">
                <span>第 {oPage * O_PAGE + 1}–{Math.min((oPage + 1) * O_PAGE, filtered.length)} 条，共 {filtered.length} 条</span>
                <div className="flex items-center gap-1">
                  <button disabled={oPage === 0} onClick={() => setOPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 transition-colors">上一页</button>
                  <span className="px-2">{oPage + 1} / {totalPages}</span>
                  <button disabled={oPage >= totalPages - 1} onClick={() => setOPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-40 transition-colors">下一页</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Mock Data (set USE_MOCK_DATA = false to disable) ──────────────────────────

const USE_MOCK_DATA = true

const MOCK_GROUP: Group = {
  id: 'mock-group-1',
  name: 'SEO内容组',
  type: 'content',
  site_domains: ['myblog.com', 'mysite.com'],
  competitor_domains: [],
  members: [
    { user_id: 'user-1', username: '张三', member_type: 'member' },
    { user_id: 'user-2', username: '李四', member_type: 'member' },
  ],
}

const MOCK_REPORT: ReportData = {
  period: 'yesterday',
  startDate: '2026-07-13',
  endDate: '2026-07-13',
  groupTotal: {
    total: { count: 28, volume: 48600 },
    bySource: [
      { source: 'aizhan', count: 18, volume: 32400 },
      { source: 'baidu', count: 10, volume: 16200 },
    ],
  },
  members: [
    {
      userId: 'user-1', username: '张三', memberType: 'member',
      total: { count: 16, volume: 28900 },
      bySource: [{ source: 'aizhan', count: 10, volume: 18000 }, { source: 'baidu', count: 6, volume: 10900 }],
      byDate: [{
        date: '2026-07-13', count: 16, volume: 28900,
        keywords: [
          { keyword: 'SEO优化技巧', search_volume: 5400, source: 'aizhan', operation_type: 'add', final_keyword: null, page_url: 'https://myblog.com/seo-tips' },
          { keyword: '关键词研究方法', search_volume: 2100, source: 'aizhan', operation_type: 'add', final_keyword: null, page_url: null },
          { keyword: '内容营销策略', search_volume: 3800, source: 'baidu', operation_type: 'add', final_keyword: null, page_url: null },
          { keyword: '搜索引擎算法', search_volume: 1200, source: 'aizhan', operation_type: 'add', final_keyword: null, page_url: null },
          { keyword: '长尾关键词挖掘', search_volume: 890, source: 'aizhan', operation_type: 'add', final_keyword: null, page_url: null },
        ],
      }],
    },
    {
      userId: 'user-2', username: '李四', memberType: 'member',
      total: { count: 12, volume: 19700 },
      bySource: [{ source: 'aizhan', count: 8, volume: 14400 }, { source: 'baidu', count: 4, volume: 5300 }],
      byDate: [{
        date: '2026-07-13', count: 12, volume: 19700,
        keywords: [
          { keyword: '外链建设技巧', search_volume: 3200, source: 'aizhan', operation_type: 'add', final_keyword: null, page_url: null },
          { keyword: '网站速度优化', search_volume: 4100, source: 'aizhan', operation_type: 'add', final_keyword: null, page_url: 'https://mysite.com/speed' },
          { keyword: '移动端SEO', search_volume: 1800, source: 'baidu', operation_type: 'add', final_keyword: null, page_url: null },
          { keyword: '本地SEO策略', search_volume: 960, source: 'aizhan', operation_type: 'add', final_keyword: null, page_url: null },
        ],
      }],
    },
  ],
}

const MOCK_OUTCOMES: OutcomeRow[] = [
  { id: 'o1', user_id: 'user-1', username: '张三', keyword: 'SEO优化技巧', final_keyword: null, page_url: 'https://myblog.com/seo-tips', operation_type: 'add', search_volume: 5400, source: 'aizhan', claimed_date: '2026-07-10', submitted_at: '2026-07-11T03:00:00Z', indexed: true, first_seen_date: '2026-07-12', disappeared_date: null, rank_keyword: 'SEO优化技巧', rank_position: 8, prev_rank: 25, rank_change: 17, rank_volume: 5200, rank_date: '2026-07-14', outcome: 'success' },
  { id: 'o2', user_id: 'user-1', username: '张三', keyword: '关键词研究方法', final_keyword: null, page_url: null, operation_type: 'add', search_volume: 2100, source: 'aizhan', claimed_date: '2026-07-10', submitted_at: '2026-07-11T03:30:00Z', indexed: true, first_seen_date: '2026-07-13', disappeared_date: null, rank_keyword: null, rank_position: null, prev_rank: null, rank_change: null, rank_volume: null, rank_date: null, outcome: 'pending' },
  { id: 'o3', user_id: 'user-2', username: '李四', keyword: '外链建设技巧', final_keyword: null, page_url: null, operation_type: 'add', search_volume: 3200, source: 'aizhan', claimed_date: '2026-07-09', submitted_at: '2026-07-10T05:00:00Z', indexed: false, first_seen_date: null, disappeared_date: null, rank_keyword: null, rank_position: null, prev_rank: null, rank_change: null, rank_volume: null, rank_date: null, outcome: 'fail' },
  { id: 'o4', user_id: 'user-2', username: '李四', keyword: '网站速度优化', final_keyword: null, page_url: 'https://mysite.com/speed', operation_type: 'add', search_volume: 4100, source: 'aizhan', claimed_date: '2026-07-11', submitted_at: '2026-07-12T02:00:00Z', indexed: true, first_seen_date: '2026-07-13', disappeared_date: null, rank_keyword: '网站速度优化', rank_position: 5, prev_rank: 18, rank_change: 13, rank_volume: 4000, rank_date: '2026-07-14', outcome: 'success' },
  { id: 'o5', user_id: 'user-1', username: '张三', keyword: '内容营销策略', final_keyword: null, page_url: null, operation_type: 'add', search_volume: 3800, source: 'baidu', claimed_date: '2026-07-12', submitted_at: null, indexed: false, first_seen_date: null, disappeared_date: null, rank_keyword: null, rank_position: null, prev_rank: null, rank_change: null, rank_volume: null, rank_date: null, outcome: 'pending' },
]

const MOCK_OUTCOME_SUMMARY: OutcomeSummary = { total: 5, successCount: 2, indexedCount: 3, pendingCount: 2 }

const MOCK_RULES: Rule[] = [
  { id: 'mock-r1', rule_number: 1, name: '主词+地域词组合投稿', type: 'add', status: 'active', source: 'data', stage_applicability: ['新站', '成长期'], description: '优先选择搜索量500-3000的主词，叠加本地化修饰词，提升抓取概率。', confidence: 82, success_count: 15, fail_count: 3, priority: 1, site_ids: [], competitor_domains: [], created_at: '2026-06-01T00:00:00Z' },
  { id: 'mock-r2', rule_number: 2, name: '近30天涨排名词优先更新', type: 'update', status: 'active', source: 'manual', stage_applicability: ['成长期', '成熟期'], description: '站点上月出现过排名波动（涨）的词，本月再次认领并更新内容，有80%概率巩固排名。', confidence: 88, success_count: 9, fail_count: 1, priority: 2, site_ids: [], competitor_domains: [], created_at: '2026-06-10T00:00:00Z' },
  { id: 'mock-r3', rule_number: 3, name: '避开竞品高密度词', type: 'mixed', status: 'testing', source: 'ai', stage_applicability: ['新站'], description: '竞品同期大量覆盖的词，新站成功率低于20%，建议优先投入差异化词库。', confidence: 60, success_count: 2, fail_count: 5, priority: 3, site_ids: [], competitor_domains: [], created_at: '2026-07-01T00:00:00Z' },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function GroupReportPage() {
  const { role } = useUser()
  const canSeeAll = role === 'super' || role === 'admin'

  const [groups, setGroups] = useState<Group[]>(USE_MOCK_DATA ? [MOCK_GROUP] : [])
  const [activeTabId, setActiveTabId] = useState<string>(USE_MOCK_DATA ? 'mock-group-1' : 'competitors') // 'competitors' | groupId
  const [competitorGroupId, setCompetitorGroupId] = useState<string>('')
  const [reportTab, setReportTab] = useState<ReportTab>('submissions')
  const [period, setPeriod] = useState<Period>('yesterday')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [report, setReport] = useState<ReportData | null>(USE_MOCK_DATA ? MOCK_REPORT : null)
  const [loading, setLoading] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [entryKwPage, setEntryKwPage] = useState<Record<string, number>>({})
  const [accordionPage, setAccordionPage] = useState(0)
  const [filterUserId, setFilterUserId] = useState('all')
  const [groupsLoading, setGroupsLoading] = useState(USE_MOCK_DATA ? false : true)

  // Outcomes tab state
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>(USE_MOCK_DATA ? MOCK_OUTCOMES : [])
  const [outcomeSummary, setOutcomeSummary] = useState<OutcomeSummary | null>(USE_MOCK_DATA ? MOCK_OUTCOME_SUMMARY : null)
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
  const [rules, setRules] = useState<Rule[]>(USE_MOCK_DATA ? MOCK_RULES : [])
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
  const [competitorDateEnd, setCompetitorDateEnd] = useState('')
  const [competitorPeriod, setCompetitorPeriod] = useState<Period>('yesterday')
  const [competitorData, setCompetitorData] = useState<CompetitorData | null>(null)
  const [competitorLoading, setCompetitorLoading] = useState(false)
  const [showManageModal, setShowManageModal] = useState(false)
  const [allSites, setAllSites] = useState<SiteFull[]>([])

  // Site profile (规则中心 — 站点档案)
  const [groupExtProfiles, setGroupExtProfiles] = useState<Record<string, ExtSiteProfile>>({})
  const [expandedSiteProfile, setExpandedSiteProfile] = useState<string | null>(null)
  const [profileForm, setProfileForm] = useState<{ post_start_hour: string; post_end_hour: string; post_interval_minutes: string }>({ post_start_hour: '', post_end_hour: '', post_interval_minutes: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  // Monitored weight & index data (auto-loaded from weight_history / index_snapshots)
  const [siteWeightData, setSiteWeightData] = useState<Record<string, WeightSnapshot>>({})
  const [siteIndexData, setSiteIndexData] = useState<Record<string, IndexSnapshot>>({})
  const [kwAnalysis, setKwAnalysis] = useState<Record<string, KwAnalysisResult>>({})
  const [kwAnalysisLoading, setKwAnalysisLoading] = useState<Record<string, boolean>>({})
  // Competitor profile (提交记录 — 发布规则)
  const [compProfile, setCompProfile] = useState<Record<string, CompetitorProfileData | null>>({})
  const [compProfileLoading, setCompProfileLoading] = useState<Record<string, boolean>>({})
  const [compRuleModalOpen, setCompRuleModalOpen] = useState(false)
  const [compProfileForm, setCompProfileForm] = useState({ post_start_hour: '', post_end_hour: '', post_interval_minutes: '', same_base_diff_sub_is_update: false, same_name_diff_date_is_update: false })
  const [compProfileSaving, setCompProfileSaving] = useState(false)

  const today = useMemo(() => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), [])
  const yesterday = useMemo(() => new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10), [])

  useEffect(() => { setCompetitorDate(yesterday) }, [yesterday])

  // Compute date range for competitor queries
  const competitorDateRange = useMemo(() => {
    if (competitorPeriod === 'yesterday') return { start: yesterday, end: yesterday }
    if (competitorPeriod === 'week') {
      const d = new Date(Date.now() + 8 * 3600000)
      const dow = d.getDay() || 7
      const monday = new Date(d.getTime() - (dow - 1) * 86400000)
      return { start: monday.toISOString().slice(0, 10), end: yesterday }
    }
    if (competitorPeriod === 'month') {
      const d = new Date(Date.now() + 8 * 3600000)
      return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: yesterday }
    }
    // custom
    const s = competitorDate || yesterday
    const e = competitorDateEnd || s
    return { start: s, end: e }
  }, [competitorPeriod, competitorDate, competitorDateEnd, yesterday])

  // Derived: activeGroupId is the selected group tab (empty when competitors tab active)
  const activeGroupId = activeTabId !== 'competitors' ? activeTabId : ''
  // For rules: use competitor's group ID when in competitor tab
  const rulesGroupId = activeTabId === 'competitors' ? competitorGroupId : activeGroupId

  // Load groups
  useEffect(() => {
    if (USE_MOCK_DATA) return
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
    if (!activeCompetitorDomain || competitorInnerTab === 'rules') return
    const { start, end } = competitorDateRange
    if (!start) return
    setCompetitorLoading(true)
    setCompetitorData(null)
    const apiTab = competitorInnerTab === 'outcomes' ? 'outcomes' : 'keywords'
    const url = `/api/competitor-site?domain=${encodeURIComponent(activeCompetitorDomain)}&date=${start}&date_start=${start}&date_end=${end}&tab=${apiTab}`
    fetch(url)
      .then(r => r.json())
      .then(d => setCompetitorData(d))
      .finally(() => setCompetitorLoading(false))
  }, [activeCompetitorDomain, competitorDateRange, competitorInnerTab])

  // Load member report
  useEffect(() => {
    if (USE_MOCK_DATA || !activeGroupId) return
    if (period === 'custom') {
      if (!customStart || !customEnd || customStart > customEnd) return
    }
    setLoading(true)
    setReport(null)
    setExpandedKeys(new Set())
    setEntryKwPage({})
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
    if (USE_MOCK_DATA || !activeGroupId || reportTab !== 'outcomes') return
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

  // Load rules data for whichever tab (own-site or competitor) is showing the rules panel
  useEffect(() => {
    if (USE_MOCK_DATA) return
    const needRules = reportTab === 'rules' || (activeTabId === 'competitors' && competitorInnerTab === 'rules')
    if (!rulesGroupId || !needRules) return
    const isCompetitor = activeTabId === 'competitors' && competitorInnerTab === 'rules'
    setRulesLoading(true)
    fetch(`/api/task-groups/${rulesGroupId}/rules${isCompetitor ? '?competitor=1' : ''}`)
      .then(r => r.json())
      .then(d => setRules((d.rules ?? []).map((r: Rule) => ({ ...r, site_ids: r.site_ids ?? [], competitor_domains: r.competitor_domains ?? [] }))))
      .finally(() => setRulesLoading(false))
  }, [rulesGroupId, reportTab, activeTabId, competitorInnerTab])

  // Load extended site profiles when own-site rules tab is active
  useEffect(() => {
    if (reportTab !== 'rules' || !activeGroupId) return
    const group = groups.find(g => g.id === activeGroupId)
    const domains = group?.site_domains ?? []
    if (domains.length === 0) return
    fetch('/api/sites')
      .then(r => r.json())
      .then(async (d) => {
        const map: Record<string, ExtSiteProfile> = {}
        const siteIds: string[] = []
        for (const s of (d.sites ?? [])) {
          if (domains.includes(s.domain)) {
            map[s.domain] = s
            siteIds.push(s.id)
          }
        }
        setGroupExtProfiles(prev => ({ ...prev, ...map }))
        if (siteIds.length === 0) return
        // Load latest weight & index from monitored tables
        const db = getBrowserClient()
        const [{ data: wRows }, { data: iRows }] = await Promise.all([
          db.from('weight_history').select('site_id, pc_weight, mobile_weight, pc_ip, pc_ip_max, mobile_ip, mobile_ip_max').in('site_id', siteIds).order('record_date', { ascending: false }),
          db.from('index_snapshots').select('site_id, index_count').in('site_id', siteIds).order('snapshot_date', { ascending: false }),
        ])
        const wMap: Record<string, WeightSnapshot> = {}
        for (const r of ((wRows ?? []) as (WeightSnapshot & { site_id: string })[])) {
          if (!wMap[r.site_id]) wMap[r.site_id] = r
        }
        const iMap: Record<string, IndexSnapshot> = {}
        for (const r of ((iRows ?? []) as (IndexSnapshot & { site_id: string })[])) {
          if (!iMap[r.site_id]) iMap[r.site_id] = r
        }
        // Re-key by domain for easy lookup
        const wByDomain: Record<string, WeightSnapshot> = {}
        const iByDomain: Record<string, IndexSnapshot> = {}
        for (const s of (d.sites ?? [])) {
          if (wMap[s.id]) wByDomain[s.domain] = wMap[s.id]
          if (iMap[s.id]) iByDomain[s.domain] = iMap[s.id]
        }
        setSiteWeightData(prev => ({ ...prev, ...wByDomain }))
        setSiteIndexData(prev => ({ ...prev, ...iByDomain }))
      })
  }, [activeGroupId, reportTab, groups])

  // Load competitor profile when competitor keywords (提交记录) tab is active
  useEffect(() => {
    if (activeTabId !== 'competitors' || competitorInnerTab !== 'keywords' || !activeCompetitorDomain) return
    if (compProfile[activeCompetitorDomain] !== undefined) return
    setCompProfileLoading(prev => ({ ...prev, [activeCompetitorDomain]: true }))
    fetch(`/api/competitor-profiles/${encodeURIComponent(activeCompetitorDomain)}`)
      .then(r => r.json())
      .then(d => {
        setCompProfile(prev => ({ ...prev, [activeCompetitorDomain]: d.profile ?? null }))
        // form populated on modal open instead
      })
      .finally(() => setCompProfileLoading(prev => ({ ...prev, [activeCompetitorDomain]: false })))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, competitorInnerTab, activeCompetitorDomain])

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

  async function openManageModal() {
    if (allSites.length === 0) {
      const d = await fetch('/api/sites').then(r => r.json())
      setAllSites(d.sites ?? [])
    }
    setShowManageModal(true)
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

  // ── Site profile helpers ─────────────────────────────────────────────────────

  function toggleSiteProfileExpand(domain: string) {
    if (expandedSiteProfile === domain) { setExpandedSiteProfile(null); return }
    setExpandedSiteProfile(domain)
    const p = groupExtProfiles[domain]
    setProfileForm({
      post_start_hour: p?.post_start_hour?.toString() ?? '',
      post_end_hour: p?.post_end_hour?.toString() ?? '',
      post_interval_minutes: p?.post_interval_minutes?.toString() ?? '',
    })
  }

  async function saveSiteProfile(domain: string) {
    const p = groupExtProfiles[domain]
    if (!p) return
    setProfileSaving(true)
    try {
      const body = {
        post_start_hour: profileForm.post_start_hour ? Number(profileForm.post_start_hour) : null,
        post_end_hour: profileForm.post_end_hour ? Number(profileForm.post_end_hour) : null,
        post_interval_minutes: profileForm.post_interval_minutes ? Number(profileForm.post_interval_minutes) : null,
      }
      await fetch(`/api/sites/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setGroupExtProfiles(prev => ({ ...prev, [domain]: { ...prev[domain], ...body } }))
    } finally { setProfileSaving(false) }
  }

  async function loadKwAnalysis(domain: string) {
    const p = groupExtProfiles[domain]
    if (!p) return
    setKwAnalysisLoading(prev => ({ ...prev, [domain]: true }))
    try {
      const res = await fetch(`/api/sites/${p.id}/keyword-analysis`)
      const d = await res.json()
      setKwAnalysis(prev => ({ ...prev, [domain]: d }))
    } finally { setKwAnalysisLoading(prev => ({ ...prev, [domain]: false })) }
  }

  async function saveCompRule(domain: string) {
    setCompProfileSaving(true)
    try {
      const body = {
        post_start_hour: compProfileForm.post_start_hour !== '' ? Number(compProfileForm.post_start_hour) : null,
        post_end_hour: compProfileForm.post_end_hour !== '' ? Number(compProfileForm.post_end_hour) : null,
        post_interval_minutes: compProfileForm.post_interval_minutes !== '' ? Number(compProfileForm.post_interval_minutes) : null,
        same_base_diff_sub_is_update: compProfileForm.same_base_diff_sub_is_update,
        same_name_diff_date_is_update: compProfileForm.same_name_diff_date_is_update,
      }
      const res = await fetch(`/api/competitor-profiles/${encodeURIComponent(domain)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json()
      setCompProfile(prev => ({ ...prev, [domain]: d.profile }))
      setCompRuleModalOpen(false)
    } finally { setCompProfileSaving(false) }
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

  // ── Rules helpers (shared by own-site and competitor rules panels) ─────────────
  const filteredRules = rules.filter(r =>
    (!ruleFilterStatus || r.status === ruleFilterStatus) &&
    (!ruleFilterType   || r.type   === ruleFilterType)
  )

  const ruleSuccessRate = (r: Rule) => {
    const total = r.success_count + r.fail_count
    return total > 0 ? Math.round(r.success_count / total * 100) : null
  }

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
        const res = await fetch(`/api/task-groups/${rulesGroupId}/rules`, {
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

  async function toggleRuleStatus(rule: Rule) {
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

  function openEditRule(rule: Rule) {
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
                  <button onClick={openManageModal}
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
                    <button onClick={openManageModal} className="text-sm text-orange-500 hover:text-orange-600 font-medium">
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
                          ['outcomes', '成效追踪'],
                          ['rules', '规则中心'],
                        ] as [CompetitorInnerTab, string][]).map(([t, label]) => (
                          <button key={t} onClick={() => setCompetitorInnerTab(t)}
                            className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${competitorInnerTab === t ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Period buttons — same design as group tab */}
                      {competitorInnerTab !== 'rules' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-gray-500 mr-1">时间范围：</span>
                          <div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden">
                            {(['yesterday', 'week', 'month', 'custom'] as Period[]).map(p => (
                              <button key={p} onClick={() => setCompetitorPeriod(p)}
                                className={`px-4 py-1.5 text-sm font-medium transition-colors ${competitorPeriod === p ? 'bg-green-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                                {PERIOD_LABELS[p]}
                              </button>
                            ))}
                          </div>
                          {competitorPeriod === 'custom' ? (
                            <div className="flex items-center gap-2">
                              <input type="date" value={competitorDate} max={competitorDateEnd || today}
                                onChange={e => setCompetitorDate(e.target.value)}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700" />
                              <span className="text-gray-400 text-sm">~</span>
                              <input type="date" value={competitorDateEnd} min={competitorDate} max={today}
                                onChange={e => setCompetitorDateEnd(e.target.value)}
                                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700" />
                            </div>
                          ) : competitorData && !competitorLoading ? (
                            <span className="text-xs text-gray-400">
                              {competitorDateRange.start === competitorDateRange.end
                                ? competitorDateRange.start
                                : `${competitorDateRange.start} ~ ${competitorDateRange.end}`}
                              {competitorInnerTab === 'keywords'
                                ? ` · ${competitorData.keywords.length} 词`
                                : ` · ${competitorData.outcomeSummary?.total ?? 0} 词`}
                            </span>
                          ) : null}
                        </div>
                      )}

                      {/* Content */}
                      {competitorInnerTab === 'rules' ? (
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
                            <span className="text-xs text-gray-400 ml-1">{filteredRules.length} 条规则</span>
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
                          {rulesLoading ? <Spinner /> : filteredRules.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                              <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <span className="text-sm">{rules.length === 0 ? '暂无规则，点击「新建规则」开始建立规则库' : '没有符合筛选条件的规则'}</span>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {filteredRules.map(rule => {
                                const sr = ruleSuccessRate(rule)
                                const total = rule.success_count + rule.fail_count
                                return (
                                  <div key={rule.id} className={`bg-white rounded-xl border transition-colors ${rule.status === 'inactive' ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                                    <div className="px-4 py-3 flex items-start gap-3">
                                      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                                        <span className="text-xs font-bold text-gray-500">#{rule.rule_number}</span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-semibold text-gray-800">{rule.name}</span>
                                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${RULE_TYPE_COLORS[rule.type] ?? 'bg-gray-100 text-gray-500'}`}>{RULE_TYPE_LABELS[rule.type]}</span>
                                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${RULE_STATUS_COLORS[rule.status] ?? 'bg-gray-100 text-gray-400'}`}>{RULE_STATUS_LABELS[rule.status]}</span>
                                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${RULE_SOURCE_COLORS[rule.source] ?? 'bg-gray-100 text-gray-400'}`}>{RULE_SOURCE_LABELS[rule.source]}</span>
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
                                        {canSeeAll && (
                                          <div className="flex items-center gap-1">
                                            <button onClick={() => openEditRule(rule)}
                                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="编辑">
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                            </button>
                                            <button onClick={() => toggleRuleStatus(rule)}
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

                        </div>
                      ) : competitorInnerTab === 'keywords' ? (
                        <div className="space-y-3">
                          {/* 发布规则条 */}
                          {(() => {
                            const p = compProfile[activeCompetitorDomain]
                            const hasRule = p && (p.post_start_hour != null || p.post_end_hour != null || p.same_base_diff_sub_is_update || p.same_name_diff_date_is_update)
                            return (
                              <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-wrap min-h-[44px]">
                                <div className="flex-1 flex items-center gap-2 flex-wrap text-xs">
                                  {compProfileLoading[activeCompetitorDomain] ? (
                                    <span className="text-gray-300">加载中…</span>
                                  ) : !hasRule ? (
                                    <span className="text-gray-300">暂无发布规则</span>
                                  ) : (
                                    <>
                                      {(p!.post_start_hour != null || p!.post_end_hour != null) && (
                                        <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded font-medium">
                                          发布时间 {p!.post_start_hour ?? '?'}:00 — {p!.post_end_hour ?? '?'}:00{p!.post_interval_minutes ? ` · 每${p!.post_interval_minutes}min` : ''}
                                        </span>
                                      )}
                                      {p!.same_base_diff_sub_is_update && (
                                        <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">同词不同下拉词 = 更新</span>
                                      )}
                                      {p!.same_name_diff_date_is_update && (
                                        <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded">同名不同日期 = 更新</span>
                                      )}
                                    </>
                                  )}
                                </div>
                                {canSeeAll && (
                                  <button onClick={() => {
                                    const pr = compProfile[activeCompetitorDomain]
                                    setCompProfileForm({
                                      post_start_hour: pr?.post_start_hour?.toString() ?? '',
                                      post_end_hour: pr?.post_end_hour?.toString() ?? '',
                                      post_interval_minutes: pr?.post_interval_minutes?.toString() ?? '',
                                      same_base_diff_sub_is_update: pr?.same_base_diff_sub_is_update ?? false,
                                      same_name_diff_date_is_update: pr?.same_name_diff_date_is_update ?? false,
                                    })
                                    setCompRuleModalOpen(true)
                                  }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors flex-shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                                    新增规则
                                  </button>
                                )}
                              </div>
                            )
                          })()}
                          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-700">{activeCompetitorDomain}</span>
                              <span className="text-xs text-gray-400">
                                · {competitorDateRange.start === competitorDateRange.end ? competitorDateRange.start : `${competitorDateRange.start} ~ ${competitorDateRange.end}`} 新增词
                              </span>
                            </div>
                            {competitorLoading ? <Spinner /> : <CompetitorKeywordsTable keywords={competitorData?.keywords || []} />}
                          </div>
                        </div>
                      ) : (
                        <CompetitorOutcomesPanel
                          site={competitorData?.site ?? null}
                          outcomes={competitorData?.outcomes ?? []}
                          summary={competitorData?.outcomeSummary ?? null}
                          loading={competitorLoading}
                        />
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
                <span className="text-xs text-gray-400 ml-1">{filteredRules.length} 条规则</span>
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
              {rulesLoading ? <Spinner /> : filteredRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span className="text-sm">{rules.length === 0 ? '暂无规则，点击「新建规则」开始建立规则库' : '没有符合筛选条件的规则'}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredRules.map(rule => {
                    const sr = ruleSuccessRate(rule)
                    const total = rule.success_count + rule.fail_count
                    return (
                      <div key={rule.id} className={`bg-white rounded-xl border transition-colors ${rule.status === 'inactive' ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                        <div className="px-4 py-3 flex items-start gap-3">
                          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                            <span className="text-xs font-bold text-gray-500">#{rule.rule_number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-800">{rule.name}</span>
                              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${RULE_TYPE_COLORS[rule.type] ?? 'bg-gray-100 text-gray-500'}`}>{RULE_TYPE_LABELS[rule.type]}</span>
                              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${RULE_STATUS_COLORS[rule.status] ?? 'bg-gray-100 text-gray-400'}`}>{RULE_STATUS_LABELS[rule.status]}</span>
                              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${RULE_SOURCE_COLORS[rule.source] ?? 'bg-gray-100 text-gray-400'}`}>{RULE_SOURCE_LABELS[rule.source]}</span>
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
                            {canSeeAll && (
                              <div className="flex items-center gap-1">
                                <button onClick={() => openEditRule(rule)}
                                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="编辑">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                </button>
                                <button onClick={() => toggleRuleStatus(rule)}
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

            </div>
          )}

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
                            {isOpen && (() => {
                              const kwPg = entryKwPage[entry.key] ?? 0
                              const kwTotal = entry.keywords.length
                              const kwPages = Math.ceil(kwTotal / KW_PAGE_SIZE)
                              const kwSlice = entry.keywords.slice(kwPg * KW_PAGE_SIZE, (kwPg + 1) * KW_PAGE_SIZE)
                              return (
                                <div className="border-t border-gray-50">
                                  <div className="grid grid-cols-[1fr_120px_80px_auto] gap-x-3 px-5 py-1.5 bg-gray-50/50 text-[11px] font-medium text-gray-400">
                                    <span>关键词 / 最终词</span><span>页面URL</span><span className="text-right">搜索量</span><span className="text-right">来源</span>
                                  </div>
                                  {kwSlice.map((kw, i) => (
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
                                  {kwPages > 1 && (
                                    <div className="flex items-center justify-between px-5 py-2 border-t border-gray-100 bg-gray-50/40">
                                      <span className="text-xs text-gray-400">{kwTotal} 词 · {kwPg + 1}/{kwPages} 页</span>
                                      <div className="flex items-center gap-1">
                                        <button disabled={kwPg === 0}
                                          onClick={() => setEntryKwPage(p => ({ ...p, [entry.key]: kwPg - 1 }))}
                                          className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">上 {KW_PAGE_SIZE} 条</button>
                                        <button disabled={kwPg >= kwPages - 1}
                                          onClick={() => setEntryKwPage(p => ({ ...p, [entry.key]: kwPg + 1 }))}
                                          className="px-2.5 py-1 text-xs rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 transition-colors">下 {KW_PAGE_SIZE} 条</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })()}
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

      {/* 竞品发布规则 Modal */}
      {compRuleModalOpen && activeCompetitorDomain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCompRuleModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">新增规则</h3>
                <p className="text-xs text-gray-400 mt-0.5">{activeCompetitorDomain}</p>
              </div>
              <button onClick={() => setCompRuleModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {/* 发布时间段 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">发布时间段</p>
                <div className="grid grid-cols-3 gap-3">
                  {([['post_start_hour', '开始（时）'], ['post_end_hour', '结束（时）'], ['post_interval_minutes', '间隔（分钟）']] as [keyof typeof compProfileForm, string][]).map(([key, label]) => (
                    <div key={key}>
                      <label className="text-xs text-gray-400 block mb-1">{label}</label>
                      <input
                        type="number"
                        min={key === 'post_interval_minutes' ? 1 : 0}
                        max={key === 'post_interval_minutes' ? undefined : 23}
                        value={String(compProfileForm[key])}
                        onChange={e => setCompProfileForm(p => ({ ...p, [key]: e.target.value }))}
                        placeholder="—"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-300 text-gray-700"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-300 mt-1.5">用于预测该竞品的发布时间规律</p>
              </div>
              {/* 新增/更新判断规则 */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">判断新增还是更新</p>
                <div className="space-y-2.5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compProfileForm.same_base_diff_sub_is_update}
                      onChange={e => setCompProfileForm(p => ({ ...p, same_base_diff_sub_is_update: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                    <span className="text-sm text-gray-700 leading-snug">多个相同词但不同下拉词同时新增，默认为<span className="text-orange-600 font-medium">更新</span></span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compProfileForm.same_name_diff_date_is_update}
                      onChange={e => setCompProfileForm(p => ({ ...p, same_name_diff_date_is_update: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                    />
                    <span className="text-sm text-gray-700 leading-snug">完全相同名称在不同日期出现，视为<span className="text-orange-600 font-medium">更新</span></span>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setCompRuleModalOpen(false)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">取消</button>
              <button onClick={() => saveCompRule(activeCompetitorDomain)} disabled={compProfileSaving}
                className="text-sm px-5 py-2 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50">
                {compProfileSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Rule Modal */}
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">规则名称 <span className="text-red-400">*</span></label>
                <input value={ruleForm.name} onChange={e => setRuleForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="例：排名下降30天更新"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
              </div>
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">规则说明</label>
                <textarea value={ruleForm.description} onChange={e => setRuleForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="描述触发条件、执行动作、预期效果…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 resize-none" />
              </div>
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

      {/* 站点目标 Modal */}
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

      {/* Manage competitors modal */}
      {showManageModal && activeCompetitorGroup && (
        <ManageCompetitorsModal
          groupName={activeCompetitorGroup.name}
          initialDomains={competitorDomains}
          allSites={allSites}
          onSave={saveCompetitorDomains}
          onClose={() => setShowManageModal(false)}
        />
      )}
    </div>
  )
}
