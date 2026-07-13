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

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editingRule, setEditingRule] = useState<Rule | null>(null)
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [siteQ, setSiteQ] = useState('')
  const [compQ, setCompQ] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/rules')
      .then(r => r.json())
      .then(d => setRules((d.rules ?? []).map((r: Rule) => ({ ...r, site_ids: r.site_ids ?? [], competitor_domains: r.competitor_domains ?? [] }))))
      .finally(() => setLoading(false))

    // Load sites and competitor domains in parallel
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

  // Build a siteId → domain lookup for displaying badges
  const siteIdToDomain = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of allSites) m.set(s.id, s.domain)
    return m
  }, [allSites])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">规则中心</h1>
        <p className="text-sm text-gray-400 mt-0.5">全局实验室 — 创建规则并分配到各站点</p>
      </div>

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
        <div className="space-y-2">
          {filtered.map(rule => {
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
                    {/* Applied sites + competitor badges */}
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
                  <div className="flex-shrink-0 text-right space-y-1">
                    {sr !== null ? (
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
