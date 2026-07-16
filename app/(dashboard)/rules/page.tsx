'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@/lib/user-context'

interface SiteInfo { id: string; domain: string; name: string }

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
  tracked_success: number
  tracked_fail: number
  tracked_tracking: number
}

interface RuleForm {
  name: string
  type: 'add' | 'update' | 'mixed'
  status: 'active' | 'inactive' | 'testing'
  source: 'experiment' | 'manual' | 'ai' | 'data'
  stage_applicability: string[]
  description: string
  confidence: number
  success_count: number
  fail_count: number
  priority: number
  site_ids: string[]
  competitor_domains: string[]
}

const EMPTY_FORM: RuleForm = {
  name: '', type: 'add', status: 'active', source: 'manual',
  stage_applicability: [],
  description: '', confidence: 0, success_count: 0, fail_count: 0, priority: 0,
  site_ids: [], competitor_domains: [],
}

const STAGE_TYPES = ['起站期', '成长期', '成熟期', '通用']

const TYPE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  add:    { label: '新增', bg: 'bg-green-50',  text: 'text-green-700' },
  update: { label: '更新', bg: 'bg-blue-50',   text: 'text-blue-700' },
  mixed:  { label: '混合', bg: 'bg-purple-50', text: 'text-purple-700' },
}
const SOURCE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  manual:     { label: '手动', bg: 'bg-gray-100',   text: 'text-gray-600' },
  experiment: { label: '实验', bg: 'bg-orange-50',  text: 'text-orange-600' },
  data:       { label: '数据', bg: 'bg-cyan-50',    text: 'text-cyan-700' },
  ai:         { label: 'AI',   bg: 'bg-violet-50',  text: 'text-violet-700' },
}
const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  active:   { label: '启用',  bg: 'bg-green-50',  text: 'text-green-700' },
  inactive: { label: '停用',  bg: 'bg-gray-100',  text: 'text-gray-500' },
  testing:  { label: '测试中', bg: 'bg-yellow-50', text: 'text-yellow-700' },
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
    </svg>
  )
}

