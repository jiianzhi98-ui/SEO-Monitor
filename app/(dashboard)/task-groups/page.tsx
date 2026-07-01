'use client'

import { useEffect, useState, useMemo } from 'react'
import { useUser } from '@/lib/user-context'

interface TaskMember { user_id: string; username: string; member_type?: 'app' | 'game' | 'both' }
interface TaskGroup {
  id: string
  name: string
  type: 'game' | 'app' | 'both'
  created_at: string
  members: TaskMember[]
}

interface UserOption { id: string; email: string; username: string | null; role: string }

interface StreakEntry { keyword: string; streak: number; domain: string; volume: number; first_seen: string; last_seen: string }
interface RankEntry { keyword: string; siteCount: number; volume: number; sites: string[] }
interface WordEntry { keyword: string; count: number; siteCount: number; sites: string[] }
interface RadarData { newWords: WordEntry[]; rankWords: RankEntry[]; streakWords: StreakEntry[] }

interface SiteRow { domain: string; source_types: string | null }

const TYPE_LABELS: Record<string, string> = { game: '游戏', app: '应用', both: '应用/游戏' }
const TYPE_COLORS: Record<string, string> = {
  game: 'bg-purple-50 text-purple-600',
  app: 'bg-blue-50 text-blue-600',
  both: 'bg-gray-100 text-gray-500',
}

function fmtVolume(v: number): string {
  if (v <= 0) return '—'
  return v.toLocaleString()
}

