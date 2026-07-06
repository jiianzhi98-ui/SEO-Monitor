'use client'

import { useEffect, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase'
import SiteTable from '@/components/site-table'
import AddSiteModal from '@/components/add-site-modal'

interface Site {
  id: string
  domain: string
  name: string
  category: 'large' | 'medium' | 'small'
  crawl_type: 'html'
  focus_level: number
  list_url: string
  title_selector: string
  date_selector: string
  source_types: string
  crawl_frequency: 'daily'
  enable_version_clean: boolean
  version_suffixes: string[]
  friend_links: string[]
  is_enabled: boolean
  has_rank_data: boolean
  has_rank_title: boolean
  created_at: string
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [filterSite, setFilterSite] = useState('')
  const [filterFocus, setFilterFocus] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  async function loadSites() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sites')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '加载失败')
      setSites(data.sites || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSites() }, [])

  function handleEdit(site: Site) {
    setEditSite(site)
    setShowModal(true)
  }

  async function handleDelete(site: Site) {
    if (!confirm(`确认删除 ${site.domain}？此操作不可恢复。`)) return
    setDeletingId(site.id)
    try {
      const res = await fetch('/api/sites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: site.id }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '删除失败')
      }
      await loadSites()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleToggle(site: Site) {
    try {
      const res = await fetch('/api/sites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...site, is_enabled: !site.is_enabled }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '更新失败')
      }
      setSites((prev) =>
        prev.map((s) => s.id === site.id ? { ...s, is_enabled: !s.is_enabled } : s)
      )
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '更新失败')
    }
  }

  async function handleToggleRank(site: Site) {
    const newVal = !site.has_rank_data
    try {
      const res = await fetch('/api/sites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Enabling 排名 clears 竞品追踪 (mutual exclusion)
        body: JSON.stringify({ ...site, has_rank_data: newVal, has_rank_title: newVal ? false : site.has_rank_title }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '更新失败')
      }
      setSites((prev) =>
        prev.map((s) => s.id === site.id ? { ...s, has_rank_data: newVal, has_rank_title: newVal ? false : s.has_rank_title } : s)
      )
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '更新失败')
    }
  }

  async function handleToggleRankTitle(site: Site) {
    const newVal = !site.has_rank_title
    try {
      const res = await fetch('/api/sites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Enabling 竞品追踪 clears 排名 (mutual exclusion)
        body: JSON.stringify({ ...site, has_rank_title: newVal, has_rank_data: newVal ? false : site.has_rank_data }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '更新失败')
      }
      setSites((prev) =>
        prev.map((s) => s.id === site.id ? { ...s, has_rank_title: newVal, has_rank_data: newVal ? false : s.has_rank_data } : s)
      )
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '更新失败')
    }
  }

  function handleModalClose() {
    setShowModal(false)
    setEditSite(null)
  }

  function handleSaved() {
    handleModalClose()
    loadSites()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">网站管理</h1>
          <p className="text-gray-400 text-sm mt-0.5">管理所有监控站点的抓取配置</p>
        </div>
        <button
          onClick={() => { setEditSite(null); setShowModal(true) }}
          className="btn-primary"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          新增网站
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-3">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            加载中...
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600 text-sm">{error}</div>
          </div>
        ) : (() => {
          const filteredSites = sites.filter(s => {
            if (filterSite && !s.domain.toLowerCase().includes(filterSite.toLowerCase()) && !s.name?.toLowerCase().includes(filterSite.toLowerCase())) return false
            if (filterFocus && String(s.focus_level) !== filterFocus) return false
            if (filterCategory && s.category !== filterCategory) return false
            return true
          })
          return (
            <>
              <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">站点</span>
                  <input
                    type="text"
                    value={filterSite}
                    onChange={(e) => setFilterSite(e.target.value)}
                    placeholder="输入域名..."
                    className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none w-36"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">关注级别</span>
                  <select value={filterFocus} onChange={(e) => setFilterFocus(e.target.value)} className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none">
                    <option value="">全部</option>
                    <option value="1">重点</option>
                    <option value="2">侧重</option>
                    <option value="3">普通</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">分类</span>
                  <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none">
                    <option value="">全部</option>
                    <option value="large">大站</option>
                    <option value="medium">中站</option>
                    <option value="small">小站</option>
                  </select>
                </div>
                <span className="ml-auto text-xs text-gray-400">共 {filteredSites.length} 条</span>
              </div>
              <SiteTable
                sites={filteredSites}
                allSites={sites}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
                onToggleRank={handleToggleRank}
                onToggleRankTitle={handleToggleRankTitle}
              />
            </>
          )
        })()}
      </div>

      {showModal && (
        <AddSiteModal
          site={editSite}
          onClose={handleModalClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