export default function RulesPage() {
  const { role } = useUser()
  const canEdit = role === 'super' || role === 'admin'

  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [allSites, setAllSites] = useState<SiteInfo[]>([])
  const [allCompetitorDomains, setAllCompetitorDomains] = useState<string[]>([])

  // Filters
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterQ, setFilterQ] = useState('')
  const [rulePage, setRulePage] = useState(0)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [siteQ, setSiteQ] = useState('')
  const [compQ, setCompQ] = useState('')

  // Tabs
  const [activeTab, setActiveTab] = useState<'rules' | 'ai'>('rules')

  // AI state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiOutput, setAiOutput] = useState('')
  const [proposedRule, setProposedRule] = useState<Partial<RuleForm> | null>(null)
  const [savingProposal, setSavingProposal] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/rules')
      .then(r => r.json())
      .then(d => setRules((d.rules ?? []).map((r: Rule) => ({ ...r, site_ids: r.site_ids ?? [], competitor_domains: r.competitor_domains ?? [] }))))
      .finally(() => setLoading(false))

    fetch('/api/sites')
      .then(r => r.json())
      .then(d => setAllSites((d.sites ?? []).map((s: SiteInfo) => ({ id: s.id, domain: s.domain, name: s.name }))))

    fetch('/api/task-groups')
      .then(r => r.json())
      .then(d => {
        const domains: string[] = []
        for (const g of (d.groups ?? [])) {
          for (const domain of (g.competitor_domains ?? [])) {
            if (!domains.includes(domain)) domains.push(domain)
          }
        }
        setAllCompetitorDomains(domains.sort())
      })
  }, [])

  const filtered = useMemo(() => rules.filter(r => {
    if (filterStatus && r.status !== filterStatus) return false
    if (filterType   && r.type   !== filterType)   return false
    if (filterSource && r.source !== filterSource)  return false
    if (filterStage  && !r.stage_applicability.includes(filterStage)) return false
    if (filterQ      && !r.name.toLowerCase().includes(filterQ.toLowerCase()) &&
                        !(r.description ?? '').toLowerCase().includes(filterQ.toLowerCase())) return false
    return true
  }), [rules, filterStatus, filterType, filterSource, filterStage, filterQ])

  const RULE_PAGE_SIZE = 20
  const ruleTotalPages = Math.max(1, Math.ceil(filtered.length / RULE_PAGE_SIZE))
  const pagedFiltered = filtered.slice(rulePage * RULE_PAGE_SIZE, (rulePage + 1) * RULE_PAGE_SIZE)
  useEffect(() => { setRulePage(0) }, [filterStatus, filterType, filterSource, filterStage, filterQ])

  function openNew() {
    setEditingRule(null); setForm(EMPTY_FORM); setSiteQ(''); setCompQ(''); setShowModal(true)
  }

  function openEdit(rule: Rule) {
    setEditingRule(rule)
    setForm({
      name: rule.name, type: rule.type, status: rule.status, source: rule.source,
      stage_applicability: rule.stage_applicability,
      description: rule.description ?? '',
      confidence: rule.confidence, success_count: rule.success_count,
      fail_count: rule.fail_count, priority: rule.priority,
      site_ids: rule.site_ids ?? [],
      competitor_domains: rule.competitor_domains ?? [],
    })
    setSiteQ(''); setCompQ(''); setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditingRule(null); setForm(EMPTY_FORM) }

  async function saveRule() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingRule) {
        const res = await fetch(`/api/rules/${editingRule.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          const { rule } = await res.json()
          setRules(prev => prev.map(r => r.id === rule.id ? { ...rule, site_ids: rule.site_ids ?? [], competitor_domains: rule.competitor_domains ?? [] } : r))
        }
      } else {
        const res = await fetch('/api/rules', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (res.ok) {
          const { rule } = await res.json()
          setRules(prev => [...prev, { ...rule, site_ids: rule.site_ids ?? [], competitor_domains: rule.competitor_domains ?? [] }])
        }
      }
      closeModal()
    } finally { setSaving(false) }
  }

  async function toggleStatus(rule: Rule) {
    const next = rule.status === 'active' ? 'inactive' : 'active'
    const res = await fetch(`/api/rules/${rule.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (res.ok) {
      const { rule: updated } = await res.json()
      setRules(prev => prev.map(r => r.id === updated.id ? { ...updated, site_ids: updated.site_ids ?? [], competitor_domains: updated.competitor_domains ?? [] } : r))
    }
  }

  async function deleteRule(rule: Rule) {
    if (!confirm(`确认删除 Rule #${rule.rule_number} "${rule.name}"？`)) return
    const res = await fetch(`/api/rules/${rule.id}`, { method: 'DELETE' })
    if (res.ok) setRules(prev => prev.filter(r => r.id !== rule.id))
  }

  function toggleStage(val: string) {
    setForm(prev => {
      const arr = prev.stage_applicability
      return { ...prev, stage_applicability: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })
  }

  function toggleSiteId(siteId: string) {
    setForm(prev => ({
      ...prev,
      site_ids: prev.site_ids.includes(siteId) ? prev.site_ids.filter(id => id !== siteId) : [...prev.site_ids, siteId],
    }))
  }

  function toggleCompDomain(domain: string) {
    setForm(prev => ({
      ...prev,
      competitor_domains: prev.competitor_domains.includes(domain) ? prev.competitor_domains.filter(d => d !== domain) : [...prev.competitor_domains, domain],
    }))
  }

  const successRate = (r: Rule) => {
    const total = r.success_count + r.fail_count
    return total > 0 ? Math.round(r.success_count / total * 100) : null
  }

  const filteredModalSites = siteQ.trim()
    ? allSites.filter(s => s.domain.includes(siteQ) || s.name.toLowerCase().includes(siteQ.toLowerCase()))
    : allSites
  const filteredModalComps = compQ.trim()
    ? allCompetitorDomains.filter(d => d.includes(compQ))
    : allCompetitorDomains

  const siteIdToDomain = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of allSites) m.set(s.id, s.domain)
    return m
  }, [allSites])

  async function runAiAnalysis() {
    if (!aiPrompt.trim() || aiLoading) return
    setAiLoading(true)
    setAiOutput('')
    setProposedRule(null)
    try {
      const res = await fetch('/api/rules/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        setAiOutput(`错误：${err.error ?? res.statusText}`)
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.text) { fullText += parsed.text; setAiOutput(fullText) }
          } catch { /* skip */ }
        }
      }
      const m = fullText.match(/```json\n([\s\S]*?)\n```/)
      if (m) {
        try { setProposedRule(JSON.parse(m[1])) } catch { /* invalid JSON */ }
      }
    } finally {
      setAiLoading(false)
    }
  }

  async function saveProposedRule() {
    if (!proposedRule || savingProposal) return
    setSavingProposal(true)
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...proposedRule, source: 'ai', priority: 0, success_count: 0, fail_count: 0 }),
      })
      if (res.ok) {
        const { rule } = await res.json()
        setRules(prev => [...prev, { ...rule, site_ids: rule.site_ids ?? [], competitor_domains: rule.competitor_domains ?? [] }])
        setProposedRule(null)
        setAiOutput(prev => prev.replace(/```json\n[\s\S]*?\n```/, '').trimEnd() + '\n\n✓ 规则已保存到全局规则库')
      }
    } finally {
      setSavingProposal(false)
    }
  }

  const aiDisplayText = proposedRule
    ? aiOutput.replace(/```json\n[\s\S]*?\n```/, '').trim()
    : aiOutput

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">规则中心</h1>
        <p className="text-sm text-gray-400 mt-0.5">全局实验室 — 创建规则并分配到各站点</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 mb-6">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === 'rules' ? 'text-green-600 border-green-500' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
        >
          全局规则库
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${activeTab === 'ai' ? 'text-violet-600 border-violet-500' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
        >
          <SparkleIcon className="w-3.5 h-3.5" />
          AI 新建规则
        </button>
      </div>

      {/* ── 全局规则库 tab ── */}
      {activeTab === 'rules' && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <input
              type="text" value={filterQ} onChange={e => setFilterQ(e.target.value)}
              placeholder="搜索规则名称或说明…"
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 w-44 text-gray-700"
            />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
              <option value="testing">测试中</option>
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
              <option value="">全部类型</option>
              <option value="add">新增</option>
              <option value="update">更新</option>
              <option value="mixed">混合</option>
            </select>
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
              <option value="">全部来源</option>
              <option value="manual">手动</option>
              <option value="experiment">实验</option>
              <option value="data">数据</option>
              <option value="ai">AI</option>
            </select>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 bg-white">
              <option value="">全部阶段</option>
              {STAGE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-gray-400 ml-1">{filtered.length} / {rules.length} 条</span>
            <div className="flex-1" />
            {canEdit && (
              <button onClick={openNew}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                新建规则
              </button>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label: '全部规则', value: rules.length, color: 'text-gray-800' },
              { label: '启用中', value: rules.filter(r => r.status === 'active').length, color: 'text-green-600' },
              { label: '测试中', value: rules.filter(r => r.status === 'testing').length, color: 'text-yellow-600' },
              { label: '停用', value: rules.filter(r => r.status === 'inactive').length, color: 'text-gray-400' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className={`text-2xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Rule list */}
          {loading ? <Spinner /> : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-sm">{rules.length === 0 ? '暂无规则，点击「新建规则」开始建立规则库' : '没有符合筛选条件的规则'}</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {pagedFiltered.map(rule => {
                  const sr = successRate(rule)
                  const total = rule.success_count + rule.fail_count
                  const tl = TYPE_LABELS[rule.type]
                  const sl = SOURCE_LABELS[rule.source]
                  const stl = STATUS_LABELS[rule.status]
                  const appliedSiteDomains = rule.site_ids.map(id => siteIdToDomain.get(id)).filter(Boolean) as string[]
                  return (
                    <div key={rule.id} className={`bg-white rounded-xl border transition-colors ${rule.status === 'inactive' ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                      <div className="px-4 py-3 flex items-start gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                          <span className="text-xs font-bold text-gray-500">#{rule.rule_number}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-800">{rule.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tl.bg} ${tl.text}`}>{tl.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${stl.bg} ${stl.text}`}>{stl.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sl.bg} ${sl.text}`}>{sl.label}</span>
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
                          {(appliedSiteDomains.length > 0 || rule.competitor_domains.length > 0) && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {appliedSiteDomains.slice(0, 4).map(d => (
                                <span key={d} className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">{d}</span>
                              ))}
                              {appliedSiteDomains.length > 4 && (
                                <span className="text-[10px] text-gray-400">+{appliedSiteDomains.length - 4} 站点</span>
                              )}
                              {rule.competitor_domains.slice(0, 3).map(d => (
                                <span key={d} className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-100">{d}</span>
                              ))}
                              {rule.competitor_domains.length > 3 && (
                                <span className="text-[10px] text-gray-400">+{rule.competitor_domains.length - 3} 竞品</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right space-y-1.5">
                          {(rule.tracked_success + rule.tracked_fail + rule.tracked_tracking) > 0 ? (() => {
                            const trackedTotal = rule.tracked_success + rule.tracked_fail + rule.tracked_tracking
                            const resolvedTotal = rule.tracked_success + rule.tracked_fail
                            const trackedRate = resolvedTotal > 0 ? Math.round(rule.tracked_success / resolvedTotal * 100) : null
                            return (
                              <div className="text-right">
                                {trackedRate !== null && (
                                  <div className="mb-0.5">
                                    <span className={`text-base font-bold ${trackedRate >= 70 ? 'text-green-600' : trackedRate >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{trackedRate}%</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 justify-end">
                                  <span className="text-[10px] text-green-600 font-medium">✓{rule.tracked_success}</span>
                                  <span className="text-[10px] text-red-400 font-medium">✗{rule.tracked_fail}</span>
                                  {rule.tracked_tracking > 0 && <span className="text-[10px] text-amber-500 font-medium">…{rule.tracked_tracking}</span>}
                                </div>
                                <p className="text-[10px] text-gray-400 mt-0.5">{trackedTotal} 条追踪</p>
                              </div>
                            )
                          })() : sr !== null ? (
                            <div>
                              <span className="text-base font-bold text-green-600">{sr}%</span>
                              <p className="text-[10px] text-gray-400">{total} 次验证</p>
                            </div>
                          ) : rule.confidence > 0 ? (
                            <div>
                              <span className="text-base font-bold text-gray-400">{rule.confidence}%</span>
                              <p className="text-[10px] text-gray-400">信心度</p>
                            </div>
                          ) : null}
                        </div>
                        {canEdit && (
                          <div className="flex-shrink-0 flex items-center gap-1 ml-1">
                            <button onClick={() => openEdit(rule)} title="编辑"
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onClick={() => toggleStatus(rule)} title={rule.status === 'active' ? '停用' : '启用'}
                              className={`p-1.5 rounded-lg transition-colors ${rule.status === 'active' ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 8v4m0 4h.01"/></svg>
                            </button>
                            {role === 'super' && (
                              <button onClick={() => deleteRule(rule)} title="删除"
                                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {ruleTotalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-xs text-gray-400">第 {rulePage * RULE_PAGE_SIZE + 1}–{Math.min((rulePage + 1) * RULE_PAGE_SIZE, filtered.length)} 条，共 {filtered.length} 条</span>
                  <div className="flex items-center gap-2">
                    <button disabled={rulePage === 0} onClick={() => setRulePage(p => p - 1)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">上一页</button>
                    <span className="text-xs text-gray-400 px-1">{rulePage + 1} / {ruleTotalPages}</span>
                    <button disabled={rulePage >= ruleTotalPages - 1} onClick={() => setRulePage(p => p + 1)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors">下一页</button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── AI 新建规则 tab ── */}
      {activeTab === 'ai' && (
        <div>
          {/* Rate limit notice */}
          <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <div>
              <p className="text-xs font-medium text-amber-800">Gemini 免费版限制</p>
              <p className="text-xs text-amber-700 mt-0.5">
                每分钟最多 <span className="font-semibold">15 次</span>请求 · 每天最多 <span className="font-semibold">500 次</span>请求（gemini-3.1-flash-lite 免费套餐）
              </p>
            </div>
          </div>

          {/* Prompt input */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <label className="block text-sm font-semibold text-gray-800 mb-2">描述你想建立的规则</label>
            <textarea
              value={aiPrompt}
              onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAiAnalysis() }}
              rows={4}
              disabled={aiLoading}
              placeholder="例如：针对权重与竞品相对一样或较低的词，通过新增内容来抢排名。请分析我们目前有没有相关数据可以支撑这条规则…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-gray-400">AI 会检查现有数据是否充足，数据不足时会说明需要哪些 cron 任务（可联系开发者添加）</p>
              <button
                onClick={runAiAnalysis}
                disabled={aiLoading || !aiPrompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 text-white text-sm font-medium rounded-lg hover:bg-violet-600 disabled:opacity-50 transition-colors ml-3 flex-shrink-0"
              >
                {aiLoading
                  ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <SparkleIcon className="w-3.5 h-3.5" />
                }
                {aiLoading ? '分析中…' : 'AI 分析'}
              </button>
            </div>
          </div>

          {/* AI Output */}
          {aiOutput && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <SparkleIcon className="w-4 h-4 text-violet-500" />
                <p className="text-sm font-semibold text-gray-800">分析结果</p>
                {aiLoading
                  ? <div className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin ml-1" />
                  : <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">完成</span>
                }
              </div>

              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {aiDisplayText}
              </div>

              {/* Rule proposal card */}
              {proposedRule && !aiLoading && (
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="text-xs font-medium text-gray-500 mb-3">AI 建议的规则</p>
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{proposedRule.name}</p>
                        {proposedRule.description && (
                          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{proposedRule.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {proposedRule.type && TYPE_LABELS[proposedRule.type] && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TYPE_LABELS[proposedRule.type].bg} ${TYPE_LABELS[proposedRule.type].text}`}>
                              {TYPE_LABELS[proposedRule.type].label}
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-700">AI 来源</span>
                          {proposedRule.status && STATUS_LABELS[proposedRule.status] && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${STATUS_LABELS[proposedRule.status].bg} ${STATUS_LABELS[proposedRule.status].text}`}>
                              {STATUS_LABELS[proposedRule.status].label}
                            </span>
                          )}
                          {(proposedRule.stage_applicability ?? []).map(s => (
                            <span key={s} className="text-[10px] bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">{s}</span>
                          ))}
                          {proposedRule.confidence != null && (
                            <span className="text-[10px] text-gray-500">信心度 {proposedRule.confidence}%</span>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <button
                          onClick={saveProposedRule}
                          disabled={savingProposal}
                          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-violet-500 text-white text-xs font-medium rounded-lg hover:bg-violet-600 disabled:opacity-50 transition-colors"
                        >
                          {savingProposal ? '保存中…' : '保存为规则'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[92vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-gray-800">{editingRule ? `编辑规则 #${editingRule.rule_number}` : '新建规则'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-y-auto">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">规则名称 *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  autoFocus placeholder="简短描述这条规则的核心逻辑"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
              </div>
              {/* Type + Status + Source */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">类型</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as RuleForm['type'] }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700">
                    <option value="add">新增</option>
                    <option value="update">更新</option>
                    <option value="mixed">混合</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">状态</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as RuleForm['status'] }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700">
                    <option value="active">启用</option>
                    <option value="testing">测试中</option>
                    <option value="inactive">停用</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">来源</label>
                  <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value as RuleForm['source'] }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700">
                    <option value="manual">手动</option>
                    <option value="experiment">实验</option>
                    <option value="data">数据</option>
                    <option value="ai">AI</option>
                  </select>
                </div>
              </div>
              {/* Stage */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">适用阶段</label>
                <div className="flex gap-2 flex-wrap">
                  {STAGE_TYPES.map(s => (
                    <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={form.stage_applicability.includes(s)}
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
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="描述触发条件、执行动作、预期效果…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700 resize-none" />
              </div>
              {/* Numbers */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">信心度 %</label>
                  <input type="number" min={0} max={100} value={form.confidence}
                    onChange={e => setForm(p => ({ ...p, confidence: Number(e.target.value) }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">历史成功</label>
                  <input type="number" min={0} value={form.success_count}
                    onChange={e => setForm(p => ({ ...p, success_count: Number(e.target.value) }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">历史失败</label>
                  <input type="number" min={0} value={form.fail_count}
                    onChange={e => setForm(p => ({ ...p, fail_count: Number(e.target.value) }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-400 text-gray-700" />
                </div>
              </div>

              {/* Apply to own sites */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  应用到自有站点
                  {form.site_ids.length > 0 && <span className="ml-2 text-indigo-500 font-normal">已选 {form.site_ids.length} 个</span>}
                </label>
                <input
                  type="text" value={siteQ} onChange={e => setSiteQ(e.target.value)}
                  placeholder="搜索站点…"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-700"
                />
                <div className="max-h-36 overflow-y-auto border border-gray-100 rounded-lg bg-gray-50 p-2 space-y-1">
                  {filteredModalSites.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">无匹配站点</p>
                  ) : filteredModalSites.map(s => (
                    <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-white px-2 py-1 rounded transition-colors">
                      <input type="checkbox"
                        checked={form.site_ids.includes(s.id)}
                        onChange={() => toggleSiteId(s.id)}
                        className="rounded border-gray-300 text-indigo-500 focus:ring-indigo-300 flex-shrink-0" />
                      <span className="text-sm text-gray-700 truncate">{s.domain}</span>
                      {s.name && <span className="text-xs text-gray-400 truncate">{s.name}</span>}
                    </label>
                  ))}
                </div>
              </div>

              {/* Apply to competitors */}
              {allCompetitorDomains.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    应用到竞品
                    {form.competitor_domains.length > 0 && <span className="ml-2 text-orange-500 font-normal">已选 {form.competitor_domains.length} 个</span>}
                  </label>
                  {allCompetitorDomains.length > 6 && (
                    <input
                      type="text" value={compQ} onChange={e => setCompQ(e.target.value)}
                      placeholder="搜索竞品…"
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 mb-2 focus:outline-none focus:ring-2 focus:ring-orange-200 text-gray-700"
                    />
                  )}
                  <div className="max-h-28 overflow-y-auto border border-gray-100 rounded-lg bg-gray-50 p-2 space-y-1">
                    {filteredModalComps.map(d => (
                      <label key={d} className="flex items-center gap-2 cursor-pointer hover:bg-white px-2 py-1 rounded transition-colors">
                        <input type="checkbox"
                          checked={form.competitor_domains.includes(d)}
                          onChange={() => toggleCompDomain(d)}
                          className="rounded border-gray-300 text-orange-500 focus:ring-orange-300 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{d}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 flex-shrink-0">
              <button onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">取消</button>
              <button onClick={saveRule} disabled={saving || !form.name.trim()}
                className="px-4 py-2 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
                {saving ? '保存中…' : editingRule ? '保存修改' : '创建规则'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
