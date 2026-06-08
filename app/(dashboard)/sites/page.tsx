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
  crawl_type: 'sitemap' | 'html' | 'rss'
  list_url: string
  title_selector: string
  date_selector: string
  crawl_frequency: 'daily' | 'every3days' | 'weekly'
  enable_version_clean: boolean
  version_suffixes: string[]
  is_enabled: boolean
  created_at: string
}

export default function SitesPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editSite, setEditSite] = useState<Site | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  function handleModalClose() {
    setShowModal(false)
    setEditSite(null)
  }

  function handleSaved() {
    handleModalClose()
    loadSites()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">网站管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理所有监控站点的抓取配置</p>
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
        ) : (
          <SiteTable
            sites={sites}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggle={handleToggle}
          />
        )}
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
