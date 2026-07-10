'use client'

import { useEffect, useState, useMemo, use } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserClient } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SiteInfo {
  id: string
  domain: string
  name: string
  has_rank_data: boolean
  has_rank_title: boolean
  site_stage: string | null
  site_focus: string | null
  site_strategy: string | null
}

interface Keyword {
  keyword: string
  content_type: string | null
  discovered_at: string
  content_date: string | null
  classification: 'new' | 'update'
  groupBase?: string
}

interface RankRow {
  keyword: string
  volume: number
  rank_position: number | null
  type: 'rankup' | 'rankdown'
  stat_date: string
}

interface IndexPage {
  url: string
  title: string | null
  first_seen_date: string
  last_seen_date: string
  disappeared_date: string | null
}

interface GlobalRule {
  id: string
  rule_number: number
  name: string
  type: string
  status: string
  source: string
  stage_applicability: string[]
  description: string | null
  confidence: number
  success_count: number
  fail_count: number
  priority: number
}

interface DiscoveredRule {
  id: string
  observation: string
  ruleType: 'add' | 'update' | 'mixed'
  stage: string
  saved: boolean
}

type Tab = 'additions' | 'outcomes' | 'rules'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMY(offsetDays = 0) {
  return new Date(Date.now() + 8 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10)
}

function classifyKeywords(kws: string[]): Map<string, { classification: 'new' | 'update'; groupBase?: string }> {
  const result = new Map<string, { classification: 'new' | 'update'; groupBase?: string }>()
  const sorted = [...kws].sort((a, b) => a.length - b.length)
  const updateGroups = new Map<string, string[]>()

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].startsWith(sorted[i]) && sorted[j] !== sorted[i]) {
        if (!updateGroups.has(sorted[i])) updateGroups.set(sorted[i], [sorted[i]])
        updateGroups.get(sorted[i])!.push(sorted[j])
      }
    }
  }

  const inGroup = new Set<string>()
  for (const [base, variants] of Array.from(updateGroups.entries())) {
    if (variants.length >= 2) {
      for (const v of variants) {
        inGroup.add(v)
        result.set(v, { classification: 'update', groupBase: base })
      }
    }
  }
  for (const kw of kws) {
    if (!result.has(kw)) result.set(kw, { classification: 'new' })
  }
  return result
}

