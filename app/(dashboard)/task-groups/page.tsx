'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useUser } from '@/lib/user-context'
import { getBrowserClient } from '@/lib/supabase-browser'

interface TaskMember { user_id: string; username: string; member_type?: 'app' | 'game' | 'both' }
interface TaskGroup { id: string; name: string; type: string; created_at: string; members: TaskMember[] }
interface UserOption { id: string; email: string; username: string | null; role: string }
interface SiteRow { domain: string; source_types: string | null }

interface NewWord { keyword: string; count: number; siteCount: number; sites: string[]; last_date: string; first_date: string }
interface RankWord { keyword: string; siteCount: number; volume: number; sites: string[]; last_date: string; first_date: string; rankDays: number }
interface StreakWord { keyword: string; streak: number; domain: string; volume: number; first_date: string; last_date: string }

interface ClaimedKeyword {
  id: string
  keyword: string
  keyword_type: 'app' | 'game'
  source: string
  search_volume: number
  status: string
  created_at: string
}

type RightTab = 'latest' | 'search' | 'competitor' | 'shared'
type CompetitorSubTab = 'rank' | 'streak'
type SharedSubTab = 'newWords' | 'wordLib'

function getMYDate() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function fmtVol(v: number): string {
  if (!v || v <= 0) return '—'
  if (v >= 10000) return (v / 10000).toFixed(1) + 'w'
  return v.toLocaleString()
}

function SourceTag({ s }: { s: string }) {
  const map: Record<string, string> = { '竞品涨排名': '竞品', '连续上涨词': '连涨', '共新增词': '新增', '搜索量查询': '搜索', '最新词库': '最新', '更新词库': '词库' }
  return <span className="text-[10px] text-gray-300">{map[s] ?? s}</span>
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10 text-gray-400 gap-2 text-sm">
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      加载中...
    </div>
  )
}