function CopyButton({ keywords }: { keywords: string[] }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(keywords.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={copy}
      className={`text-xs px-2.5 py-1 rounded font-medium transition-all ${copied ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
    >
      {copied ? '已复制 ✓' : `复制 (${keywords.length})`}
    </button>
  )
}

function KeywordSection({
  title,
  keywords,
  renderRow,
}: {
  title: string
  keywords: unknown[]
  renderRow: (w: unknown, i: number) => React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? keywords : keywords.slice(0, 20)
  if (keywords.length === 0) return null
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-sm font-semibold text-gray-700">{title}</span>
        <span className="text-xs text-gray-400">{keywords.length} 条</span>
      </div>
      <div className="border border-gray-100 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {(visible as unknown[]).map((w, i) => renderRow(w, i))}
          </tbody>
        </table>
        {keywords.length > 20 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-100"
          >
            {expanded ? '收起' : `展开全部 ${keywords.length} 条`}
          </button>
        )}
      </div>
    </div>
  )
}

export default function TaskGroupsPage() {
  const { role, id: currentUserId } = useUser()
  const canManage = role === 'super' || role === 'admin'

  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)

  const [radarData, setRadarData] = useState<RadarData | null>(null)
  const [siteRows, setSiteRows] = useState<SiteRow[]>([])

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [memberTypes, setMemberTypes] = useState<Record<string, 'app' | 'game'>>({})
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [editName, setEditName] = useState('')
  const [editMemberTypes, setEditMemberTypes] = useState<Record<string, 'app' | 'game'>>({})
  const [editSelectedUsers, setEditSelectedUsers] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  async function loadGroups() {
    setLoading(true)
    try {
      const res = await fetch('/api/task-groups')
      const data = await res.json()
      const list: TaskGroup[] = data.groups || []
      setGroups(list)
      if (list.length > 0 && !activeGroupId) setActiveGroupId(list[0].id)
    } finally {
      setLoading(false)
    }
  }

  async function loadRadar() {
    const [radarRes, sitesRes] = await Promise.all([
      fetch('/api/hot-radar'),
      fetch('/api/sites'),
    ])
    const [rd, sd] = await Promise.all([radarRes.json(), sitesRes.json()])
    setRadarData(rd)
    setSiteRows((sd.sites || []) as SiteRow[])
  }

  async function openCreateModal() {
    setShowCreate(true)
    setCreateName('')
    setSelectedUsers(new Set())
    setMemberTypes({})
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUserOptions((data.users || []).filter((u: UserOption) => u.role !== 'super'))
  }

  async function handleCreate() {
    if (selectedUsers.size === 0) return
    setCreating(true)
    try {
      const members = userOptions
        .filter(u => selectedUsers.has(u.id))
        .map(u => ({ user_id: u.id, username: u.username || u.email.split('@')[0], member_type: memberTypes[u.id] || 'app' }))
      const autoName = members.map(m => m.username).join(' · ')
      const res = await fetch('/api/task-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim() || autoName, type: 'both', members }),
      })
      if (res.ok) {
        setShowCreate(false)
        await loadGroups()
      }
    } finally {
      setCreating(false)
    }
  }

  async function openEditModal() {
    if (!activeGroup) return
    setEditName(activeGroup.name)
    setEditSelectedUsers(new Set(activeGroup.members.map(m => m.user_id)))
    const types: Record<string, 'app' | 'game'> = {}
    for (const m of activeGroup.members) {
      types[m.user_id] = (m.member_type === 'game' ? 'game' : 'app')
    }
    setEditMemberTypes(types)
    setShowEdit(true)
    if (userOptions.length === 0) {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      setUserOptions((data.users || []).filter((u: UserOption) => u.role !== 'super'))
    }
  }

  async function handleEdit() {
    if (!activeGroup || editSelectedUsers.size === 0) return
    setSaving(true)
    try {
      const members = userOptions
        .filter(u => editSelectedUsers.has(u.id))
        .map(u => ({ user_id: u.id, username: u.username || u.email.split('@')[0], member_type: editMemberTypes[u.id] || 'app' }))
      const autoName = members.map(m => m.username).join(' · ')
      const res = await fetch(`/api/task-groups/${activeGroup.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() || autoName, members }),
      })
      if (res.ok) {
        setShowEdit(false)
        await loadGroups()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/task-groups/${id}`, { method: 'DELETE' })
    if (res.ok) {
      const remaining = groups.filter(g => g.id !== id)
      setGroups(remaining)
      if (activeGroupId === id) setActiveGroupId(remaining[0]?.id ?? null)
    }
    setDeleteId(null)
  }

  useEffect(() => {
    loadGroups()
    loadRadar()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Domain → source types set
  const domainTypeMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of siteRows) {
      const types = (s.source_types || '').split(/[\n|,]/).map(t => t.trim().toLowerCase()).filter(Boolean)
      map.set(s.domain, new Set(types))
    }
    return map
  }, [siteRows])

  function matchesType(domain: string, groupType: string): boolean {
    if (groupType === 'both') return true
    const types = domainTypeMap.get(domain)
    if (!types) return false
    return types.has(groupType)
  }

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? null

  const filteredData = useMemo(() => {
    if (!radarData || !activeGroup) return null
    const t = activeGroup.type

    const streakWords = radarData.streakWords.filter(w => matchesType(w.domain, t))

    const rankWords = radarData.rankWords
      .map(w => ({ ...w, sites: w.sites.filter(d => matchesType(d, t)) }))
      .filter(w => w.sites.length > 0)

    const newWords = radarData.newWords
      .map(w => ({ ...w, sites: w.sites.filter(d => matchesType(d, t)) }))
      .filter(w => w.sites.length > 0)

    return { streakWords, rankWords, newWords }
  }, [radarData, activeGroup, domainTypeMap])  // eslint-disable-line react-hooks/exhaustive-deps

  const allKeywords = useMemo(() => {
    if (!filteredData) return []
    const seen = new Set<string>()
    const result: string[] = []
    for (const w of [...filteredData.streakWords, ...filteredData.rankWords, ...filteredData.newWords]) {
      if (!seen.has(w.keyword)) { seen.add(w.keyword); result.push(w.keyword) }
    }
    return result
  }, [filteredData])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center py-24 text-gray-400 gap-3">
        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        加载中...
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">分组任务</h1>
          <p className="text-gray-400 text-sm mt-0.5">按团队分发热词雷达关键词</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {activeGroup && (
              <button onClick={openEditModal} className="btn-ghost">
                编辑分组
              </button>
            )}
            <button onClick={openCreateModal} className="btn-primary">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新增分组
            </button>
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-10 h-10 mb-3 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm">{canManage ? '还没有分组，点击右上角新增' : '你尚未加入任何分组'}</p>
        </div>
      ) : (
        <div className="card">
          {/* Group tabs */}
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-0 border-b border-gray-100 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => setActiveGroupId(g.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap border-b-2 transition-colors ${
                  activeGroupId === g.id
                    ? 'border-green-500 text-green-700 bg-green-50/60'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{g.name}</span>
              </button>
            ))}
          </div>

          {/* Group content */}
          {activeGroup && (
            <div className="p-4">
              {/* Group meta */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 flex-wrap">
                  {activeGroup.members.map(m => (
                    <span key={m.user_id} className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-600 rounded-full px-2.5 py-1">
                      {m.username || '—'}
                      {m.member_type && m.member_type !== 'both' && (
                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${m.member_type === 'app' ? 'bg-blue-100 text-blue-600' : 'bg-purple-100 text-purple-600'}`}>
                          {m.member_type === 'app' ? '应用' : '游戏'}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <CopyButton keywords={allKeywords} />
                  {canManage && (
                    <button
                      onClick={() => setDeleteId(activeGroup.id)}
                      className="text-xs text-red-400 hover:text-red-600 border border-red-100 rounded px-2 py-1 hover:border-red-200 transition-colors"
                    >
                      删除分组
                    </button>
                  )}
                </div>
              </div>

              {/* Keyword sections */}
              {!filteredData ? (
                <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-sm">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  加载词库中...
                </div>
              ) : (
                <>
                  <KeywordSection
                    title="连续上涨词"
                    keywords={filteredData.streakWords}
                    renderRow={(w, i) => {
                      const s = w as StreakEntry
                      return (
                        <tr key={`${s.domain}|${s.keyword}|${i}`} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-900 w-64">{s.keyword}</td>
                          <td className="px-2 py-1.5 text-gray-400 text-xs">{s.domain}</td>
                          <td className="px-2 py-1.5 text-center text-xs">
                            <span className="text-orange-500 font-semibold">{s.streak}</span>
                            <span className="text-gray-400"> 天</span>
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs text-gray-500 pr-3">{fmtVolume(s.volume)}</td>
                        </tr>
                      )
                    }}
                  />

                  <KeywordSection
                    title="竞品涨排名"
                    keywords={filteredData.rankWords}
                    renderRow={(w, i) => {
                      const r = w as RankEntry
                      return (
                        <tr key={`${r.keyword}|${i}`} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-900 w-64">{r.keyword}</td>
                          <td className="px-2 py-1.5 text-gray-400 text-xs">{r.sites.slice(0, 3).join(', ')}{r.sites.length > 3 ? ` +${r.sites.length - 3}` : ''}</td>
                          <td className="px-2 py-1.5 text-center text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">{r.siteCount}</span> 站
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs text-gray-500 pr-3">{fmtVolume(r.volume)}</td>
                        </tr>
                      )
                    }}
                  />

                  <KeywordSection
                    title="共新增词"
                    keywords={filteredData.newWords}
                    renderRow={(w, i) => {
                      const n = w as WordEntry
                      return (
                        <tr key={`${n.keyword}|${i}`} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-medium text-gray-900 w-64">{n.keyword}</td>
                          <td className="px-2 py-1.5 text-gray-400 text-xs">{n.sites.slice(0, 3).join(', ')}{n.sites.length > 3 ? ` +${n.sites.length - 3}` : ''}</td>
                          <td className="px-2 py-1.5 text-center text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">{n.siteCount}</span> 站
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs text-gray-500 pr-3">{n.count} 次</td>
                        </tr>
                      )
                    }}
                  />

                  {filteredData.streakWords.length === 0 && filteredData.rankWords.length === 0 && filteredData.newWords.length === 0 && (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      暂无 {TYPE_LABELS[activeGroup.type]} 类型相关词
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      {showEdit && activeGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">编辑分组</h3>
              <button onClick={() => setShowEdit(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分组名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="留空则自动使用成员名称"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  组员
                  {editSelectedUsers.size > 0 && <span className="ml-1.5 text-green-600">（已选 {editSelectedUsers.size} 人）</span>}
                </label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {userOptions.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-400">加载中...</div>
                  ) : (
                    userOptions.map(u => {
                      const isSelected = editSelectedUsers.has(u.id)
                      const mType = editMemberTypes[u.id] || 'app'
                      return (
                        <div key={u.id} className={`px-3 py-2.5 transition-colors ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                const next = new Set(editSelectedUsers)
                                const nextTypes = { ...editMemberTypes }
                                if (e.target.checked) {
                                  next.add(u.id)
                                  nextTypes[u.id] = nextTypes[u.id] || 'app'
                                } else {
                                  next.delete(u.id)
                                  delete nextTypes[u.id]
                                }
                                setEditSelectedUsers(next)
                                setEditMemberTypes(nextTypes)
                              }}
                              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900">{u.username || u.email.split('@')[0]}</span>
                              <span className="ml-1.5 text-xs text-gray-400">{u.email}</span>
                            </div>
                            {isSelected && (
                              <div className="flex gap-1 flex-shrink-0">
                                {(['app', 'game'] as const).map(t => (
                                  <button
                                    key={t}
                                    onClick={e => { e.preventDefault(); setEditMemberTypes(prev => ({ ...prev, [u.id]: t })) }}
                                    className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                                      mType === t
                                        ? t === 'app'
                                          ? 'bg-blue-500 text-white border-blue-500'
                                          : 'bg-purple-500 text-white border-purple-500'
                                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                    }`}
                                  >
                                    {t === 'app' ? '应用' : '游戏'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setShowEdit(false)} className="btn-ghost">取消</button>
              <button
                onClick={handleEdit}
                disabled={saving || editSelectedUsers.size === 0}
                className="btn-primary disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-5">删除后无法恢复，分组内的成员和设置都会清除。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="btn-ghost">取消</button>
              <button onClick={() => handleDelete(deleteId)} className="btn-danger">确认删除</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-900">新增分组</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分组名称</label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder={
                    selectedUsers.size > 0
                      ? userOptions.filter(u => selectedUsers.has(u.id)).map(u => u.username || u.email.split('@')[0]).join(' · ')
                      : '留空则自动使用成员名称'
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Members */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  组员
                  {selectedUsers.size > 0 && <span className="ml-1.5 text-green-600">（已选 {selectedUsers.size} 人）</span>}
                </label>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {userOptions.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-400">加载中...</div>
                  ) : (
                    userOptions.map(u => {
                      const isSelected = selectedUsers.has(u.id)
                      const mType = memberTypes[u.id] || 'app'
                      return (
                        <div key={u.id} className={`px-3 py-2.5 transition-colors ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                const next = new Set(selectedUsers)
                                const nextTypes = { ...memberTypes }
                                if (e.target.checked) {
                                  next.add(u.id)
                                  nextTypes[u.id] = 'app'
                                } else {
                                  next.delete(u.id)
                                  delete nextTypes[u.id]
                                }
                                setSelectedUsers(next)
                                setMemberTypes(nextTypes)
                              }}
                              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900">{u.username || u.email.split('@')[0]}</span>
                              <span className="ml-1.5 text-xs text-gray-400">{u.email}</span>
                            </div>
                            {isSelected && (
                              <div className="flex gap-1 flex-shrink-0">
                                {(['app', 'game'] as const).map(t => (
                                  <button
                                    key={t}
                                    onClick={e => { e.preventDefault(); setMemberTypes(prev => ({ ...prev, [u.id]: t })) }}
                                    className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                                      mType === t
                                        ? t === 'app'
                                          ? 'bg-blue-500 text-white border-blue-500'
                                          : 'bg-purple-500 text-white border-purple-500'
                                        : 'border-gray-200 text-gray-400 hover:border-gray-300'
                                    }`}
                                  >
                                    {t === 'app' ? '应用' : '游戏'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setShowCreate(false)} className="btn-ghost">取消</button>
              <button
                onClick={handleCreate}
                disabled={creating || selectedUsers.size === 0}
                className="btn-primary disabled:opacity-50"
              >
                {creating ? '创建中...' : '创建分组'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