function Spinner() {
  return <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /></div>
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CompetitorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { role } = useUser()
  const canEdit = role === 'super' || role === 'admin'

  const [site, setSite] = useState<SiteInfo | null>(null)
  const [siteLoading, setSiteLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('additions')

  // Tab 1: 昨日新增
  const [kwDate, setKwDate] = useState(getMY(-1))
  const [kwContentType, setKwContentType] = useState<'app' | 'game' | 'all'>('all')
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [kwLoading, setKwLoading] = useState(false)
  const [kwCounts, setKwCounts] = useState<{ app: number; game: number; total: number }>({ app: 0, game: 0, total: 0 })
  const [showUpdateOnly, setShowUpdateOnly] = useState(false)

  // Tab 2: 成效追踪
  const [rankDate, setRankDate] = useState(getMY(-1))
  const [rankRows, setRankRows] = useState<RankRow[]>([])
  const [rankLoading, setRankLoading] = useState(false)
  const [rankType, setRankType] = useState<'rankup' | 'rankdown'>('rankup')
  const [indexPages, setIndexPages] = useState<IndexPage[]>([])
  const [indexLoading, setIndexLoading] = useState(false)
  const [indexFilter, setIndexFilter] = useState<'all' | 'new' | 'gone'>('all')

  // Tab 3: 规则发现
  const [discoveries, setDiscoveries] = useState<DiscoveredRule[]>([])
  const [newObs, setNewObs] = useState('')
  const [newRuleType, setNewRuleType] = useState<'add' | 'update' | 'mixed'>('add')
  const [newStage, setNewStage] = useState('')
  const [globalRules, setGlobalRules] = useState<GlobalRule[]>([])
  const [ruleSaving, setRuleSaving] = useState<string | null>(null)

  // Load site info
  useEffect(() => {
    setSiteLoading(true)
    fetch('/api/sites')
      .then(r => r.json())
      .then(d => {
        const found = (d.sites ?? []).find((s: SiteInfo) => s.id === id)
        setSite(found ?? null)
      })
      .finally(() => setSiteLoading(false))
  }, [id])

  // Load keywords when tab1 active or date/type changes
  useEffect(() => {
    if (activeTab !== 'additions' || !site) return
    loadKeywords()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, site, kwDate])

  async function loadKeywords() {
    if (!site) return
    setKwLoading(true)
    setKeywords([])
    try {
      const supabase = getBrowserClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, count: totalCount } = await (supabase.from('raw_keywords') as any)
        .select('keyword, content_type, discovered_at, content_date', { count: 'exact' })
        .eq('site_id', site.id)
        .eq('content_date', kwDate)
        .not('keyword', 'like', '%电脑版%')
        .order('keyword', { ascending: true })
        .limit(2000)

      const rows = (data || []) as { keyword: string; content_type: string | null; discovered_at: string; content_date: string | null }[]
      const appCount = rows.filter(r => r.content_type !== 'game').length
      const gameCount = rows.filter(r => r.content_type === 'game').length
      setKwCounts({ app: appCount, game: gameCount, total: totalCount ?? rows.length })

      // Classify
      const allKws = rows.map(r => r.keyword)
      const classMap = classifyKeywords(allKws)
      const classified: Keyword[] = rows.map(r => ({
        ...r,
        classification: classMap.get(r.keyword)?.classification ?? 'new',
        groupBase: classMap.get(r.keyword)?.groupBase,
      }))
      setKeywords(classified)
    } finally { setKwLoading(false) }
  }

  // Load rank data when tab2 active
  useEffect(() => {
    if (activeTab !== 'outcomes' || !site) return
    loadRankData()
    loadIndexPages()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, site, rankDate])

  async function loadRankData() {
    if (!site) return
    setRankLoading(true)
    setRankRows([])
    try {
      const supabase = getBrowserClient()
      const table = site.has_rank_title ? 'site_keyword_ranks' : 'rank_changes'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from(table) as any)
        .select('keyword, volume, rank_position, type, stat_date')
        .eq('site_id', site.id)
        .eq('stat_date', rankDate)
        .order('volume', { ascending: false })
        .limit(500)
      if (site.has_rank_title) q = q.eq('platform', 'mobile').gt('volume', 0)
      const { data } = await q
      setRankRows((data || []) as RankRow[])
    } finally { setRankLoading(false) }
  }

  async function loadIndexPages() {
    if (!site) return
    setIndexLoading(true)
    setIndexPages([])
    try {
      const supabase = getBrowserClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('site_indexed_pages') as any)
        .select('url, title, first_seen_date, last_seen_date, disappeared_date')
        .eq('site_id', site.id)
        .order('last_seen_date', { ascending: false })
        .limit(500)
      setIndexPages((data || []) as IndexPage[])
    } finally { setIndexLoading(false) }
  }

  // Load global rules for tab 3
  useEffect(() => {
    if (activeTab !== 'rules') return
    fetch('/api/rules').then(r => r.json()).then(d => setGlobalRules(d.rules ?? []))
  }, [activeTab])

  function addDiscovery() {
    if (!newObs.trim()) return
    setDiscoveries(prev => [...prev, {
      id: crypto.randomUUID(),
      observation: newObs.trim(),
      ruleType: newRuleType,
      stage: newStage,
      saved: false,
    }])
    setNewObs('')
  }

  async function saveToGlobalRules(d: DiscoveredRule) {
    setRuleSaving(d.id)
    try {
      const res = await fetch('/api/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `[竞品] ${d.observation.slice(0, 50)}`,
          type: d.ruleType,
          status: 'testing',
          source: 'data',
          stage_applicability: d.stage ? [d.stage] : [],
          description: `来源：竞品 ${site?.domain ?? ''}。${d.observation}`,
          confidence: 30,
        }),
      })
      if (res.ok) {
        const { rule } = await res.json()
        setGlobalRules(prev => [...prev, rule])
        setDiscoveries(prev => prev.map(x => x.id === d.id ? { ...x, saved: true } : x))
      }
    } finally { setRuleSaving(null) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filteredKws = useMemo(() => keywords.filter(k => {
    if (kwContentType === 'app'  && k.content_type === 'game') return false
    if (kwContentType === 'game' && k.content_type !== 'game') return false
    if (showUpdateOnly && k.classification !== 'update') return false
    return true
  }), [keywords, kwContentType, showUpdateOnly])

  const filteredRank = rankRows.filter(r => r.type === rankType)
  const filteredIndex = indexPages.filter(p => {
    if (indexFilter === 'new')  return p.first_seen_date >= getMY(-30) && !p.disappeared_date
    if (indexFilter === 'gone') return !!p.disappeared_date
    return true
  })
  const updateCount = keywords.filter(k => k.classification === 'update').length
  const newCount    = keywords.filter(k => k.classification === 'new').length

  // ── Render ────────────────────────────────────────────────────────────────────

  if (siteLoading) return <div className="p-6"><Spinner /></div>
  if (!site) return <div className="p-6 text-gray-400 text-sm">站点不存在</div>

  const TABS: { key: Tab; label: string }[] = [
    { key: 'additions', label: '昨日新增' },
    { key: 'outcomes',  label: '成效追踪' },
    { key: 'rules',     label: '规则发现' },
  ]

  const STAGE_TYPES = ['起站期', '成长期', '成熟期', '通用']

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{site.name || site.domain}</h1>
          <p className="text-sm text-gray-400">{site.domain}
            {site.site_stage && <span className="ml-2 text-xs bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">{
              { startup: '起站期', growth: '成长期', mature: '成熟期' }[site.site_stage] ?? site.site_stage
            }</span>}
            {site.site_focus && <span className="ml-1 text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{
              { game: '游戏', app: '应用', mixed: '混合' }[site.site_focus] ?? site.site_focus
            }</span>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-5 gap-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.key
                ? 'border-green-500 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab 1: 昨日新增 ── */}
      {activeTab === 'additions' && (
        <div>
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap mb-4">
            <input type="date" value={kwDate} max={getMY(0)}
              onChange={e => setKwDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[['all','全部'], ['app','应用'], ['game','游戏']].map(([val, label]) => (
                <button key={val} onClick={() => setKwContentType(val as typeof kwContentType)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${kwContentType === val ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showUpdateOnly} onChange={e => setShowUpdateOnly(e.target.checked)}
                className="rounded border-gray-300 text-green-500 focus:ring-green-400" />
              <span className="text-xs text-gray-600">仅看更新</span>
            </label>
            <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
              <span>总计 <b className="text-gray-700">{kwCounts.total}</b></span>
              <span className="text-green-600 font-medium">新增 {newCount}</span>
              <span className="text-orange-500 font-medium">更新系列 {updateCount}</span>
            </div>
          </div>

          {kwLoading ? <Spinner /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">关键词</th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 w-16">类型</th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 w-24">分类</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-28">发现时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredKws.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-10 text-gray-400 text-xs">该日期暂无数据</td></tr>
                    ) : filteredKws.map((kw, i) => (
                      <tr key={i} className={`hover:bg-gray-50 transition-colors ${kw.classification === 'update' ? 'bg-orange-50/30' : ''}`}>
                        <td className="px-4 py-2 text-gray-800">{kw.keyword}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${kw.content_type === 'game' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                            {kw.content_type === 'game' ? '游戏' : '应用'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {kw.classification === 'update' ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-50 text-orange-600">
                              更新系列 {kw.groupBase && kw.groupBase !== kw.keyword ? `(${kw.groupBase})` : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-50 text-green-600">新增</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-400">
                          {kw.discovered_at ? new Date(kw.discovered_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredKws.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
                  显示 {filteredKws.length} 条
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab 2: 成效追踪 ── */}
      {activeTab === 'outcomes' && (
        <div className="space-y-5">
          {/* Rank section */}
          <div>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold text-gray-700">排名变动</h2>
              <input type="date" value={rankDate} max={getMY(0)}
                onChange={e => { setRankDate(e.target.value); loadRankData() }}
                className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {[['rankup','涨排名'], ['rankdown','跌排名']].map(([val, label]) => (
                  <button key={val} onClick={() => setRankType(val as typeof rankType)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${rankType === val ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400">{filteredRank.length} 条</span>
            </div>
            {rankLoading ? <Spinner /> : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">关键词</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-24">搜索量</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 w-20">排名</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredRank.length === 0 ? (
                      <tr><td colSpan={3} className="text-center py-10 text-gray-400 text-xs">暂无数据</td></tr>
                    ) : filteredRank.slice(0, 200).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-800">{r.keyword}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{(r.volume ?? 0).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          {r.rank_position != null ? (
                            <span className={`text-xs font-medium ${r.type === 'rankup' ? 'text-green-600' : 'text-red-500'}`}>
                              {r.type === 'rankup' ? '↑' : '↓'} {r.rank_position}
                            </span>
                          ) : <span className="text-gray-300 text-xs">-</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Index pages section */}
          <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h2 className="text-sm font-semibold text-gray-700">收录页面</h2>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {[['all','全部'], ['new','近期收录'], ['gone','已脱收']].map(([val, label]) => (
                    <button key={val} onClick={() => setIndexFilter(val as typeof indexFilter)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${indexFilter === val ? 'bg-sky-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-400">{filteredIndex.length} 条</span>
              </div>
              {indexLoading ? <Spinner /> : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">页面 URL</th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 w-24">首次收录</th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 w-24">最近确认</th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 w-20">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredIndex.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-10 text-gray-400 text-xs">暂无数据</td></tr>
                      ) : filteredIndex.slice(0, 200).map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-600 truncate max-w-xs">
                            <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-blue-600 hover:underline">{p.url}</a>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500">{p.first_seen_date}</td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500">{p.last_seen_date}</td>
                          <td className="px-3 py-2 text-center">
                            {p.disappeared_date
                              ? <span className="text-[10px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded">已脱收</span>
                              : <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded">收录中</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
        </div>
      )}

      {/* ── Tab 3: 规则发现 ── */}
      {activeTab === 'rules' && (
        <div className="space-y-5">
          {/* Add observation */}
          {canEdit && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">记录观察</h2>
              <textarea value={newObs} onChange={e => setNewObs(e.target.value)}
                rows={3} placeholder={`在 ${site.domain} 中观察到什么规律？例如：每天9-11点批量新增应用词，词量约30-50个，且这批词通常3天内收录。`}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 resize-none" />
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {[['add','新增'], ['update','更新'], ['mixed','混合']].map(([val, label]) => (
                    <button key={val} onClick={() => setNewRuleType(val as typeof newRuleType)}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${newRuleType === val ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <select value={newStage} onChange={e => setNewStage(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
                  <option value="">适用阶段（可选）</option>
                  {STAGE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={addDiscovery} disabled={!newObs.trim()}
                  className="px-4 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
                  添加观察
                </button>
              </div>
            </div>
          )}

          {/* Discoveries list */}
          {discoveries.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">本次观察 ({discoveries.length})</h2>
              <div className="space-y-2">
                {discoveries.map(d => (
                  <div key={d.id} className={`bg-white rounded-xl border p-4 ${d.saved ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-gray-800">{d.observation}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-medium">
                            {d.ruleType === 'add' ? '新增' : d.ruleType === 'update' ? '更新' : '混合'}
                          </span>
                          {d.stage && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600">{d.stage}</span>}
                          <span className="text-[10px] text-gray-400">来源: {site.domain}</span>
                        </div>
                      </div>
                      {canEdit && (
                        d.saved ? (
                          <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ 已存入规则库</span>
                        ) : (
                          <button onClick={() => saveToGlobalRules(d)} disabled={ruleSaving === d.id}
                            className="px-3 py-1.5 text-xs font-medium bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50 transition-colors flex-shrink-0">
                            {ruleSaving === d.id ? '保存中…' : '存入规则库'}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing global rules for reference */}
          {globalRules.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">全局规则库参考 ({globalRules.length})</h2>
              <div className="space-y-1.5">
                {globalRules.map(r => (
                  <div key={r.id} className={`bg-white rounded-lg border border-gray-100 px-4 py-2.5 ${r.status === 'inactive' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-gray-400">#{r.rule_number}</span>
                      <span className="text-sm text-gray-700">{r.name}</span>
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${r.status === 'active' ? 'bg-green-50 text-green-600' : r.status === 'testing' ? 'bg-yellow-50 text-yellow-600' : 'bg-gray-100 text-gray-400'}`}>
                        {r.status === 'active' ? '启用' : r.status === 'testing' ? '测试中' : '停用'}
                      </span>
                    </div>
                    {r.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{r.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {discoveries.length === 0 && globalRules.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
              </svg>
              <p className="text-sm">观察竞品行为，记录有价值的规律</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
