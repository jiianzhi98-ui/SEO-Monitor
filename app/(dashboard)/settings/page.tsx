'use client'

import { useState, useEffect, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import { useUser } from '@/lib/user-context'
import type { UserRole } from '@/lib/user-context'

interface UserRecord {
  id: string
  email: string
  username: string | null
  role: UserRole
  created_at: string
}

interface RestrictedSite {
  id: string
  domain: string
  name: string
  focus_level: number
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const roleConfig: Record<UserRole, { label: string; className: string }> = {
  super:  { label: '超级',   className: 'bg-red-50 text-red-600 border border-red-200' },
  admin:  { label: '管理员', className: 'bg-blue-50 text-blue-600 border border-blue-200' },
  normal: { label: '普通',   className: 'bg-gray-50 text-gray-500 border border-gray-200' },
}

function RoleBadge({ role }: { role: UserRole }) {
  const { label, className } = roleConfig[role]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}

// ─── Change password modal ────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (newPwd.length < 6) return setMsg({ type: 'error', text: '密码至少 6 位' })
    if (newPwd !== confirm) return setMsg({ type: 'error', text: '两次密码不一致' })
    setLoading(true)
    const supabase = getBrowserClient()
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: error.message })
    } else {
      setMsg({ type: 'success', text: '密码修改成功' })
      setNewPwd(''); setConfirm('')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">修改密码</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">新密码</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required placeholder="至少 6 位"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">确认密码</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="再次输入"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          {msg && (
            <div className={`rounded-lg px-4 py-3 text-sm ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {loading ? '保存中...' : '保存密码'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Add user modal ───────────────────────────────────────────────────────────

function AddUserModal({ callerRole, onClose, onCreated }: {
  callerRole: UserRole
  onClose: () => void
  onCreated: (user: UserRecord) => void
}) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('normal')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleOptions: UserRole[] = callerRole === 'super' ? ['super', 'admin', 'normal'] : ['normal']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim()) return setError('请填写用户名')
    setLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), email, password, role }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? '创建失败')
    } else {
      onCreated(data.user)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">新增账号</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">用户名 <span className="text-red-500">*</span></label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required placeholder="登录时使用的用户名"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱（仅系统使用）</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="user@example.com"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">初始密码</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="至少 6 位"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">权限</label>
            <select value={role} onChange={e => setRole(e.target.value as UserRole)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent">
              {roleOptions.map(r => (
                <option key={r} value={r}>{roleConfig[r].label}</option>
              ))}
            </select>
          </div>
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-600">{error}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {loading ? '创建中...' : '创建账号'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Edit role modal ──────────────────────────────────────────────────────────

function EditRoleModal({ user, callerRole, onClose, onUpdated }: {
  user: UserRecord
  callerRole: UserRole
  onClose: () => void
  onUpdated: (id: string, role: UserRole) => void
}) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const roleOptions: UserRole[] = callerRole === 'super' ? ['super', 'admin', 'normal'] : ['admin', 'normal']

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? '修改失败')
    } else {
      onUpdated(user.id, role)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">修改权限</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{user.email}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">权限</label>
            <select value={role} onChange={e => setRole(e.target.value as UserRole)}
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent">
              {roleOptions.map(r => (
                <option key={r} value={r}>{roleConfig[r].label}</option>
              ))}
            </select>
          </div>
          {error && (
            <div className="rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-600">{error}</div>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {loading ? '保存中...' : '保存'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Site access modal ────────────────────────────────────────────────────────

function SiteAccessModal({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const [sites, setSites] = useState<RestrictedSite[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/users/${user.id}/access`)
      .then(r => r.json())
      .then(({ restrictedSites, grantedSiteIds }) => {
        setSites(restrictedSites ?? [])
        setChecked(new Set(grantedSiteIds ?? []))
        setLoading(false)
      })
  }, [user.id])

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/users/${user.id}/access`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteIds: Array.from(checked) }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? '保存失败')
    } else {
      onClose()
    }
  }

  const focusLabel: Record<number, string> = { 1: '重点', 2: '侧重' }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-semibold text-gray-900">站点权限</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">{user.email} · 勾选后该用户可看到对应站点</p>

        {loading ? (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">加载中...</div>
        ) : sites.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">暂无重点/侧重站点</div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2 mb-4">
            {sites.map(site => (
              <label key={site.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={checked.has(site.id)} onChange={() => toggle(site.id)}
                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  site.focus_level === 1 ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                }`}>{focusLabel[site.focus_level]}</span>
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 font-medium truncate">{site.name}</p>
                  <p className="text-xs text-gray-400 truncate">{site.domain}</p>
                </div>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-600 mb-4">{error}</div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { role: myRole } = useUser()
  const isManager = myRole === 'super' || myRole === 'admin'

  // ── Normal user: just change password ──
  if (!isManager) {
    return <NormalSettings />
  }

  return <ManagerSettings callerRole={myRole} />
}