export default function TaskGroupsPage() {
  const { role, id: currentUserId } = useUser()
  const canManage = role === 'super' || role === 'admin'
  const today = getMYDate()

  const [groups, setGroups] = useState<TaskGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)

  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null)
  const [claimedKeywords, setClaimedKeywords] = useState<ClaimedKeyword[]>([])
  const [claimedLoading, setClaimedLoading] = useState(false)
  const [activeCompletionType, setActiveCompletionType] = useState<'app' | 'game'>('app')
  const [submitting, setSubmitting] = useState(false)

  const [rightTab, setRightTab] = useState<RightTab>('latest')
  const [competitorSubTab, setCompetitorSubTab] = useState<CompetitorSubTab>('rank')
  const [sharedSubTab, setSharedSubTab] = useState<SharedSubTab>('newWords')
  const [sharedTypeFilter, setSharedTypeFilter] = useState<'app' | 'game'>('app')
  const [radarData, setRadarData] = useState<{ newWords: NewWord[]; rankWords: RankWord[]; streakWords: StreakWord[] } | null>(null)
  const [radarLoaded, setRadarLoaded] = useState(false)
  const [radarLoading, setRadarLoading] = useState(false)
  const [siteRows, setSiteRows] = useState<SiteRow[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ keyword: string; volume: number }[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchPage, setSearchPage] = useState(0)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const activeGroup = groups.find(g => g.id === activeGroupId) ?? null
  const effectiveViewingId = viewingMemberId || currentUserId || ''
  const viewingMember = activeGroup?.members.find(m => m.user_id === effectiveViewingId) ?? null
  const viewingMemberType: 'app' | 'game' = viewingMember?.member_type === 'game' ? 'game' : 'app'
  const isViewingOwn = effectiveViewingId === currentUserId

  const domainTypeMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const s of siteRows) {
      const types = (s.source_types || '').split(/[\n|,]/).map(t => t.trim().toLowerCase()).filter(Boolean)
      map.set(s.domain, new Set(types))
    }
    return map
  }, [siteRows])

  function matchesDomainType(domain: string, type: 'app' | 'game'): boolean {
    const types = domainTypeMap.get(domain)
    return types ? types.has(type) : false
  }

  const claimedSet = useMemo(() => new Set(claimedKeywords.map(k => k.keyword)), [claimedKeywords])
  const appKeywords = claimedKeywords.filter(k => k.keyword_type === 'app')
  const gameKeywords = claimedKeywords.filter(k => k.keyword_type === 'game')
  const pendingCount = claimedKeywords.filter(k => k.status === 'pending').length
  const activeCompletionKeywords = activeCompletionType === 'app' ? appKeywords : gameKeywords
  const completionTabs: Array<'app' | 'game'> = viewingMemberType === 'game' ? ['game', 'app'] : ['app', 'game']

  const latestKeywords = useMemo(() => {
    if (!radarData) return []
    const seen = new Set<string>()
    const result: { keyword: string; volume: number; source: string }[] = []
    for (const w of radarData.rankWords) {
      if (w.last_date === today && !seen.has(w.keyword)) {
        seen.add(w.keyword); result.push({ keyword: w.keyword, volume: w.volume, source: '竞品涨排名' })
      }
    }
    for (const w of radarData.streakWords) {
      if (w.last_date === today && !seen.has(w.keyword)) {
        seen.add(w.keyword); result.push({ keyword: w.keyword, volume: w.volume, source: '连续上涨词' })
      }
    }
    for (const w of radarData.newWords) {
      if (w.last_date === today && !seen.has(w.keyword)) {
        seen.add(w.keyword); result.push({ keyword: w.keyword, volume: 0, source: '共新增词' })
      }
    }
    return result
  }, [radarData, today])

  const sharedWords = useMemo(() => {
    if (!radarData) return []
    return radarData.newWords
      .filter(w => sharedSubTab === 'wordLib' ? w.last_date !== today : w.last_date === today)
      .filter(w => w.sites.some(d => matchesDomainType(d, sharedTypeFilter)))
  }, [radarData, sharedSubTab, sharedTypeFilter, domainTypeMap, today]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadGroups() {
    setLoading(true)
    try {
      const res = await fetch('/api/task-groups')
      const data = await res.json()
      const list: TaskGroup[] = data.groups || []
      setGroups(list)
      if (list.length > 0 && !activeGroupId) setActiveGroupId(list[0].id)
    } finally { setLoading(false) }
  }

  async function loadClaimedKeywords(groupId: string, userId: string) {
    setClaimedLoading(true)
    try {
      const res = await fetch(`/api/task-groups/${groupId}/claimed?userId=${userId}&date=${today}`)
      const data = await res.json()
      setClaimedKeywords(data.keywords || [])
    } finally { setClaimedLoading(false) }
  }

  async function loadRadar() {
    if (radarLoaded || radarLoading) return
    setRadarLoading(true)
    try {
      const [radarRes, sitesRes] = await Promise.all([fetch('/api/hot-radar'), fetch('/api/sites')])
      const [rd, sd] = await Promise.all([radarRes.json(), sitesRes.json()])
      setRadarData(rd)
      setSiteRows((sd.sites || []) as SiteRow[])
      setRadarLoaded(true)
    } finally { setRadarLoading(false) }
  }

  async function claimKeyword(keyword: string, keyword_type: 'app' | 'game', source: string, search_volume = 0) {
    if (!activeGroupId || claimedSet.has(keyword)) return
    const res = await fetch(`/api/task-groups/${activeGroupId}/claimed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, keyword_type, source, search_volume }),
    })
    if (res.status === 409) return
    if (res.ok) {
      const data = await res.json()
      setClaimedKeywords(prev => [...prev, data.keyword])
      setActiveCompletionType(keyword_type)
    }
  }

  async function dismissClaimed(claimId: string) {
    if (!activeGroupId) return
    setClaimedKeywords(prev => prev.filter(k => k.id !== claimId))
    await fetch(`/api/task-groups/${activeGroupId}/claimed`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claimId, status: 'dismissed' }),
    })
  }

  async function submitToday() {
    if (!activeGroupId || submitting || pendingCount === 0) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/task-groups/${activeGroupId}/claimed`, { method: 'PUT' })
      if (res.ok) {
        setClaimedKeywords(prev => prev.map(k => k.status === 'pending' ? { ...k, status: 'submitted' } : k))
      }
    } finally { setSubmitting(false) }
  }

  async function doSearch(q: string, page = 0) {
    if (!q.trim()) { setSearchResults([]); setSearchTotal(0); return }
    setSearchLoading(true)
    try {
      const res = await fetch(`/api/keyword-volume?q=${encodeURIComponent(q)}&page=${page}`)
      const data = await res.json()
      setSearchResults(data.keywords || [])
      setSearchTotal(data.total || 0)
      setSearchPage(page)
    } finally { setSearchLoading(false) }
  }

  useEffect(() => { loadGroups() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeGroupId && effectiveViewingId) loadClaimedKeywords(activeGroupId, effectiveViewingId)
  }, [activeGroupId, effectiveViewingId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: subscribe to claimed keyword changes for the active group
  useEffect(() => {
    if (!activeGroupId) return
    const supabase = getBrowserClient()
    const channelName = `claimed-${activeGroupId}`

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'member_claimed_keywords', filter: `group_id=eq.${activeGroupId}` },
        (payload) => {
          // Only apply changes that belong to the member we're viewing
          const rec = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as ClaimedKeyword & { user_id: string; claimed_date: string }
          if (!rec || rec.user_id !== effectiveViewingId || rec.claimed_date !== today) return

          if (payload.eventType === 'INSERT') {
            if (rec.status !== 'dismissed') {
              setClaimedKeywords(prev => prev.some(k => k.id === rec.id) ? prev : [...prev, rec])
            }
          } else if (payload.eventType === 'UPDATE') {
            if (rec.status === 'dismissed') {
              setClaimedKeywords(prev => prev.filter(k => k.id !== rec.id))
            } else {
              setClaimedKeywords(prev => prev.map(k => k.id === rec.id ? { ...k, status: rec.status } : k))
            }
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string }
            setClaimedKeywords(prev => prev.filter(k => k.id !== old.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeGroupId, effectiveViewingId, today]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentUserId && !viewingMemberId) setViewingMemberId(currentUserId)
  }, [currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setActiveCompletionType(viewingMemberType)
  }, [viewingMemberType])

  useEffect(() => {
    if (rightTab !== 'search') loadRadar()
  }, [rightTab]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rightTab === 'shared') setSharedTypeFilter(viewingMemberType)
  }, [rightTab, viewingMemberType])

  async function openCreateModal() {
    setShowCreate(true); setCreateName(''); setSelectedUsers(new Set()); setMemberTypes({})
    const res = await fetch('/api/admin/users')
    const data = await res.json()
    setUserOptions((data.users || []).filter((u: UserOption) => u.role !== 'super'))
  }

  async function handleCreate() {
    if (selectedUsers.size === 0) return
    setCreating(true)
    try {
      const members = userOptions.filter(u => selectedUsers.has(u.id))
        .map(u => ({ user_id: u.id, username: u.username || u.email.split('@')[0], member_type: memberTypes[u.id] || 'app' }))
      const res = await fetch('/api/task-groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName.trim() || members.map(m => m.username).join(' · '), type: 'both', members }),
      })
      if (res.ok) { setShowCreate(false); await loadGroups() }
    } finally { setCreating(false) }
  }

  async function openEditModal() {
    if (!activeGroup) return
    setEditName(activeGroup.name)
    setEditSelectedUsers(new Set(activeGroup.members.map(m => m.user_id)))
    const types: Record<string, 'app' | 'game'> = {}
    for (const m of activeGroup.members) types[m.user_id] = m.member_type === 'game' ? 'game' : 'app'
    setEditMemberTypes(types); setShowEdit(true)
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
      const members = userOptions.filter(u => editSelectedUsers.has(u.id))
        .map(u => ({ user_id: u.id, username: u.username || u.email.split('@')[0], member_type: editMemberTypes[u.id] || 'app' }))
      const res = await fetch(`/api/task-groups/${activeGroup.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() || members.map(m => m.username).join(' · '), members }),
      })
      if (res.ok) { setShowEdit(false); await loadGroups() }
    } finally { setSaving(false) }
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

  function MemberModal({ mode, onClose }: { mode: 'create' | 'edit'; onClose: () => void }) {
    const isCreate = mode === 'create'
    const selUsers = isCreate ? selectedUsers : editSelectedUsers
    const setSelUsers = isCreate ? setSelectedUsers : setEditSelectedUsers
    const mTypes = isCreate ? memberTypes : editMemberTypes
    const setMTypes = isCreate ? setMemberTypes : setEditMemberTypes
    const name = isCreate ? createName : editName
    const setName = isCreate ? setCreateName : setEditName
    const onSubmit = isCreate ? handleCreate : handleEdit
    const busy = isCreate ? creating : saving

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
            <h3 className="font-semibold text-gray-900">{isCreate ? '新增分组' : '编辑分组'}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">分组名称</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder={selUsers.size > 0 ? userOptions.filter(u => selUsers.has(u.id)).map(u => u.username || u.email.split('@')[0]).join(' · ') : '留空则自动使用成员名称'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                组员{selUsers.size > 0 && <span className="ml-1.5 text-green-600">（已选 {selUsers.size} 人）</span>}
              </label>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {userOptions.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-gray-400">加载中...</div>
                ) : userOptions.map(u => {
                  const isSelected = selUsers.has(u.id)
                  const mType = mTypes[u.id] || 'app'
                  return (
                    <div key={u.id} className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                      <input
                        type="checkbox" checked={isSelected}
                        onChange={e => {
                          const next = new Set(selUsers)
                          const nextTypes = { ...mTypes }
                          if (e.target.checked) { next.add(u.id); nextTypes[u.id] = nextTypes[u.id] || 'app' }
                          else { next.delete(u.id); delete nextTypes[u.id] }
                          setSelUsers(next); setMTypes(nextTypes)
                        }}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900">{u.username || u.email.split('@')[0]}</span>
                        <span className="ml-1.5 text-xs text-gray-400">{u.email}</span>
                      </div>
                      {isSelected && (
                        <div className="flex gap-1 flex-shrink-0">
                          {(['app', 'game'] as const).map(t => (
                            <button key={t}
                              onClick={() => setMTypes(prev => ({ ...prev, [u.id]: t }))}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                                mType === t
                                  ? t === 'app' ? 'bg-blue-500 text-white border-blue-500' : 'bg-purple-500 text-white border-purple-500'
                                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
                              }`}
                            >{t === 'app' ? '应用' : '游戏'}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 flex-shrink-0">
            <button onClick={onClose} className="btn-ghost">取消</button>
            <button onClick={onSubmit} disabled={busy || selUsers.size === 0} className="btn-primary disabled:opacity-50">
              {busy ? (isCreate ? '创建中...' : '保存中...') : (isCreate ? '创建分组' : '保存')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  function KeywordRow({ keyword, volume, source, onDoubleClick }: {
    keyword: string; volume: number; source: string; onDoubleClick: () => void
  }) {
    const claimed = claimedSet.has(keyword)
    return (
      <tr
        onDoubleClick={onDoubleClick}
        className={`border-b border-gray-50 last:border-0 cursor-pointer select-none transition-colors ${claimed ? 'bg-green-50/50' : 'hover:bg-gray-50'}`}
        title={claimed ? '已认领' : '双击认领'}
      >
        <td className="px-3 py-2">
          <span className="text-sm text-gray-800" title={keyword}>{keyword.length > 22 ? keyword.slice(0, 22) + '…' : keyword}</span>
          {claimed && <span className="ml-1.5 text-[10px] text-green-500">✓</span>}
        </td>
        <td className="px-3 py-2 text-right text-xs text-gray-400 w-20">{fmtVol(volume)}</td>
        <td className="px-2 py-2 text-right w-14"><SourceTag s={source} /></td>
      </tr>
    )
  }

  function RightContent() {
    if (rightTab === 'search') {
      const totalPages = Math.ceil(searchTotal / 50)
      return (
        <div>
          <div className="flex gap-2 mb-4">
            <input
              type="text" value={searchQuery}
              onChange={e => {
                const q = e.target.value; setSearchQuery(q)
                if (searchTimer.current) clearTimeout(searchTimer.current)
                searchTimer.current = setTimeout(() => doSearch(q, 0), 400)
              }}
              onKeyDown={e => { if (e.key === 'Enter') { if (searchTimer.current) clearTimeout(searchTimer.current); doSearch(searchQuery, 0) } }}
              placeholder="输入关键词搜索..."
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {searchLoading ? <Spinner /> : searchResults.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">{searchQuery ? '无结果' : '输入关键词开始搜索'}</div>
          ) : (
            <>
              <div className="text-xs text-gray-400 mb-2">共 {searchTotal} 条，双击认领</div>
              <table className="w-full">
                <tbody>
                  {searchResults.map((r, i) => (
                    <KeywordRow key={`${r.keyword}|${i}`} keyword={r.keyword} volume={r.volume} source="搜索量查询"
                      onDoubleClick={() => claimKeyword(r.keyword, viewingMemberType, '搜索量查询', r.volume)}
                    />
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4 text-sm">
                  <button onClick={() => doSearch(searchQuery, searchPage - 1)} disabled={searchPage === 0} className="px-3 py-1 border border-gray-200 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-40">上一页</button>
                  <span className="text-gray-400">{searchPage + 1} / {totalPages}</span>
                  <button onClick={() => doSearch(searchQuery, searchPage + 1)} disabled={searchPage >= totalPages - 1} className="px-3 py-1 border border-gray-200 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-40">下一页</button>
                </div>
              )}
            </>
          )}
        </div>
      )
    }

    if (!radarLoaded || radarLoading) return <Spinner />

    if (rightTab === 'latest') {
      return latestKeywords.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">今日暂无新词</div>
      ) : (
        <>
          <div className="text-xs text-gray-400 mb-2">共 {latestKeywords.length} 条今日新词，双击认领</div>
          <table className="w-full">
            <tbody>
              {latestKeywords.map((r, i) => (
                <KeywordRow key={`${r.keyword}|${i}`} keyword={r.keyword} volume={r.volume} source={r.source}
                  onDoubleClick={() => claimKeyword(r.keyword, viewingMemberType, '最新词库', r.volume)}
                />
              ))}
            </tbody>
          </table>
        </>
      )
    }

    if (rightTab === 'competitor') {
      const rows = competitorSubTab === 'rank'
        ? (radarData?.rankWords || []).map(w => ({ keyword: w.keyword, volume: w.volume, source: '竞品涨排名' as const }))
        : (radarData?.streakWords || []).map(w => ({ keyword: w.keyword, volume: w.volume, source: '连续上涨词' as const }))
      return (
        <>
          <div className="flex gap-1 mb-4">
            {(['rank', 'streak'] as const).map(t => (
              <button key={t} onClick={() => setCompetitorSubTab(t)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  competitorSubTab === t ? 'bg-gray-100 text-gray-800' : 'text-gray-400 hover:text-gray-600'
                }`}
              >{t === 'rank' ? '竞品涨排名' : '连续上涨词'}</button>
            ))}
          </div>
          {rows.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">暂无数据</div>
          ) : (
            <>
              <div className="text-xs text-gray-400 mb-2">共 {rows.length} 条，双击认领</div>
              <table className="w-full">
                <tbody>
                  {rows.map((r, i) => (
                    <KeywordRow key={`${r.keyword}|${i}`} keyword={r.keyword} volume={r.volume} source={r.source}
                      onDoubleClick={() => claimKeyword(r.keyword, viewingMemberType, r.source, r.volume)}
                    />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )
    }

    if (rightTab === 'shared') {
      return (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {(['newWords', 'wordLib'] as const).map(t => (
                <button key={t} onClick={() => setSharedSubTab(t)}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                    sharedSubTab === t ? 'bg-gray-100 text-gray-800' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >{t === 'newWords' ? '共新增词' : '更新词库'}</button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['app', 'game'] as const).map(t => (
                <button key={t} onClick={() => setSharedTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium border transition-colors ${
                    sharedTypeFilter === t
                      ? t === 'app' ? 'bg-blue-500 text-white border-blue-500' : 'bg-purple-500 text-white border-purple-500'
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >{t === 'app' ? '应用' : '游戏'}</button>
              ))}
            </div>
          </div>
          {sharedWords.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">暂无数据</div>
          ) : (
            <>
              <div className="text-xs text-gray-400 mb-2">共 {sharedWords.length} 条，双击认领</div>
              <table className="w-full">
                <tbody>
                  {sharedWords.map((w, i) => (
                    <KeywordRow key={`${w.keyword}|${i}`} keyword={w.keyword} volume={0} source={sharedSubTab === 'newWords' ? '共新增词' : '更新词库'}
                      onDoubleClick={() => claimKeyword(w.keyword, sharedTypeFilter, sharedSubTab === 'newWords' ? '共新增词' : '更新词库', 0)}
                    />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )
    }

    return null
  }

  if (loading) {
    return (
      <div className="p-6"><Spinner /></div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">分组任务</h1>
          <p className="text-gray-400 text-sm mt-0.5">按分组认领今日关键词</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={openCreateModal} className="btn-primary">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新增分组
            </button>
            {activeGroup && (
              <button onClick={openEditModal} className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 transition-colors">编辑分组</button>
            )}
            {activeGroup && (
              <button onClick={() => setDeleteId(activeGroup.id)} className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md border border-red-300 text-red-400 hover:bg-red-50 transition-colors">删除分组</button>
            )}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-sm">{canManage ? '还没有分组，点击右上角新增' : '你尚未加入任何分组'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Group tabs */}
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-0 border-b border-gray-100 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            {groups.map(g => (
              <button key={g.id}
                onClick={() => { setActiveGroupId(g.id); setViewingMemberId(currentUserId || null) }}
                className={`px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap border-b-2 transition-colors ${
                  activeGroupId === g.id ? 'border-green-500 text-green-700 bg-green-50/60' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >{g.name}</button>
            ))}
          </div>

          {activeGroup && (
            <div className="flex" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
              {/* Left panel */}
              <div className="w-[300px] flex-shrink-0 border-r border-gray-100 flex flex-col">
                {canManage && activeGroup.members.length > 0 && (
                  <div className="px-3 pt-3 pb-2 flex flex-wrap gap-1.5 border-b border-gray-50">
                    {activeGroup.members.map(m => (
                      <button key={m.user_id}
                        onClick={() => setViewingMemberId(m.user_id)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
                          effectiveViewingId === m.user_id ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}
                      >
                        {m.username}
                        {m.member_type && m.member_type !== 'both' && (
                          <span className={`ml-1 ${effectiveViewingId === m.user_id ? 'opacity-60' : m.member_type === 'app' ? 'text-blue-400' : 'text-purple-400'}`}>
                            {m.member_type === 'app' ? '应' : '游'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex border-b border-gray-100">
                  {completionTabs.map(type => (
                    <button key={type} onClick={() => setActiveCompletionType(type)}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                        activeCompletionType === type
                          ? type === 'app' ? 'text-blue-600' : 'text-purple-600'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {activeCompletionType === type && (
                        <span className={`absolute bottom-0 left-0 right-0 h-0.5 ${type === 'app' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                      )}
                      {type === 'app' ? '应用' : '游戏'}今日完成
                      <span className="ml-1 text-xs text-gray-400">
                        {type === 'app' ? appKeywords.length : gameKeywords.length}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {claimedLoading ? <Spinner /> : activeCompletionKeywords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-300 text-sm py-12">
                      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      暂无认领词
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {activeCompletionKeywords.map(k => (
                        <div key={k.id} className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors ${k.status !== 'pending' ? 'opacity-55' : ''}`}>
                          {isViewingOwn && k.status === 'pending' ? (
                            <button onClick={() => dismissClaimed(k.id)}
                              className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors text-sm leading-none"
                            >×</button>
                          ) : (
                            <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center text-xs ${k.status !== 'pending' ? 'text-green-400' : ''}`}>
                              {k.status !== 'pending' ? '✓' : ''}
                            </span>
                          )}
                          <span className="flex-1 text-sm text-gray-800 truncate" title={k.keyword}>{k.keyword}</span>
                          <SourceTag s={k.source} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isViewingOwn && (
                  <div className="p-3 border-t border-gray-100">
                    <button onClick={submitToday} disabled={submitting || pendingCount === 0}
                      className="w-full py-2 text-sm font-medium rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? '提交中...' : `今日提交${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
                    </button>
                  </div>
                )}
              </div>

              {/* Right panel */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex border-b border-gray-100 overflow-x-auto flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
                  {([ ['latest', '最新词库'], ['search', '搜索量查询'], ['competitor', '竞品涨排名/连续上涨词'], ['shared', '共新增词/更新词库'] ] as [RightTab, string][]).map(([tab, label]) => (
                    <button key={tab} onClick={() => setRightTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        rightTab === tab ? 'border-green-500 text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}
                    >{label}</button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <RightContent />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && <MemberModal mode="create" onClose={() => setShowCreate(false)} />}
      {showEdit && activeGroup && <MemberModal mode="edit" onClose={() => setShowEdit(false)} />}

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
    </div>
  )
}
