'use client'

import { useState, useEffect } from 'react'

interface Site {
  id?: string
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
}

interface PreviewRow {
  original: string
  cleaned: string
}

interface AddSiteModalProps {
  site?: Site | null
  onClose: () => void
  onSaved: () => void
}

const defaultForm: Site = {
  domain: '',
  name: '',
  category: 'medium',
  crawl_type: 'sitemap',
  list_url: '',
  title_selector: '',
  date_selector: '',
  crawl_frequency: 'daily',
  enable_version_clean: false,
  version_suffixes: [],
  is_enabled: true,
}

export default function AddSiteModal({ site, onClose, onSaved }: AddSiteModalProps) {
  const [form, setForm] = useState<Site>(site ? { ...site } : { ...defaultForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newSuffix, setNewSuffix] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewRow[] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    setForm(site ? { ...site } : { ...defaultForm })
    setPreviewData(null)
    setPreviewError(null)
  }, [site])

  function update<K extends keyof Site>(key: K, value: Site[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addSuffix() {
    const s = newSuffix.trim()
    if (!s || form.version_suffixes.includes(s)) return
    update('version_suffixes', [...form.version_suffixes, s])
    setNewSuffix('')
  }

  function removeSuffix(s: string) {
    update('version_suffixes', form.version_suffixes.filter((x) => x !== s))
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreviewData(null)
    setPreviewError(null)
    try {
      const res = await fetch('/api/crawl/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: form.list_url || form.domain,
          type: form.crawl_type,
          titleSelector: form.title_selector,
          dateSelector: form.date_selector,
          enableVersionClean: form.enable_version_clean,
          suffixes: form.version_suffixes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '预览失败')
      setPreviewData(data.items)
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : '预览失败')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const method = form.id ? 'PUT' : 'POST'
      const res = await fetch('/api/sites', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存失败')
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {form.id ? '编辑网站' : '新增网站'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Domain */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">域名</label>
              <input
                type="text"
                value={form.domain}
                onChange={(e) => update('domain', e.target.value)}
                placeholder="example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">站点名称</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="站点显示名称"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Category & Crawl Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
              <select
                value={form.category}
                onChange={(e) => update('category', e.target.value as Site['category'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="large">大站</option>
                <option value="medium">中站</option>
                <option value="small">小站</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">抓取类型</label>
              <select
                value={form.crawl_type}
                onChange={(e) => update('crawl_type', e.target.value as Site['crawl_type'])}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="sitemap">Sitemap</option>
                <option value="html">HTML列表页</option>
                <option value="rss">RSS</option>
              </select>
            </div>
          </div>

          {/* List URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">列表页URL</label>
            <input
              type="url"
              value={form.list_url}
              onChange={(e) => update('list_url', e.target.value)}
              placeholder="https://example.com/sitemap.xml"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          {/* HTML-only selectors */}
          {form.crawl_type === 'html' && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题CSS选择器</label>
                <input
                  type="text"
                  value={form.title_selector}
                  onChange={(e) => update('title_selector', e.target.value)}
                  placeholder=".article-title a"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">日期CSS选择器</label>
                <input
                  type="text"
                  value={form.date_selector}
                  onChange={(e) => update('date_selector', e.target.value)}
                  placeholder=".pub-date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          )}

          {/* Crawl Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">抓取频率</label>
            <div className="flex gap-3">
              {[
                { value: 'daily', label: '每天' },
                { value: 'every3days', label: '每3天' },
                { value: 'weekly', label: '每周' },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="crawl_frequency"
                    value={opt.value}
                    checked={form.crawl_frequency === opt.value}
                    onChange={() => update('crawl_frequency', opt.value as Site['crawl_frequency'])}
                    className="text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Version Clean */}
          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div
                onClick={() => update('enable_version_clean', !form.enable_version_clean)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.enable_version_clean ? 'bg-green-600' : 'bg-gray-300'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  form.enable_version_clean ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-sm font-medium text-gray-700">启用版本号清洗</span>
            </label>

            {form.enable_version_clean && (
              <div className="mt-3 p-4 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-2">版本号后缀词（清洗时连同版本号一起删除）</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.version_suffixes.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-700"
                    >
                      {s}
                      <button
                        onClick={() => removeSuffix(s)}
                        className="text-gray-400 hover:text-red-500 ml-0.5"
                      >×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSuffix}
                    onChange={(e) => setNewSuffix(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addSuffix()}
                    placeholder="输入后缀词，如：破解版"
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={addSuffix}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                  >
                    添加
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Preview Button */}
          <div>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || !form.list_url}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              {previewing ? (
                <span className="flex items-center gap-1.5">
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  预览中...
                </span>
              ) : '预览抓取'}
            </button>

            {previewError && (
              <p className="mt-2 text-xs text-red-600">{previewError}</p>
            )}

            {previewData && previewData.length > 0 && (
              <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 border-b border-gray-200">
                  抓取预览（前{previewData.length}条）
                </div>
                <div className="divide-y divide-gray-100">
                  {previewData.map((row, i) => (
                    <div key={i} className="px-3 py-2">
                      <p className="text-xs text-gray-500">原始：{row.original}</p>
                      {row.original !== row.cleaned && (
                        <p className="text-xs text-green-700 mt-0.5">清洗：{row.cleaned}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={onClose} className="btn-secondary">取消</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