// ─── Normal settings (change password) ───────────────────────────────────────

function NormalSettings() {
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (newPwd.length < 6) return setMsg({ type: 'error', text: '密码至少 6 位' })
    if (newPwd !== confirm) return setMsg({ type: 'error', text: '两次密码不一致' })
    setLoading(true)
    const supabase = getBrowserClient()
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setLoading(false)
    if (error) {
      setMsg({ type: 'error', text: error.message })
    } else {
      setMsg({ type: 'success', text: '密码修改成功' })
      setNewPwd(''); setConfirm('')
    }
  }

  return (
    <div className="p-8 max-w-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">账户设置</h1>
        <p className="text-gray-500 text-sm mt-1">修改登录密码</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">修改密码</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">新密码</label>
            <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required placeholder="至少 6 位"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">确认密码</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="再次输入"
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent" />
          </div>
          {msg && (
            <div className={`rounded-lg px-4 py-3 text-sm ${msg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'}`}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {loading ? '保存中...' : '保存密码'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Manager settings (account management) ────────────────────────────────────

function ManagerSettings({ callerRole }: { callerRole: UserRole }) {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showAddUser, setShowAddUser] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [accessUser, setAccessUser] = useState<UserRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  async function handleDelete(user: UserRecord) {
    if (!confirm(`确定要删除账号 ${user.username ?? user.email}？此操作不可撤销。`)) return
    setDeletingId(user.id)
    await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    setDeletingId(null)
    setUsers(prev => prev.filter(u => u.id !== user.id))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">账户设置</h1>
          <p className="text-gray-500 text-sm mt-1">管理所有账号与访问权限</p>
        </div>
        <button
          onClick={() => setShowChangePwd(true)}
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          修改密码
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">账号管理</h2>
          <button
            onClick={() => setShowAddUser(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增账号
          </button>
        </div>

        {loading ? (
          <div className="h-32 flex items-center justify-center text-gray-400 text-sm">加载中...</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">用户名</th>
                <th className="table-th">权限</th>
                <th className="table-th">注册时间</th>
                <th className="table-th text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="table-td">
                    <p className="text-sm text-gray-800 font-medium">{user.username ?? <span className="text-gray-400 italic text-xs">未设置</span>}</p>
                    <p className="text-xs text-gray-400">{user.email}</p>
                  </td>
                  <td className="table-td"><RoleBadge role={user.role} /></td>
                  <td className="table-td text-gray-500 text-xs">
                    {new Date(user.created_at).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="table-td text-right">
                    <div className="flex items-center justify-end gap-2">
                      {user.role === 'normal' && (
                        <button
                          onClick={() => setAccessUser(user)}
                          className="text-xs text-purple-600 hover:text-purple-700 px-2 py-1 rounded hover:bg-purple-50 transition-colors"
                        >
                          站点权限
                        </button>
                      )}
                      {/* admin cannot edit super users */}
                      {!(callerRole === 'admin' && user.role === 'super') && (
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-xs text-gray-600 hover:text-green-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          编辑
                        </button>
                      )}
                      {!(callerRole === 'admin' && user.role === 'super') && (
                        <button
                          onClick={() => handleDelete(user)}
                          disabled={deletingId === user.id}
                          className="text-xs text-gray-600 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100 transition-colors disabled:opacity-40"
                        >
                          {deletingId === user.id ? '删除中...' : '删除'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)} />}
      {showAddUser && (
        <AddUserModal
          callerRole={callerRole}
          onClose={() => setShowAddUser(false)}
          onCreated={user => setUsers(prev => [user, ...prev])}
        />
      )}
      {editingUser && (
        <EditRoleModal
          user={editingUser}
          callerRole={callerRole}
          onClose={() => setEditingUser(null)}
          onUpdated={(id, role) => setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u))}
        />
      )}
      {accessUser && (
        <SiteAccessModal user={accessUser} onClose={() => setAccessUser(null)} />
      )}
    </div>
  )
}
